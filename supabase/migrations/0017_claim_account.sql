-- =============================================================================
-- 0017_claim_account.sql — the optional student account.
--
-- A student joins anonymously and plays. If, at the end, they want to keep their
-- results, they link an identity (email+password, or Google) to the account they
-- ALREADY have. Supabase keeps the same auth.users.id through that conversion,
-- so every players row they own is theirs retroactively: no row migration, no
-- merge step, and every RLS policy keyed on auth_uid = auth.uid() keeps working.
--
-- The client does the linking (auth.updateUser / auth.linkIdentity). This file
-- adds the two things the client must NOT be trusted with: creating the profile
-- row only once the account is genuinely permanent, and reading history across
-- sessions the caller is no longer a member of.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- claim_my_account — create the profile row for a converted guest.
--
-- 0016's trigger fires on INSERT into auth.users, so a user who STARTED
-- anonymous never got a profile. This is where they get one, and the
-- is_anonymous flag is re-read from auth.users rather than taken from the
-- caller: a client claiming "I am permanent now" proves nothing.
-- ---------------------------------------------------------------------------
create or replace function public.claim_my_account(
  p_username     text,
  p_display_name text default null
)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_anon boolean;
  v_name text := trim(coalesce(p_username, ''));
  v_disp text := trim(coalesce(p_display_name, ''));
  v_row  public.profiles;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;

  select coalesce(u.is_anonymous, false) into v_anon
    from auth.users u where u.id = v_uid;
  if v_anon is null then raise exception 'no such account'; end if;
  if v_anon then
    raise exception 'add an email or Google sign-in before claiming this account';
  end if;

  if v_name !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'username must be 3-24 characters: letters, numbers, underscore';
  end if;
  if exists (select 1 from public.profiles p
               where lower(p.username) = lower(v_name) and p.id <> v_uid) then
    raise exception 'that username is taken';
  end if;

  insert into public.profiles (id, username, display_name)
  values (v_uid, v_name, left(coalesce(nullif(v_disp, ''), v_name), 80))
  on conflict (id) do update
     set username     = excluded.username,
         display_name = coalesce(nullif(excluded.display_name, ''),
                                 public.profiles.display_name),
         updated_at   = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.claim_my_account(text, text) from public;
grant execute on function public.claim_my_account(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_history — the payoff for claiming: every session this account played.
--
-- SECURITY DEFINER because a finished session is no longer readable through the
-- sessions_select policy path for a student in every configuration; the filter
-- is auth_uid = auth.uid() and nothing else, so it can only ever return the
-- caller's own rows. Bots are excluded from both the rank and the total.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_history()
returns table (
  session_id   uuid,
  played_at    timestamptz,
  status       text,
  display_name text,
  final_wealth numeric,
  rank         int,
  total        int
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    m.session_id,
    m.joined_at,
    s.status,
    m.display_name,
    m.current_wealth,
    (select count(*)::int + 1 from public.players o
      where o.session_id = m.session_id and not o.is_bot
        and o.current_wealth > m.current_wealth),
    (select count(*)::int from public.players o
      where o.session_id = m.session_id and not o.is_bot)
  from public.players m
  join public.sessions s on s.id = m.session_id
  where m.auth_uid = auth.uid()   -- null uid matches nothing: no session, no rows
    and not m.is_bot
  order by m.joined_at desc;
$$;

revoke all on function public.get_my_history() from public;
grant execute on function public.get_my_history() to authenticated;
