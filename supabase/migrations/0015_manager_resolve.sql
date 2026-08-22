-- =============================================================================
-- 0015_manager_resolve.sql — resolve_round gains the manager-game branch.
--
-- Split out of 0014 on purpose: create or replace rewrites the whole function,
-- so this file carries all three game branches and is long enough on its own.
--
-- The manager branch shares only the outer scaffolding with the other two —
-- host check, locked check, the per-player loop shape, and the final
-- `status = 'revealed'` update, which stays LAST because every client keys its
-- reveal off that write: components/use-round-phase.ts gates each screen on it,
-- so writing it before the allocations would reveal an empty round.
--
-- Per year:
--   r_market ~ N(market_mean, market_sd)                       ONE draw, shared
--   r_i = beta_i*r_market + alpha_i + N(0, tracking_error_i)   ONE eps PER
--                                                              MANAGER, drawn
--                                                              independently
--
-- Drawing one eps and reusing it across managers would make every fund move
-- together and quietly destroy the game. The draw sits inside the manager loop
-- for exactly that reason.
--
-- beta/alpha/tracking_error are read from session_secrets, NEVER from
-- sessions.config — config is world-readable to session members and carries
-- public data only.
-- =============================================================================
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
  -- manager game
  v_secret     jsonb;
  v_mgrs_pub   jsonb;
  v_market_ret numeric;
  v_mret       numeric[];
  v_prev       jsonb;
  v_prev_base  numeric;
  v_cash       numeric;
  v_borrowed   numeric;
  v_borrow_rt  numeric;
  v_gross      numeric;
  v_mgmt       numeric;
  v_perf       numeric;
  v_fees       numeric;
  v_breakdown  jsonb;
  v_lev_cap    numeric;
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
  -- MANAGER GAME
  -- ===========================================================================
  if v_game_type = 'manager' then
    v_n         := coalesce((v_session.config->>'num_managers')::int, 5);
    v_rf        := coalesce((v_session.config->>'risk_free_rate')::numeric, 0.03);
    v_lev_cap   := coalesce((v_session.config->>'leverage_cap')::numeric, 2.0);
    v_borrow_rt := v_rf + coalesce((v_session.config->>'borrow_spread')::numeric, 0.05);
    v_mgrs_pub  := v_session.config->'managers';

    select secret into v_secret from public.session_secrets
      where session_id = p_session_id;
    if not found then raise exception 'manager session is missing its parameters'; end if;

    -- The year's draws: one market, then one INDEPENDENT eps per manager.
    v_market_ret := public._rand_normal(
      coalesce((v_session.config->>'market_mean')::numeric, 0.08),
      coalesce((v_session.config->>'market_sd')::numeric, 0.16));

    v_mret := array[]::numeric[];
    for i in 1..v_n loop
      v_mret := v_mret ||
        ( coalesce((v_secret->'managers'->(i-1)->>'beta')::numeric, 1) * v_market_ret
        + coalesce((v_secret->'managers'->(i-1)->>'alpha')::numeric, 0)
        + public._rand_normal(0, coalesce(
            (v_secret->'managers'->(i-1)->>'tracking_error')::numeric, 0)) );
    end loop;

    for r in
      select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
             a.id as alloc_id, a.risky_breakdown
      from public.players p
      left join public.allocations a
        on a.player_id = p.id and a.round_id = v_round.id
      where p.session_id = p_session_id and p.is_active = true
    loop
      v_amounts := array[]::numeric[];

      if r.is_bot then
        -- 'The Index' holds the market itself: no managers, no fees.
        for i in 1..v_n loop v_amounts := v_amounts || 0::numeric; end loop;
      elsif r.risky_breakdown is not null then
        for i in 1..v_n loop
          v_amounts := v_amounts ||
            greatest(coalesce((r.risky_breakdown->>(i-1))::numeric, 0), 0);
        end loop;
      else
        -- NON-SUBMITTERS CARRY FORWARD. This is the OPPOSITE of every other
        -- game, where a missing allocation defaults to all-safe. A portfolio you
        -- did not touch this year is a portfolio you still hold. The previous
        -- year's SHARES persist, rescaled to current wealth, so the allocation
        -- still means the same thing after the wealth moved.
        select al.risky_breakdown, al.risky_amount + al.safe_amount
          into v_prev, v_prev_base
        from public.allocations al
        join public.rounds ro on ro.id = al.round_id
        where al.player_id = r.player_id and ro.session_id = p_session_id
          and ro.round_number < p_round_number and al.risky_breakdown is not null
        order by ro.round_number desc
        limit 1;

        if v_prev is null or coalesce(v_prev_base, 0) <= 0 then
          -- never allocated at all → 100% risk-free
          for i in 1..v_n loop v_amounts := v_amounts || 0::numeric; end loop;
        else
          for i in 1..v_n loop
            v_amounts := v_amounts ||
              greatest(coalesce((v_prev->>(i-1))::numeric, 0), 0)
                * r.current_wealth / v_prev_base;
          end loop;
        end if;
      end if;

      -- clamp to the leverage cap; scale the whole book down if it is over
      v_sum := 0;
      for i in 1..v_n loop v_sum := v_sum + v_amounts[i]; end loop;
      if v_sum > v_lev_cap * r.current_wealth and v_sum > 0 then
        for i in 1..v_n loop
          v_amounts[i] := v_amounts[i] * v_lev_cap * r.current_wealth / v_sum;
        end loop;
        v_sum := v_lev_cap * r.current_wealth;
      end if;

      v_cash     := greatest(r.current_wealth - v_sum, 0);
      v_borrowed := greatest(v_sum - r.current_wealth, 0);
      v_safe     := r.current_wealth - v_sum;   -- NEGATIVE when levered

      -- Fees per manager, in this exact order: management always, even in a
      -- down year; performance only on a positive GROSS return. (Industry
      -- practice more often charges the performance fee on the return NET of
      -- the management fee — that is a one-token change here. No high-water
      -- mark in v1: a fund that loses 20% then gains 20% charges on the
      -- recovery, and the reveal screen says so.)
      v_result    := 0;
      v_fees      := 0;
      v_breakdown := '[]'::jsonb;
      for i in 1..v_n loop
        v_gross := v_amounts[i] * v_mret[i];
        v_mgmt  := v_amounts[i] * coalesce((v_mgrs_pub->(i-1)->>'mgmt_fee')::numeric, 0);
        v_perf  := coalesce((v_mgrs_pub->(i-1)->>'perf_fee')::numeric, 0)
                     * greatest(v_gross, 0);
        v_result := v_result + v_amounts[i] + v_gross - v_mgmt - v_perf;
        v_fees   := v_fees + v_mgmt + v_perf;
        v_breakdown := v_breakdown || jsonb_build_array(
          jsonb_build_object('mgmt', round(v_mgmt, 4), 'perf', round(v_perf, 4)));
      end loop;

      if r.is_bot and r.strategy = 'index' then
        -- the index itself: the market return, no fees, no leverage
        v_result := r.current_wealth * (1 + v_market_ret);
      else
        v_result := v_result
                  + v_cash * (1 + v_rf)
                  - v_borrowed * (1 + v_borrow_rt);
      end if;
      v_result := greatest(v_result, 0);   -- floor at zero — busted

      if r.alloc_id is null then
        insert into public.allocations (round_id, player_id, risky_amount,
          safe_amount, risky_breakdown, fees_paid, fee_breakdown, resulting_wealth)
        values (v_round.id, r.player_id, v_sum, v_safe, to_jsonb(v_amounts),
          round(v_fees, 4), v_breakdown, v_result);
      else
        update public.allocations
          set risky_amount     = v_sum,
              safe_amount      = v_safe,
              risky_breakdown  = to_jsonb(v_amounts),
              fees_paid        = round(v_fees, 4),
              fee_breakdown    = v_breakdown,
              resulting_wealth = v_result
          where id = r.alloc_id;
      end if;

      update public.players set current_wealth = v_result where id = r.player_id;
    end loop;

    update public.rounds
      set status          = 'revealed',
          market_outcome  = null,
          market_return   = round(v_market_ret, 6),
          manager_returns = to_jsonb(v_mret),
          revealed_at     = now()
      where id = v_round.id;
    return;
  end if;

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
