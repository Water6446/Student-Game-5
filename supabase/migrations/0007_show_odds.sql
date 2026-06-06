-- =============================================================================
-- 0007_show_odds.sql — let students (optionally) see the market odds each round.
--
-- Adds a config flag `show_odds_to_students`. When true, the student round view
-- displays the current good/bad probability (auto mode). The host can flip it
-- live via set_show_odds, and it's also set at creation. Default true.
-- =============================================================================

-- Live host-only toggle.
create or replace function public.set_show_odds(p_session_id uuid, p_show boolean)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: host only';
  end if;

  update public.sessions
    set config = jsonb_set(config, '{show_odds_to_students}', to_jsonb(coalesce(p_show, false)))
    where id = p_session_id
    returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.set_show_odds(uuid, boolean) from public;
grant execute on function public.set_show_odds(uuid, boolean) to authenticated;

-- Recreate create_session so the server default includes the new key. (Identical
-- to 0003 except for the added 'show_odds_to_students' default.)
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
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'anonymous users may not host a session';
  end if;

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
