-- =============================================================================
-- 0008_temp_allow_anon_host.sql — *** TEMPORARY, FOR TESTING ONLY ***
--
-- The host magic-link flow is rate-limited on Supabase's email quota, so for
-- testing we allow a no-email (anonymous) account to create sessions. This
-- recreates create_session identical to 0007 EXCEPT the `is_anonymous` rejection
-- is removed.
--
-- TO RESTORE PRODUCTION SECURITY: follow docs/DEPLOYMENT.md Part C.1 (a small
-- trigger migration). Do NOT re-apply 0007's create_session: later migrations
-- (0010-0014, 0026) replaced it, and re-applying it would silently remove the
-- portfolio game, the manager game and the index fund.
-- =============================================================================
create or replace function public.create_session(p_config jsonb default '{}'::jsonb)
returns table (id uuid, join_code text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_defaults jsonb;
  v_config   jsonb;
  v_code     text;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_id       uuid;
  i          int;
begin
  if v_uid is null then
    raise exception 'must be signed in to create a session';
  end if;
  -- TEMP: anonymous-host rejection removed for testing (see file header).

  v_defaults := jsonb_build_object(
    'payoff_mode', 'moderate', 'num_rounds', 25, 'starting_wealth', 100,
    'good_prob', 0.6, 'market_mode', 'auto', 'market_scope', 'shared',
    'show_full_leaderboard_to_students', true, 'show_odds_to_students', true,
    'allow_late_join', false
  );
  v_config := v_defaults || coalesce(p_config, '{}'::jsonb);

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
  if (v_config->>'market_mode') = 'manual' then
    v_config := jsonb_set(v_config, '{market_scope}', '"shared"');
  end if;

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
