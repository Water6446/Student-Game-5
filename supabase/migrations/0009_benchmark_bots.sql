-- =============================================================================
-- 0009_benchmark_bots.sql — optional "simpleton" benchmark players + the edge
-- strategy in resolve_round.
--
-- The professor can add 4 bot players that auto-play a fixed strategy every
-- round: all-safe (0%), edge (bets good%−bad% of wealth), 50/50, all-risky.
-- They are real player rows (so they show up in standings, the chart, history
-- and the CSV) but have no auth user. In the default independent-market game
-- each bot rolls its own outcome, exactly like a student.
-- =============================================================================

-- ---- schema: allow bot player rows -----------------------------------------
alter table public.players add column if not exists is_bot boolean not null default false;
alter table public.players add column if not exists strategy text;

-- bots have no auth user; humans must have one
alter table public.players alter column auth_uid drop not null;
alter table public.players drop constraint if exists players_auth_or_bot_chk;
alter table public.players add constraint players_auth_or_bot_chk
  check (auth_uid is not null or is_bot);
alter table public.players drop constraint if exists players_strategy_chk;
alter table public.players add constraint players_strategy_chk
  check (strategy is null or strategy in ('all_safe','edge','fifty_fifty','all_risky'));

-- ---- add_benchmark_bots: host-only, lobby-only, idempotent ------------------
create or replace function public.add_benchmark_bots(p_session_id uuid)
returns setof public.players
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_start   numeric;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if v_session.status <> 'lobby' then
    raise exception 'benchmark students can only be added before the game starts';
  end if;

  -- idempotent: do nothing if bots already exist for this session
  if exists (select 1 from public.players where session_id = p_session_id and is_bot) then
    return query select * from public.players where session_id = p_session_id and is_bot;
    return;
  end if;

  v_start := coalesce((v_session.config->>'starting_wealth')::numeric, 100);

  return query
  insert into public.players (session_id, auth_uid, display_name, current_wealth, is_bot, strategy)
  values
    (p_session_id, null, 'Bot · All-safe',  v_start, true, 'all_safe'),
    (p_session_id, null, 'Bot · Edge',      v_start, true, 'edge'),
    (p_session_id, null, 'Bot · 50/50',     v_start, true, 'fifty_fifty'),
    (p_session_id, null, 'Bot · All-risky', v_start, true, 'all_risky')
  returning *;
end;
$$;

revoke all on function public.add_benchmark_bots(uuid) from public;
grant execute on function public.add_benchmark_bots(uuid) to authenticated;

-- ---- resolve_round: same as 0003, plus bot auto-allocation -----------------
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
  v_frac           numeric;
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
    select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
           a.id as alloc_id, a.risky_amount
    from public.players p
    left join public.allocations a
      on a.player_id = p.id and a.round_id = v_round.id
    where p.session_id = p_session_id and p.is_active = true
  loop
    -- bots auto-play their fixed strategy; humans use their submission
    if r.is_bot then
      v_frac := case r.strategy
        when 'all_safe'    then 0
        when 'fifty_fifty' then 0.5
        when 'all_risky'   then 1
        when 'edge'        then least(greatest(2 * v_good_prob - 1, 0), 1)
        else 0
      end;
      v_risky := v_frac * r.current_wealth;
    else
      v_risky := coalesce(r.risky_amount, 0);
    end if;
    -- clamp 0 <= risky <= wealth for everyone (non-submitters default to all-safe)
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
      when v_outcome = 'good' then 1.1
      else 0.9
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
