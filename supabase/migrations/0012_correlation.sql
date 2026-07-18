-- =============================================================================
-- 0012_correlation.sql — Correlation knob (ρ) for the portfolio game.
--
-- Model: common-uniform mixture. Per draw context (one per round in shared
-- scope; one per player per round in independent scope) draw a common uniform
-- U. For each asset, with probability sqrt(ρ) compare U against that asset's
-- good_prob, otherwise compare a fresh uniform. Properties:
--   * every asset's MARGINAL good-probability stays exactly its good_prob at
--     any ρ (the luck/expected-rate math client-side needs no changes);
--   * pairwise correlation between equal-prob assets = ρ
--     (both must pick the common U: sqrt(ρ)·sqrt(ρ));
--   * ρ = 1 → all assets driven by one U → move together (the basic game);
--   * ρ = 0 → fully independent (previous behavior; the default).
-- Manual-mode overrides are untouched (explicit outcomes, correlation moot).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- create_session: accept + validate `correlation` (portfolio only). Body is
-- 0011's with the correlation default and check added.
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
  v_assets   jsonb;
  v_asset    jsonb;
  v_n        int;
  i          int;
begin
  if v_uid is null then
    raise exception 'must be signed in to create a session';
  end if;

  v_defaults := jsonb_build_object(
    'game_type', 'basic',
    'payoff_mode', 'moderate', 'num_rounds', 25, 'starting_wealth', 100,
    'good_prob', 0.6, 'market_mode', 'auto', 'market_scope', 'shared',
    'show_full_leaderboard_to_students', true, 'allow_late_join', false
  );
  v_config := v_defaults || coalesce(p_config, '{}'::jsonb);

  -- shared validation
  if (v_config->>'game_type') not in ('basic','portfolio') then
    raise exception 'invalid game_type'; end if;
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
  -- manual market implies shared outcomes per round
  if (v_config->>'market_mode') = 'manual' then
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');
  end if;

  -- portfolio-only validation
  if (v_config->>'game_type') = 'portfolio' then
    v_n := coalesce((v_config->>'num_assets')::int, 4);
    if v_n not between 2 and 10 then
      raise exception 'num_assets must be 2..10'; end if;
    v_config := jsonb_set(v_config, '{num_assets}', to_jsonb(v_n));
    if coalesce((v_config->>'risk_free_rate')::numeric, 0) not between 0 and 0.5 then
      raise exception 'risk_free_rate must be in [0, 0.5]'; end if;
    -- ρ: how much the assets move together (0 = independent, 1 = one market)
    if coalesce((v_config->>'correlation')::numeric, 0) not between 0 and 1 then
      raise exception 'correlation must be in [0, 1]'; end if;

    v_assets := v_config->'assets';
    if v_assets is not null and jsonb_typeof(v_assets) <> 'null' then
      if jsonb_typeof(v_assets) <> 'array' or jsonb_array_length(v_assets) <> v_n then
        raise exception 'assets must be an array of length num_assets'; end if;
      for i in 0..(v_n - 1) loop
        v_asset := v_assets->i;
        if v_asset ? 'good_prob'
           and (v_asset->>'good_prob')::numeric not between 0 and 1 then
          raise exception 'asset % good_prob must be in [0,1]', i + 1; end if;
        if v_asset ? 'payoff_mode'
           and (v_asset->>'payoff_mode') not in ('moderate','extreme') then
          raise exception 'asset % payoff_mode invalid', i + 1; end if;
      end loop;
    end if;
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
-- resolve_round: 0010's body with the portfolio draw loops switched to the
-- correlated common-uniform mixture (v_corr / v_mix / v_u_common / v_u).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_round(
  p_session_id uuid, p_round_number int,
  p_market_override text default null,
  p_market_overrides text[] default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session        public.sessions%rowtype;
  v_round          public.rounds%rowtype;
  v_game_type      text;
  v_payoff         text;
  v_market_mode    text;
  v_scope          text;
  v_good_prob      numeric;
  v_rf             numeric;
  v_corr           numeric;
  v_mix            numeric;  -- sqrt(ρ): P(an asset uses the common uniform)
  v_u_common       numeric;
  v_u              numeric;
  v_n              int;
  v_assets         jsonb;
  v_shared_outcome text;
  v_outcomes       text[];
  v_player_outs    text[];
  v_amounts        numeric[];
  v_asset_prob     numeric;
  v_asset_payoff   text;
  r                record;
  v_risky          numeric;
  v_safe           numeric;
  v_frac           numeric;
  v_outcome        text;
  v_mult           numeric;
  v_result         numeric;
  v_sum            numeric;
  i                int;
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

  v_game_type   := coalesce(v_session.config->>'game_type', 'basic');
  v_payoff      := coalesce(v_session.config->>'payoff_mode', 'moderate');
  v_market_mode := coalesce(v_session.config->>'market_mode', 'auto');
  v_scope       := coalesce(v_session.config->>'market_scope', 'shared');
  v_good_prob   := coalesce((v_session.config->>'good_prob')::numeric, 0.6);

  -- ===========================================================================
  -- PORTFOLIO GAME
  -- ===========================================================================
  if v_game_type = 'portfolio' then
    v_n      := coalesce((v_session.config->>'num_assets')::int, 4);
    v_rf     := coalesce((v_session.config->>'risk_free_rate')::numeric, 0);
    v_corr   := least(greatest(coalesce((v_session.config->>'correlation')::numeric, 0), 0), 1);
    v_mix    := sqrt(v_corr);
    v_assets := v_session.config->'assets';
    if v_assets is not null and jsonb_typeof(v_assets) <> 'array' then
      v_assets := null;
    end if;

    -- shared scope: one outcome per ASSET for the whole class
    if v_market_mode = 'manual' then
      if p_market_overrides is null or array_length(p_market_overrides, 1) <> v_n then
        raise exception 'manual portfolio market requires % outcomes', v_n;
      end if;
      v_scope := 'shared';
      v_outcomes := p_market_overrides;
      for i in 1..v_n loop
        if v_outcomes[i] not in ('good','bad') then
          raise exception 'outcomes must be good or bad';
        end if;
      end loop;
    elsif v_scope = 'shared' then
      v_outcomes := array[]::text[];
      v_u_common := random();  -- the round's common market factor
      for i in 1..v_n loop
        v_asset_prob := coalesce((v_assets->(i-1)->>'good_prob')::numeric, v_good_prob);
        v_u := case when random() < v_mix then v_u_common else random() end;
        v_outcomes := v_outcomes ||
          (case when v_u < v_asset_prob then 'good' else 'bad' end);
      end loop;
    end if;

    for r in
      select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
             a.id as alloc_id, a.risky_breakdown
      from public.players p
      left join public.allocations a
        on a.player_id = p.id and a.round_id = v_round.id
      where p.session_id = p_session_id and p.is_active = true
    loop
      -- per-asset amounts: bots play their fixed strategy; humans use their
      -- submission; non-submitters default to all-safe (zeros)
      v_amounts := array[]::numeric[];
      if r.is_bot then
        for i in 1..v_n loop
          v_amounts := v_amounts || (case r.strategy
            when 'concentrated'     then case when i = 1 then r.current_wealth else 0 end
            when 'diversified'      then r.current_wealth / v_n
            when 'half_diversified' then (r.current_wealth * 0.5) / v_n
            else 0::numeric  -- all_safe / unknown
          end);
        end loop;
      else
        for i in 1..v_n loop
          v_amounts := v_amounts ||
            greatest(coalesce((r.risky_breakdown->>(i-1))::numeric, 0), 0);
        end loop;
      end if;

      -- clamp: if the sum somehow exceeds wealth, scale the whole portfolio down
      v_sum := 0;
      for i in 1..v_n loop v_sum := v_sum + v_amounts[i]; end loop;
      if v_sum > r.current_wealth and v_sum > 0 then
        for i in 1..v_n loop
          v_amounts[i] := v_amounts[i] * r.current_wealth / v_sum;
        end loop;
        v_sum := r.current_wealth;
      end if;
      v_safe := r.current_wealth - v_sum;

      -- outcomes this player faces: the class-wide draw, or their own draws
      -- (independent scope correlates each player's assets with each other,
      -- never across players)
      if v_scope = 'independent' then
        v_player_outs := array[]::text[];
        v_u_common := random();  -- this player's common market factor
        for i in 1..v_n loop
          v_asset_prob := coalesce((v_assets->(i-1)->>'good_prob')::numeric, v_good_prob);
          v_u := case when random() < v_mix then v_u_common else random() end;
          v_player_outs := v_player_outs ||
            (case when v_u < v_asset_prob then 'good' else 'bad' end);
        end loop;
      else
        v_player_outs := v_outcomes;
      end if;

      -- resulting wealth = safe·(1+rf) + Σ amount_i · multiplier_i
      v_result := v_safe * (1 + v_rf);
      for i in 1..v_n loop
        v_asset_payoff := coalesce(v_assets->(i-1)->>'payoff_mode', v_payoff);
        v_mult := case
          when v_asset_payoff = 'extreme' and v_player_outs[i] = 'good' then 2
          when v_asset_payoff = 'extreme'                              then 0
          when v_player_outs[i] = 'good' then 1.1
          else 0.9
        end;
        v_result := v_result + v_amounts[i] * v_mult;
      end loop;

      if r.alloc_id is null then
        insert into public.allocations (round_id, player_id, risky_amount,
          safe_amount, risky_breakdown, asset_outcomes, resulting_wealth)
        values (v_round.id, r.player_id, v_sum, v_safe, to_jsonb(v_amounts),
          case when v_scope = 'independent' then to_jsonb(v_player_outs) else null end,
          v_result);
      else
        update public.allocations
          set risky_amount    = v_sum,
              safe_amount     = v_safe,
              risky_breakdown = to_jsonb(v_amounts),
              asset_outcomes  = case when v_scope = 'independent'
                                     then to_jsonb(v_player_outs) else null end,
              resulting_wealth = v_result
          where id = r.alloc_id;
      end if;

      update public.players set current_wealth = v_result where id = r.player_id;
    end loop;

    update public.rounds
      set status = 'revealed',
          market_outcome = null,
          market_outcomes = case when v_scope = 'independent'
                                 then null else to_jsonb(v_outcomes) end,
          revealed_at = now()
      where id = v_round.id;
    return;
  end if;

  -- ===========================================================================
  -- BASIC GAME (unchanged from 0010, incl. bot auto-allocation)
  -- ===========================================================================
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

revoke all on function public.resolve_round(uuid, int, text, text[]) from public;
grant execute on function public.resolve_round(uuid, int, text, text[]) to authenticated;
