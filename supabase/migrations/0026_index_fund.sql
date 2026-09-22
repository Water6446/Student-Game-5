-- 0026: an index fund students can actually buy.
--
-- Until now the manager game scored students against a passive index they
-- could not invest in. Beta feedback asked for the passive option on the menu:
-- a fund that tracks the index for 0.05% a year. The lesson survives — and
-- sharpens: every active manager now has a cheap, visible alternative to beat.
--
-- The fund is appended by create_session (config key `index_fund`, default
-- TRUE) rather than written into _manager_preset, for three reasons:
--   * it joins AFTER the skill shuffle, so it can never be handed an active
--     manager's alpha — the shuffle permutes alpha across every preset slot;
--   * the hedge-fund preset puts every slot on 2-and-20, and an index fund on
--     2-and-20 is not an index fund;
--   * a host who wants the original "index you cannot buy" game turns it off.
--
-- Its truth is beta 1, alpha 0, tracking error 0: resolve_round (0015) then
-- gives it EXACTLY the market's return each year (_rand_normal(0, 0) = 0), and
-- the 0.05% management fee is charged through the ordinary fee path. Nothing
-- in 0015 changes — it reads num_managers and walks both arrays by slot.
--
-- The public entry carries `index_fund: true` so the client can label it. It
-- carries no beta/alpha/tracking_error, like every other public entry.
--
-- MIRRORS `INDEX_FUND` in lib/game/manager.ts.
--
-- Everything else below is 0014's create_session, unchanged.

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
  -- manager game
  v_mgrs      jsonb;
  v_mgr       jsonb;
  v_alphas    numeric[];
  v_perm      int[];
  v_pub       jsonb := '[]'::jsonb;
  v_priv      jsonb := '[]'::jsonb;
  v_track     jsonb;
  v_secret    jsonb;
  v_swap      int;
  j           int;
  -- the index fund (see the header)
  c_idx_name  constant text    := 'Index Tracker';
  c_idx_line  constant text    := 'Passive. Holds the whole index and matches its return.';
  c_idx_fee   constant numeric := 0.0005;
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
  if (v_config->>'game_type') not in ('basic','portfolio','manager') then
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

  -- manager-only validation, shuffle, track records and the public/private split
  if (v_config->>'game_type') = 'manager' then
    -- One index path and one set of manager returns for the whole class each
    -- year: independent scope would make the ghost line meaningless and the
    -- leaderboard unfair. Manual mode has no v1 path (see the plan's backlog).
    if (v_config->>'market_mode') = 'manual' then
      raise exception 'manual market mode is not supported for manager games';
    end if;
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');

    v_config := jsonb_set(v_config, '{market_mean}',
      to_jsonb(coalesce((v_config->>'market_mean')::numeric, 0.08)));
    v_config := jsonb_set(v_config, '{market_sd}',
      to_jsonb(coalesce((v_config->>'market_sd')::numeric, 0.16)));
    v_config := jsonb_set(v_config, '{risk_free_rate}',
      to_jsonb(coalesce((v_config->>'risk_free_rate')::numeric, 0.03)));
    v_config := jsonb_set(v_config, '{borrow_spread}',
      to_jsonb(coalesce((v_config->>'borrow_spread')::numeric, 0.05)));
    v_config := jsonb_set(v_config, '{leverage_cap}',
      to_jsonb(coalesce((v_config->>'leverage_cap')::numeric, 2.0)));
    v_config := jsonb_set(v_config, '{shuffle_skill}',
      to_jsonb(coalesce((v_config->>'shuffle_skill')::boolean, true)));
    v_config := jsonb_set(v_config, '{index_fund}',
      to_jsonb(coalesce((v_config->>'index_fund')::boolean, true)));

    if (v_config->>'market_mean')::numeric not between -0.5 and 0.5 then
      raise exception 'market_mean must be in [-0.5, 0.5]'; end if;
    if (v_config->>'market_sd')::numeric not between 0 and 1 then
      raise exception 'market_sd must be in [0, 1]'; end if;
    if (v_config->>'risk_free_rate')::numeric not between 0 and 0.5 then
      raise exception 'risk_free_rate must be in [0, 0.5]'; end if;
    if (v_config->>'borrow_spread')::numeric not between 0 and 0.5 then
      raise exception 'borrow_spread must be in [0, 0.5]'; end if;
    if (v_config->>'leverage_cap')::numeric not between 1.0 and 3.0 then
      raise exception 'leverage_cap must be in [1.0, 3.0]'; end if;

    -- Managers come from the host's advanced panel, or from a shipped preset.
    v_mgrs := v_config->'managers';
    if v_mgrs is null or jsonb_typeof(v_mgrs) <> 'array'
       or jsonb_array_length(v_mgrs) = 0 then
      v_mgrs := public._manager_preset(coalesce(v_config->>'manager_preset', 'default'));
    end if;
    v_n := jsonb_array_length(v_mgrs);
    if v_n not between 1 and 8 then
      raise exception 'num_managers must be 1..8'; end if;

    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      if coalesce((v_mgr->>'beta')::numeric, 1) not between -2 and 3 then
        raise exception 'manager % beta must be in [-2, 3]', i + 1; end if;
      if coalesce((v_mgr->>'alpha')::numeric, 0) not between -0.5 and 0.5 then
        raise exception 'manager % alpha must be in [-0.5, 0.5]', i + 1; end if;
      if coalesce((v_mgr->>'tracking_error')::numeric, 0) not between 0 and 1 then
        raise exception 'manager % tracking_error must be in [0, 1]', i + 1; end if;
      if coalesce((v_mgr->>'mgmt_fee')::numeric, 0) not between 0 and 0.1 then
        raise exception 'manager % mgmt_fee must be in [0, 0.1]', i + 1; end if;
      if coalesce((v_mgr->>'perf_fee')::numeric, 0) not between 0 and 0.5 then
        raise exception 'manager % perf_fee must be in [0, 0.5]', i + 1; end if;
      if coalesce(v_mgr->>'fee_type', 'flat') not in ('flat','performance') then
        raise exception 'manager % fee_type invalid', i + 1; end if;
    end loop;

    -- THE SHUFFLE: permute the ALPHA VECTOR ONLY. Names, one-liners, betas,
    -- tracking errors and fees stay pinned to their slot, so the personalities
    -- survive and only *who is actually skilled* moves. Genuine skill can end
    -- up behind "Steady Harbor", which is a delightful outcome.
    v_perm := array[]::int[];
    v_alphas := array[]::numeric[];
    for i in 0..(v_n - 1) loop
      v_perm := v_perm || i;
      v_alphas := v_alphas || coalesce((v_mgrs->i->>'alpha')::numeric, 0);
    end loop;
    if (v_config->>'shuffle_skill')::boolean then
      for i in reverse v_n..2 loop           -- Fisher-Yates over 1-based indices
        j := 1 + floor(random() * i)::int;
        v_swap := v_perm[i]; v_perm[i] := v_perm[j]; v_perm[j] := v_swap;
      end loop;
    end if;

    -- Build the PRIVATE array first, then project the public one out of the
    -- source. Never build public by deleting keys from private: one missed key
    -- is a silent leak and no test would catch it.
    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      v_priv := v_priv || jsonb_build_array(jsonb_build_object(
        'name',           coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),
        'beta',           coalesce((v_mgr->>'beta')::numeric, 1),
        -- slot i gets the alpha that the permutation sent here
        'alpha',          v_alphas[v_perm[i + 1] + 1],
        'tracking_error', coalesce((v_mgr->>'tracking_error')::numeric, 0)
      ));
    end loop;

    -- Track records are generated AFTER the shuffle, from each slot's
    -- post-shuffle truth, or the histories would contradict the reveal.
    for i in 0..(v_n - 1) loop
      v_mgr := v_mgrs->i;
      v_track := public._gen_track_record(
        (v_priv->i->>'beta')::numeric,
        (v_priv->i->>'alpha')::numeric,
        (v_priv->i->>'tracking_error')::numeric,
        coalesce((v_mgr->>'mgmt_fee')::numeric, 0),
        coalesce((v_mgr->>'perf_fee')::numeric, 0),
        (v_config->>'market_mean')::numeric,
        (v_config->>'market_sd')::numeric
      );
      v_pub := v_pub || jsonb_build_array(jsonb_build_object(
        'name',          coalesce(nullif(btrim(v_mgr->>'name'), ''), 'Manager ' || (i + 1)),
        'strategy_line', coalesce(v_mgr->>'strategy_line', ''),
        'fee_type',      coalesce(v_mgr->>'fee_type', 'flat'),
        'mgmt_fee',      coalesce((v_mgr->>'mgmt_fee')::numeric, 0),
        'perf_fee',      coalesce((v_mgr->>'perf_fee')::numeric, 0),
        'track_record',  v_track - 'vol_label',
        'vol_label',     v_track->>'vol_label'
      ));
    end loop;

    -- THE INDEX FUND, appended last and after the shuffle (see the header).
    -- Its history is the index's own, less the fee, drawn like every other
    -- track record against a pre-game market path.
    if (v_config->>'index_fund')::boolean then
      v_priv := v_priv || jsonb_build_array(jsonb_build_object(
        'name', c_idx_name, 'beta', 1, 'alpha', 0, 'tracking_error', 0));
      v_track := public._gen_track_record(
        1, 0, 0, c_idx_fee, 0,
        (v_config->>'market_mean')::numeric,
        (v_config->>'market_sd')::numeric
      );
      v_pub := v_pub || jsonb_build_array(jsonb_build_object(
        'name',          c_idx_name,
        'strategy_line', c_idx_line,
        'fee_type',      'flat',
        'mgmt_fee',      c_idx_fee,
        'perf_fee',      0,
        'index_fund',    true,
        'track_record',  v_track - 'vol_label',
        'vol_label',     v_track->>'vol_label'
      ));
      v_n := v_n + 1;
    end if;

    v_config := jsonb_set(v_config, '{managers}', v_pub);
    v_config := jsonb_set(v_config, '{num_managers}', to_jsonb(v_n));
    -- The permutation covers the ACTIVE slots only; the index fund is never in it.
    v_secret := jsonb_build_object('managers', v_priv, 'permutation', to_jsonb(v_perm));
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

  if v_secret is not null then
    insert into public.session_secrets (session_id, secret) values (v_id, v_secret);
  end if;

  return query select v_id, v_code;
end;
$$;

revoke all on function public.create_session(jsonb) from public;
grant execute on function public.create_session(jsonb) to authenticated;
