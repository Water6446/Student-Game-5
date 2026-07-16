-- =============================================================================
-- 0011_portfolio_max_assets.sql — Increase max assets from 8 to 10
-- =============================================================================

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
