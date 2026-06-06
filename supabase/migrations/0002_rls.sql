-- =============================================================================
-- 0002_rls.sql — Row Level Security: default-deny + least-privilege policies.
--
-- Threat model: a curious student with browser dev tools and the public anon
-- key. They must NOT be able to inflate wealth, alter others' data, see others'
-- pending allocations, control the market, or impersonate the host.
--
-- Predicate helper functions are SECURITY DEFINER so they bypass RLS — this is
-- required to avoid infinite recursion (a policy on `players` that itself reads
-- `players`). They are STABLE and pin search_path to prevent hijacking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Predicate helpers (bypass RLS by design; read-only)
-- ---------------------------------------------------------------------------
create or replace function public.is_session_host(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.host_id = auth.uid()
  );
$$;

create or replace function public.is_session_member(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.host_id = auth.uid()
  ) or exists (
    select 1 from public.players p
    where p.session_id = p_session_id and p.auth_uid = auth.uid()
  );
$$;

create or replace function public.session_show_leaderboard(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select (s.config->>'show_full_leaderboard_to_students')::boolean
       from public.sessions s where s.id = p_session_id),
    false
  );
$$;

create or replace function public.is_my_player(p_player_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.players p
    where p.id = p_player_id and p.auth_uid = auth.uid()
  );
$$;

create or replace function public.round_is_open(p_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.rounds r where r.id = p_round_id and r.status = 'open'
  );
$$;

create or replace function public.is_host_of_round(p_round_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.rounds r
    join public.sessions s on s.id = r.session_id
    where r.id = p_round_id and s.host_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS (default-deny once enabled; we add only the policies below)
-- ---------------------------------------------------------------------------
alter table public.sessions    enable row level security;
alter table public.players     enable row level security;
alter table public.rounds      enable row level security;
alter table public.allocations enable row level security;

-- NOTE: we intentionally do NOT use FORCE ROW LEVEL SECURITY. The privileged
-- host RPCs (resolve_round, etc.) are SECURITY DEFINER and run as the table
-- owner; the owner bypasses RLS, which is exactly how those functions are
-- allowed to update other players' wealth. Clients connect as the non-owner
-- `authenticated`/`anon` roles, so every client query IS subject to the
-- policies above. FORCE would (wrongly) subject the definer functions to RLS.

-- ---------------------------------------------------------------------------
-- sessions: members (host + players) may SELECT. No direct writes — all
-- mutations go through host-only SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (public.is_session_member(id));

-- ---------------------------------------------------------------------------
-- players:
--   * always SELECT your own row
--   * host SELECTs all rows in their sessions
--   * other students' rows are visible ONLY when the host enabled the full
--     leaderboard (otherwise students see only themselves; rank via get_my_rank)
--   * UPDATE limited to your own row, and column grants below limit it to
--     display_name. INSERT/DELETE are denied — joining is via join_session RPC.
-- ---------------------------------------------------------------------------
drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select using (
    auth_uid = auth.uid()
    or public.is_session_host(session_id)
    or (public.session_show_leaderboard(session_id) and public.is_session_member(session_id))
  );

drop policy if exists players_update_self on public.players;
create policy players_update_self on public.players
  for update using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- ---------------------------------------------------------------------------
-- rounds: members may SELECT. No client writes (host RPCs only). market_outcome
-- is only ever populated at reveal time, so it cannot leak early.
-- ---------------------------------------------------------------------------
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select using (public.is_session_member(session_id));

-- ---------------------------------------------------------------------------
-- allocations:
--   * SELECT only your OWN allocation (host may read all in their session for
--     the live submission counter / history). Students can NEVER read another
--     student's allocation — pending or revealed.
--   * INSERT/UPDATE (upsert) only your OWN allocation, only while the round is
--     'open', and only with 0 <= risky <= your current wealth. Column grants
--     below restrict writes to risky_amount/safe_amount so a student cannot set
--     resulting_wealth or market_outcome.
-- ---------------------------------------------------------------------------
drop policy if exists alloc_select on public.allocations;
create policy alloc_select on public.allocations
  for select using (
    public.is_my_player(player_id) or public.is_host_of_round(round_id)
  );

drop policy if exists alloc_insert on public.allocations;
create policy alloc_insert on public.allocations
  for insert with check (
    public.is_my_player(player_id)
    and public.round_is_open(round_id)
    and risky_amount >= 0
    and risky_amount <= (select p.current_wealth from public.players p where p.id = player_id)
    and (select r.session_id from public.rounds r where r.id = round_id)
        = (select p.session_id from public.players p where p.id = player_id)
  );

drop policy if exists alloc_update on public.allocations;
create policy alloc_update on public.allocations
  for update using (
    public.is_my_player(player_id) and public.round_is_open(round_id)
  )
  with check (
    public.is_my_player(player_id)
    and public.round_is_open(round_id)
    and risky_amount >= 0
    and risky_amount <= (select p.current_wealth from public.players p where p.id = player_id)
  );

-- ---------------------------------------------------------------------------
-- Table grants: lock the anon/authenticated roles to exactly what the policies
-- need. Supabase signs every player in (anonymous or magic-link) as the
-- `authenticated` role, so participants get column-scoped grants; the bare
-- `anon` role (no session yet) gets nothing and must authenticate first.
-- ---------------------------------------------------------------------------
revoke all on public.sessions    from anon, authenticated;
revoke all on public.players     from anon, authenticated;
revoke all on public.rounds      from anon, authenticated;
revoke all on public.allocations from anon, authenticated;

grant select on public.sessions to authenticated;
grant select on public.rounds   to authenticated;
grant select on public.players  to authenticated;
-- students may change only their display name (current_wealth stays read-only)
grant update (display_name) on public.players to authenticated;

grant select on public.allocations to authenticated;
-- students may write only the allocation amount columns (never resulting_wealth)
grant insert (round_id, player_id, risky_amount, safe_amount) on public.allocations to authenticated;
grant update (risky_amount, safe_amount) on public.allocations to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: restrict to authenticated and publish the four game tables so
-- clients react without polling. RLS still gates every row a subscriber sees.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sessions','players','rounds','allocations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
