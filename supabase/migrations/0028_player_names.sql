-- =============================================================================
-- 0028_player_names.sql — player names the host can trust on a projector.
--
-- 1. A student could rename themself to anything, at any time.
--    0002 granted `update (display_name)` on players with no check on the value.
--    join_session clamped the name to 40 characters, but a direct PostgREST
--    update skipped that: 200,000 characters, an empty string, control
--    characters, a spreadsheet formula — all stored, and all shown on the
--    projector. Renames also worked mid-game and after the game had finished,
--    rewriting a class's results after the fact.
--    Now: a CHECK on the column (1–40 characters, not blank) that holds on every
--    path, the direct update grant is gone, and renaming goes through
--    set_my_display_name(), which cleans the name and works in the lobby only
--    (the only place the UI ever offered it).
--
-- 2. The host had no way to deal with a bad name.
--    host_rename_player() and host_remove_player(). Removing deletes the player
--    row (and, by cascade, their allocations) and records the account in
--    session_removed_players, which join_session checks, so the same browser
--    cannot simply rejoin with the code.
--
-- 3. Students could read each other's auth_uid.
--    With the leaderboard on (the default), players_select shows a student every
--    classmate's row, and the table grant covered every column. auth_uid grants
--    nothing on its own, but it is a stable identifier that links a person
--    across sessions, and no screen needs it. SELECT is now column-scoped and
--    leaves auth_uid out; a student finds their own row with get_my_player_id().
--    Policies still reference auth_uid — RLS expressions are not subject to
--    column privileges. Realtime payloads omit columns the subscriber cannot
--    select, so the live player list keeps working without it.
-- =============================================================================

-- ---- the one definition of a clean name ------------------------------------
-- Control characters, zero-width characters and bidirectional overrides are
-- removed (the last two can make one name look like another, or reverse the
-- text around it), then the result is trimmed to 40 characters. Blank falls
-- back to 'Player', which is what join_session always did.
create or replace function public._clean_display_name(p_name text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    nullif(btrim(left(btrim(regexp_replace(
      coalesce(p_name, ''),
      '[[:cntrl:]­​-‏‪-‮⁠-⁩﻿]', '', 'g')), 40)), ''),
    'Player');
$$;

revoke all on function public._clean_display_name(text) from public, anon, authenticated;

-- ---- 1. the column itself ----------------------------------------------------
-- Existing rows first, or the constraint cannot be added.
update public.players
   set display_name = public._clean_display_name(display_name)
 where display_name is distinct from public._clean_display_name(display_name);

alter table public.players drop constraint if exists players_display_name_chk;
alter table public.players add constraint players_display_name_chk
  check (char_length(display_name) between 1 and 40 and btrim(display_name) <> '');

-- No more direct writes to players from any client.
drop policy if exists players_update_self on public.players;
revoke update on public.players from authenticated;

-- ---- removed players ---------------------------------------------------------
create table if not exists public.session_removed_players (
  session_id uuid not null references public.sessions (id) on delete cascade,
  auth_uid   uuid not null references auth.users (id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (session_id, auth_uid)
);

-- Same shape as session_secrets: RLS on, no policies, no grants.
alter table public.session_removed_players enable row level security;
revoke all on public.session_removed_players from anon, authenticated;

comment on table public.session_removed_players is
  'Accounts a host removed from a session; join_session refuses them. '
  'RLS on, no policies, no grants.';

-- ---- join_session: 0003's body, plus the clean name and the removal check ----
create or replace function public.join_session(p_join_code text, p_display_name text)
returns public.players
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_player  public.players%rowtype;
  v_start   numeric;
begin
  if v_uid is null then
    raise exception 'must be signed in to join';
  end if;

  select * into v_session from public.sessions
    where join_code = upper(trim(p_join_code));
  if not found then
    raise exception 'invalid join code';
  end if;

  if exists (select 1 from public.session_removed_players r
              where r.session_id = v_session.id and r.auth_uid = v_uid) then
    raise exception 'the host removed you from this session';
  end if;

  -- existing player? return it (idempotent)
  select * into v_player from public.players
    where session_id = v_session.id and auth_uid = v_uid;
  if found then
    return v_player;
  end if;

  if v_session.status = 'finished' then
    raise exception 'this session has finished';
  end if;
  if v_session.status = 'active'
     and not coalesce((v_session.config->>'allow_late_join')::boolean, false) then
    raise exception 'late join is not allowed for this session';
  end if;

  v_start := coalesce((v_session.config->>'starting_wealth')::numeric, 100);

  insert into public.players (session_id, auth_uid, display_name, current_wealth)
  values (v_session.id, v_uid, public._clean_display_name(p_display_name), v_start)
  returning * into v_player;

  return v_player;
end;
$$;

-- ---- set_my_display_name — the student's rename, lobby only -----------------
create or replace function public.set_my_display_name(p_session_id uuid, p_display_name text)
returns public.players
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_player public.players%rowtype;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;

  select status into v_status from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_status <> 'lobby' then
    raise exception 'names can only be changed before the game starts';
  end if;

  update public.players
     set display_name = public._clean_display_name(p_display_name)
   where session_id = p_session_id and auth_uid = v_uid and not is_bot
  returning * into v_player;
  if not found then raise exception 'you are not a player in this session'; end if;

  return v_player;
end;
$$;

-- ---- host_rename_player — any status: a name is fixable after the fact ------
create or replace function public.host_rename_player(p_player_id uuid, p_display_name text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_player public.players%rowtype;
begin
  select * into v_player from public.players where id = p_player_id;
  if not found then raise exception 'player not found'; end if;
  if not public.is_session_host(v_player.session_id) then
    raise exception 'not authorized: host only';
  end if;
  if v_player.is_bot then raise exception 'benchmark players cannot be renamed'; end if;

  update public.players
     set display_name = public._clean_display_name(p_display_name)
   where id = p_player_id;
end;
$$;

-- ---- host_remove_player — not after the game: finished results stay put -----
create or replace function public.host_remove_player(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_player  public.players%rowtype;
  v_session public.sessions%rowtype;
begin
  select * into v_player from public.players where id = p_player_id;
  if not found then return; end if;  -- already gone: idempotent, like delete_session

  select * into v_session from public.sessions where id = v_player.session_id;
  if v_session.host_id is distinct from auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if v_player.is_bot then raise exception 'benchmark players cannot be removed'; end if;
  if v_session.status = 'finished' then
    raise exception 'a finished game''s results cannot be changed';
  end if;

  if v_player.auth_uid is not null then
    insert into public.session_removed_players (session_id, auth_uid)
    values (v_player.session_id, v_player.auth_uid)
    on conflict do nothing;
  end if;

  delete from public.players where id = p_player_id;  -- cascades their allocations
end;
$$;

-- ---- 3. auth_uid out of client reach ------------------------------------------
revoke select on public.players from authenticated;
grant select (id, session_id, display_name, current_wealth, is_active, joined_at,
              is_bot, strategy, purged_at)
  on public.players to authenticated;

-- The caller's own player id in a session, or NULL. The play screen needs it to
-- pick "me" out of a list that no longer carries auth_uid.
create or replace function public.get_my_player_id(p_session_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id from public.players p
   where p.session_id = p_session_id and p.auth_uid = auth.uid();  -- null uid: no row
$$;

revoke all on function public.set_my_display_name(uuid, text) from public, anon;
revoke all on function public.host_rename_player(uuid, text)  from public, anon;
revoke all on function public.host_remove_player(uuid)        from public, anon;
revoke all on function public.get_my_player_id(uuid)          from public, anon;
grant execute on function public.set_my_display_name(uuid, text) to authenticated;
grant execute on function public.host_rename_player(uuid, text)  to authenticated;
grant execute on function public.host_remove_player(uuid)        to authenticated;
grant execute on function public.get_my_player_id(uuid)          to authenticated;
