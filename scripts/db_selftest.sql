-- =============================================================================
-- db_selftest.sql — proves the Stage-1 security assertions and the wealth math
-- against the REAL migrations (applied just before this file). Any failed
-- assertion RAISEs and, with ON_ERROR_STOP=1, aborts the run with a nonzero
-- exit code. Identity is simulated the way Supabase does it: SET ROLE
-- authenticated + a request.jwt.claims GUC carrying sub / role / is_anonymous.
--
-- Convention:
--   * "PASS:" notices mark an assertion that held.
--   * a raised exception containing FAIL means a security/math invariant broke.
-- =============================================================================
\set ON_ERROR_STOP on

-- ---- test identities --------------------------------------------------------
insert into auth.users(id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-000000000001', 'prof@example.edu', false), -- host
  ('b0000000-0000-0000-0000-000000000001', null,               true),  -- student Alice
  ('b0000000-0000-0000-0000-000000000002', null,               true),  -- student Bob
  ('c0000000-0000-0000-0000-000000000003', null,               true)   -- outsider
on conflict do nothing;

\set host_jwt    '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}'
\set alice_jwt   '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}'
\set bob_jwt     '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}'
\set outsider_jwt '{"sub":"c0000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}'

-- =============================================================================
-- HOST creates a moderate / manual / shared session (3 rounds, hidden board)
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as session_id, join_code
  from public.create_session(
    '{"payoff_mode":"moderate","num_rounds":3,"starting_wealth":100,
      "market_mode":"manual","market_scope":"shared","good_prob":0.6,
      "show_full_leaderboard_to_students":false,"allow_late_join":false}'::jsonb) \gset
reset role;
select set_config('app.session_id', :'session_id', false);

-- =============================================================================
-- STUDENTS join
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as p1 from public.join_session(:'join_code', 'Alice') \gset
reset role;
select set_config('app.p1', :'p1', false);

select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select id as p2 from public.join_session(:'join_code', 'Bob') \gset
reset role;
select set_config('app.p2', :'p2', false);

-- ---- NEGATIVE: anonymous student may NOT host -------------------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.create_session('{}'::jsonb);
    raise exception 'SECURITY FAIL: anonymous user created a session';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: anonymous create_session blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- ROUND 1: open -> submit -> lock -> resolve(good).  50/50 each, moderate/good
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select round_number as r1_num from public.start_round(:'session_id') \gset
reset role;
-- capture round 1 id (as superuser)
select id as r1_id from public.rounds
  where session_id = :'session_id' and round_number = :'r1_num' \gset
select set_config('app.r1_id', :'r1_id', false);
select set_config('app.r1_num', :'r1_num', false);

-- Alice submits 50 risky (direct upsert, governed by RLS)
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
  values (:'r1_id', :'p1', 50, 50);

-- ---- NEGATIVE: Alice cannot create an allocation for Bob (not her player) ----
do $$ begin
  begin
    insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
      values (current_setting('app.r1_id')::uuid, current_setting('app.p2')::uuid, 10, 90);
    raise exception 'SECURITY FAIL: Alice wrote Bob''s allocation';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: cross-player allocation insert blocked (%)', sqlerrm;
  end;
end $$;

-- ---- NEGATIVE: Alice cannot submit risky > her wealth (100) ------------------
do $$ begin
  begin
    update public.allocations set risky_amount = 150
      where player_id = current_setting('app.p1')::uuid;
    raise exception 'SECURITY FAIL: risky > wealth accepted';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: over-wealth allocation blocked (%)', sqlerrm;
  end;
end $$;

-- ---- NEGATIVE: Alice cannot directly write current_wealth -------------------
do $$ begin
  begin
    update public.players set current_wealth = 999999
      where id = current_setting('app.p1')::uuid;
    raise exception 'SECURITY FAIL: student inflated current_wealth';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: direct current_wealth write blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- Bob submits 50 risky
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
  values (:'r1_id', :'p2', 50, 50);

-- ---- NEGATIVE: Bob cannot SEE Alice's allocation ----------------------------
do $$
declare n int;
begin
  select count(*) into n from public.allocations
    where player_id = current_setting('app.p1')::uuid;
  if n <> 0 then raise exception 'SECURITY FAIL: Bob read Alice''s allocation (% rows)', n; end if;
  raise notice 'PASS: other players'' allocations are invisible to students';
end $$;
reset role;

-- ---- NEGATIVE: a student may NOT lock or resolve the round ------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.lock_round(current_setting('app.session_id')::uuid,
                              current_setting('app.r1_num')::int);
    raise exception 'SECURITY FAIL: student locked the round';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: student lock_round blocked (%)', sqlerrm;
  end;
end $$;
do $$ begin
  begin
    perform public.resolve_round(current_setting('app.session_id')::uuid,
                                 current_setting('app.r1_num')::int, 'good');
    raise exception 'SECURITY FAIL: student resolved the round';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: student resolve_round blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---- NEGATIVE: an outsider (not a member) cannot read the session ----------
select set_config('request.jwt.claims', :'outsider_jwt', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.sessions
    where id = current_setting('app.session_id')::uuid;
  if n <> 0 then raise exception 'SECURITY FAIL: outsider read the session'; end if;
  select count(*) into n from public.players
    where session_id = current_setting('app.session_id')::uuid;
  if n <> 0 then raise exception 'SECURITY FAIL: outsider read the player list'; end if;
  raise notice 'PASS: non-member sees no session/player rows';
end $$;
reset role;

-- ---- HOST locks & resolves round 1 as GOOD ---------------------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.lock_round(:'session_id', :'r1_num');

-- ---- NEGATIVE: resolving before lock is refused (resolve again after) is
--      covered below; first confirm a not-locked round can't be resolved by
--      trying to resolve round 1 a second time after it is revealed.
select public.resolve_round(:'session_id', :'r1_num', 'good');
reset role;

-- assert: both players now have 50 + 50*1.1 = 105
do $$
declare wa numeric; wb numeric; mo text;
begin
  select current_wealth into wa from public.players where id = current_setting('app.p1')::uuid;
  select current_wealth into wb from public.players where id = current_setting('app.p2')::uuid;
  select market_outcome into mo from public.rounds where id = current_setting('app.r1_id')::uuid;
  if round(wa,4) <> 105 then raise exception 'MATH FAIL: Alice expected 105 got %', wa; end if;
  if round(wb,4) <> 105 then raise exception 'MATH FAIL: Bob expected 105 got %', wb; end if;
  if mo <> 'good' then raise exception 'FAIL: round outcome not recorded as good (%)', mo; end if;
  raise notice 'PASS: moderate/good 50/50 -> 105 for both; outcome=good';
end $$;

-- ---- NEGATIVE: resolving an already-revealed (not locked) round is refused --
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.resolve_round(current_setting('app.session_id')::uuid,
                                 current_setting('app.r1_num')::int, 'good');
    raise exception 'STATE FAIL: resolved a round that was not locked';
  exception when others then
    if position('STATE FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: resolve refused unless round is locked (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- ROUND 2: tests the NON-SUBMITTER default (all-safe). Alice goes all-in
-- (risky=105), Bob submits nothing. resolve(bad), moderate.
--   Alice: safe 0 + 105*0.9 = 94.5 ; Bob: unchanged 105
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select round_number as r2_num from public.next_round(:'session_id') \gset
reset role;
select id as r2_id from public.rounds
  where session_id = :'session_id' and round_number = :'r2_num' \gset

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
  values (:'r2_id', :'p1', 105, 0);
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.lock_round(:'session_id', :'r2_num');
select public.resolve_round(:'session_id', :'r2_num', 'bad');
reset role;

do $$
declare wa numeric; wb numeric;
begin
  select current_wealth into wa from public.players where id = current_setting('app.p1')::uuid;
  select current_wealth into wb from public.players where id = current_setting('app.p2')::uuid;
  if round(wa,4) <> 94.5 then raise exception 'MATH FAIL: Alice expected 94.5 got %', wa; end if;
  if round(wb,4) <> 105  then raise exception 'MATH FAIL: Bob (non-submitter) expected 105 got %', wb; end if;
  raise notice 'PASS: moderate/bad all-in -> 94.5; non-submitter defaulted all-safe -> 105';
end $$;

-- =============================================================================
-- Leaderboard visibility (this session hid the board from students)
-- =============================================================================
-- student get_my_rank works (Bob 105 = rank 1, Alice 94.5 = rank 2, total 2)
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
declare rk int; tot int;
begin
  select rank, total into rk, tot from public.get_my_rank(current_setting('app.session_id')::uuid);
  if rk <> 2 or tot <> 2 then raise exception 'FAIL: Alice rank expected 2/2 got %/%', rk, tot; end if;
  raise notice 'PASS: get_my_rank returns 2 of 2 for Alice';
end $$;
-- student get_leaderboard is DENIED when board hidden
do $$ begin
  begin
    perform * from public.get_leaderboard(current_setting('app.session_id')::uuid);
    raise exception 'SECURITY FAIL: student read hidden leaderboard';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: hidden leaderboard denied to student (%)', sqlerrm;
  end;
end $$;
reset role;
-- host get_leaderboard always works (2 rows)
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.get_leaderboard(current_setting('app.session_id')::uuid);
  if n <> 2 then raise exception 'FAIL: host leaderboard expected 2 rows got %', n; end if;
  raise notice 'PASS: host can read full ranked leaderboard (2 rows)';
end $$;
reset role;

-- =============================================================================
-- EXTREME payoff mode math, in a second session (auto market not needed here;
-- use manual to make the outcome deterministic).
--   100, 50 risky, extreme/good -> 50 + 50*2 = 150
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as s2_id, join_code as jc2
  from public.create_session(
    '{"payoff_mode":"extreme","num_rounds":2,"starting_wealth":100,
      "market_mode":"manual","market_scope":"shared"}'::jsonb) \gset
reset role;

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as p3 from public.join_session(:'jc2', 'Alice2') \gset
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select round_number as s2r1 from public.start_round(:'s2_id') \gset
reset role;
select id as s2r1_id from public.rounds
  where session_id = :'s2_id' and round_number = :'s2r1' \gset

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
  values (:'s2r1_id', :'p3', 50, 50);
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.lock_round(:'s2_id', :'s2r1');
select public.resolve_round(:'s2_id', :'s2r1', 'good');
reset role;

select set_config('app.p3', :'p3', false);
do $$
declare w numeric;
begin
  select current_wealth into w from public.players where id = current_setting('app.p3')::uuid;
  if round(w,4) <> 150 then raise exception 'MATH FAIL: extreme/good expected 150 got %', w; end if;
  raise notice 'PASS: extreme/good 50/50 -> 150';
end $$;

select '*** ALL STAGE-1 SELF-TESTS PASSED ***' as result;
