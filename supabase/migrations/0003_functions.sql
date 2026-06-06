-- =============================================================================
-- 0003_functions.sql — privileged operations as host-only SECURITY DEFINER
-- RPCs. The service_role key is NEVER shipped to the client; every privileged
-- action is one of these RPCs, and each one re-checks authorization internally
-- (auth.uid() = host_id for host actions). Wealth/market math lives ONLY here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- create_session(p_config) — host only, and only for a REAL (non-anonymous)
-- account. Returns the new session id + join_code.
-- ---------------------------------------------------------------------------
create or replace function public.create_session(p_config jsonb default '{}'::jsonb)
returns table (id uuid, join_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_defaults jsonb;
  v_config   jsonb;
  v_code     text;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- no 0/O/1/I/L ambiguity
  v_id       uuid;
  i          int;
begin
  if v_uid is null then
    raise exception 'must be signed in to create a session';
  end if;
  -- Hosts must be verified accounts, not anonymous students.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'anonymous users may not host a session';
  end if;

  v_defaults := jsonb_build_object(
    'payoff_mode', 'moderate', 'num_rounds', 25, 'starting_wealth', 100,
    'good_prob', 0.6, 'market_mode', 'auto', 'market_scope', 'shared',
    'show_full_leaderboard_to_students', true, 'allow_late_join', false
  );
  v_config := v_defaults || coalesce(p_config, '{}'::jsonb);

  -- server-side validation of config
  if (v_config->>'payoff_mode') not in ('moderate','extreme') then
    raise exception 'invalid payoff_mode'; end if;
  if (v_config->>'market_mode') not in ('auto','manual') then
    raise exception 'invalid market_mode'; end if;
  if (v_config->>'market_scope') not in ('shared','independent') then
    raise exception 'invalid market_scope'; end if;
  if (v_config->>'num_rounds')::numeric not between 1 and 200 then
    raise exception 'num_rounds must be 1..200'; end if;
  if (v_config->>'starting_wealth')::numeric <= 0 then
    raise exception 'starting_wealth must be > 0'; end if;
  if (v_config->>'good_prob')::numeric not between 0 and 1 then
    raise exception 'good_prob must be in [0,1]'; end if;
  -- manual market implies a single shared outcome per round
  if (v_config->>'market_mode') = 'manual' then
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');
  end if;

  -- unique, human-typeable join code
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions s where s.join_code = v_code);
  end loop;

  insert into public.sessions (join_code, host_id, status, current_round, config)
  values (v_code, v_uid, 'lobby', 0, v_config)
  returning sessions.id into v_id;

  return query select v_id, v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_session(p_join_code, p_display_name) — any signed-in user. Validates the
-- code server-side, enforces lobby/late-join rules, and creates (or returns the
-- existing) player row with the configured starting wealth. Idempotent rejoin.
-- ---------------------------------------------------------------------------
create or replace function public.join_session(p_join_code text, p_display_name text)
returns public.players
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_player  public.players%rowtype;
  v_name    text;
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

  v_name := nullif(trim(p_display_name), '');
  v_name := coalesce(left(v_name, 40), 'Player');
  v_start := coalesce((v_session.config->>'starting_wealth')::numeric, 100);

  insert into public.players (session_id, auth_uid, display_name, current_wealth)
  values (v_session.id, v_uid, v_name, v_start)
  returning * into v_player;

  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: open the next round for a session (host only).
-- ---------------------------------------------------------------------------
create or replace function public._open_next_round(p_session_id uuid)
returns public.rounds
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
  v_next    int;
  v_max     int;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if v_session.status = 'finished' then
    raise exception 'session is finished';
  end if;

  v_max  := coalesce((v_session.config->>'num_rounds')::int, 25);
  v_next := v_session.current_round + 1;
  if v_next > v_max then
    raise exception 'no rounds remaining (max %).', v_max;
  end if;
  -- the previous round (if any) must be fully revealed before advancing
  if v_session.current_round >= 1 then
    if not exists (
      select 1 from public.rounds
      where session_id = p_session_id and round_number = v_session.current_round
        and status = 'revealed'
    ) then
      raise exception 'previous round must be revealed before opening the next';
    end if;
  end if;

  insert into public.rounds (session_id, round_number, status)
  values (p_session_id, v_next, 'open')
  returning * into v_round;

  update public.sessions
    set current_round = v_next, status = 'active'
    where id = p_session_id;

  return v_round;
end;
$$;

-- start_round: open round 1 (host only)
create or replace function public.start_round(p_session_id uuid)
returns public.rounds
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then raise exception 'not authorized: host only'; end if;
  if v_session.current_round <> 0 then
    raise exception 'session already started; use next_round';
  end if;
  return public._open_next_round(p_session_id);
end;
$$;

-- next_round: open the round after the current one (host only)
create or replace function public.next_round(p_session_id uuid)
returns public.rounds
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then raise exception 'not authorized: host only'; end if;
  if v_session.current_round < 1 then
    raise exception 'no round in progress; use start_round';
  end if;
  return public._open_next_round(p_session_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- lock_round: stop accepting allocations (host only). open -> locked.
-- ---------------------------------------------------------------------------
create or replace function public.lock_round(p_session_id uuid, p_round_number int)
returns public.rounds
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then raise exception 'not authorized: host only'; end if;

  select * into v_round from public.rounds
    where session_id = p_session_id and round_number = p_round_number;
  if not found then raise exception 'round not found'; end if;
  if v_round.status <> 'open' then
    raise exception 'round must be open to lock (status=%).', v_round.status;
  end if;

  update public.rounds set status = 'locked' where id = v_round.id
    returning * into v_round;
  return v_round;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_round: THE authoritative wealth/market computation. Host only.
-- Refuses unless the round is 'locked'. Determines outcome(s) per
-- market_mode/market_scope, validates each allocation (0 <= risky <= wealth),
-- defaults non-submitters to all-safe, computes resulting_wealth, updates
-- players.current_wealth, and flips the round to 'revealed'. Clients NEVER
-- compute wealth; this function is the only writer of current_wealth.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_round(
  p_session_id uuid, p_round_number int, p_market_override text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session        public.sessions%rowtype;
  v_round          public.rounds%rowtype;
  v_payoff         text;
  v_market_mode    text;
  v_scope          text;
  v_good_prob      numeric;
  v_shared_outcome text;
  r                record;
  v_risky          numeric;
  v_safe           numeric;
  v_outcome        text;
  v_mult           numeric;
  v_result         numeric;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: only the host may resolve a round';
  end if;

  select * into v_round from public.rounds
    where session_id = p_session_id and round_number = p_round_number;
  if not found then raise exception 'round not found'; end if;
  if v_round.status <> 'locked' then
    raise exception 'round must be locked before resolving (status=%).', v_round.status;
  end if;

  v_payoff      := coalesce(v_session.config->>'payoff_mode', 'moderate');
  v_market_mode := coalesce(v_session.config->>'market_mode', 'auto');
  v_scope       := coalesce(v_session.config->>'market_scope', 'shared');
  v_good_prob   := coalesce((v_session.config->>'good_prob')::numeric, 0.6);

  -- determine the shared outcome (if applicable)
  if v_market_mode = 'manual' then
    if p_market_override is null or p_market_override not in ('good','bad') then
      raise exception 'manual market requires p_market_override of good or bad';
    end if;
    v_scope := 'shared';
    v_shared_outcome := p_market_override;
  elsif v_scope = 'shared' then
    v_shared_outcome := case when random() < v_good_prob then 'good' else 'bad' end;
  end if;

  for r in
    select p.id as player_id, p.current_wealth,
           a.id as alloc_id, a.risky_amount
    from public.players p
    left join public.allocations a
      on a.player_id = p.id and a.round_id = v_round.id
    where p.session_id = p_session_id and p.is_active = true
  loop
    -- validate / clamp; non-submitters and invalid values default to all-safe
    v_risky := coalesce(r.risky_amount, 0);
    if v_risky < 0 then v_risky := 0; end if;
    if v_risky > r.current_wealth then v_risky := r.current_wealth; end if;
    v_safe := r.current_wealth - v_risky;

    if v_scope = 'independent' then
      v_outcome := case when random() < v_good_prob then 'good' else 'bad' end;
    else
      v_outcome := v_shared_outcome;
    end if;

    v_mult := case
      when v_payoff = 'extreme' and v_outcome = 'good' then 2
      when v_payoff = 'extreme' and v_outcome = 'bad'  then 0
      when v_outcome = 'good' then 1.1   -- moderate, good
      else 0.9                           -- moderate, bad
    end;
    v_result := v_safe + v_risky * v_mult;

    if r.alloc_id is null then
      insert into public.allocations (round_id, player_id, risky_amount,
        safe_amount, market_outcome, resulting_wealth)
      values (v_round.id, r.player_id, v_risky, v_safe,
        case when v_scope = 'independent' then v_outcome else null end, v_result);
    else
      update public.allocations
        set risky_amount = v_risky,
            safe_amount = v_safe,
            market_outcome = case when v_scope = 'independent' then v_outcome else null end,
            resulting_wealth = v_result
        where id = r.alloc_id;
    end if;

    update public.players set current_wealth = v_result where id = r.player_id;
  end loop;

  update public.rounds
    set status = 'revealed',
        market_outcome = case when v_scope = 'independent' then null else v_shared_outcome end,
        revealed_at = now()
    where id = v_round.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_session: end the game (host only).
-- ---------------------------------------------------------------------------
create or replace function public.finish_session(p_session_id uuid)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then raise exception 'not authorized: host only'; end if;

  update public.sessions set status = 'finished' where id = p_session_id
    returning * into v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_rank: a student's rank + class size WITHOUT revealing the list. Used
-- when the full leaderboard is hidden from students.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_rank(p_session_id uuid)
returns table (rank int, total int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_my_wealth numeric;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select current_wealth into v_my_wealth from public.players
    where session_id = p_session_id and auth_uid = auth.uid();
  if not found then
    raise exception 'no player row for caller (host has no rank)';
  end if;

  return query
    select (1 + count(*) filter (where p.current_wealth > v_my_wealth))::int,
           count(*)::int
    from public.players p
    where p.session_id = p_session_id and p.is_active = true;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_leaderboard: full ranked list. Host always allowed; students only when
-- show_full_leaderboard_to_students is true. Returns only display fields (never
-- auth_uid), plus an is_me flag.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_session_id uuid)
returns table (player_id uuid, display_name text, current_wealth numeric,
               rank int, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  if not (public.is_session_host(p_session_id)
          or public.session_show_leaderboard(p_session_id)) then
    raise exception 'the full leaderboard is hidden from students in this session';
  end if;

  return query
    select p.id, p.display_name, p.current_wealth,
           (rank() over (order by p.current_wealth desc))::int,
           (p.auth_uid = auth.uid())
    from public.players p
    where p.session_id = p_session_id and p.is_active = true
    order by p.current_wealth desc, p.joined_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: only authenticated users may call the RPCs. (Supabase signs
-- both anonymous students and magic-link hosts in as `authenticated`.)
-- ---------------------------------------------------------------------------
revoke all on function public.create_session(jsonb)            from public;
revoke all on function public.join_session(text, text)         from public;
revoke all on function public.start_round(uuid)                from public;
revoke all on function public.next_round(uuid)                 from public;
revoke all on function public.lock_round(uuid, int)            from public;
revoke all on function public.resolve_round(uuid, int, text)   from public;
revoke all on function public.finish_session(uuid)             from public;
revoke all on function public.get_my_rank(uuid)                from public;
revoke all on function public.get_leaderboard(uuid)            from public;
revoke all on function public._open_next_round(uuid)           from public;

grant execute on function public.create_session(jsonb)          to authenticated;
grant execute on function public.join_session(text, text)       to authenticated;
grant execute on function public.start_round(uuid)              to authenticated;
grant execute on function public.next_round(uuid)               to authenticated;
grant execute on function public.lock_round(uuid, int)          to authenticated;
grant execute on function public.resolve_round(uuid, int, text) to authenticated;
grant execute on function public.finish_session(uuid)           to authenticated;
grant execute on function public.get_my_rank(uuid)              to authenticated;
grant execute on function public.get_leaderboard(uuid)          to authenticated;
-- _open_next_round is internal; never grant it to clients.
