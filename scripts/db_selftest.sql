-- =============================================================================
-- db_selftest.sql — the game's security model and wealth math, proved against
-- EVERY migration in supabase/migrations (the schema as deployed): the basic
-- game's round loop, the manager game's secrecy model, and the index fund.
-- The account layer has its own suite, accounts_selftest.sql.
--
-- Run: npm run test:db   (scripts/db-selftest.mjs — no Docker needed)
--
-- Any failed assertion RAISEs and aborts the run with a nonzero exit code.
-- Identity is simulated the way Supabase does it: SET ROLE authenticated + a
-- request.jwt.claims GUC carrying sub / role / is_anonymous.
--
-- Convention:
--   * "PASS:" notices mark an assertion that held; "NOTE:" flags a state that
--     is deliberate for now but must change before launch.
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

-- ---- NEGATIVE: a signed-out caller may NOT host -----------------------------
select set_config('request.jwt.claims', '', false);
set role anon;
do $$ begin
  begin
    perform public.create_session('{}'::jsonb);
    raise exception 'SECURITY FAIL: a signed-out caller created a session';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: signed-out create_session blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---- An anonymous (guest) student hosting: the testing bypass ---------------
-- 0008_temp_allow_anon_host deliberately lets a guest host while the game is
-- in testing (CLAUDE.md). Either outcome passes; the NOTE is the reminder. Once
-- the launch revert lands (docs/DEPLOYMENT.md Part C.1), make this strict.
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  begin
    select id into v_id from public.create_session('{}'::jsonb);
  exception when others then
    raise notice 'PASS: anonymous create_session blocked (%)', sqlerrm;
    return;
  end;
  perform public.delete_session(v_id);
  raise notice 'NOTE: a guest can host — the 0008 testing bypass is live. Revert it before launch (docs/DEPLOYMENT.md Part C.1).';
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

-- Alice submits 50 risky. submit_allocation (0005) is the ONLY write path: it
-- resolves her player from auth.uid() and computes safe = wealth - risky itself.
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.submit_allocation(:'r1_id', 50);

-- ---- NEGATIVE: no direct writes to allocations, for anyone's player ---------
do $$ begin
  begin
    insert into public.allocations(round_id, player_id, risky_amount, safe_amount)
      values (current_setting('app.r1_id')::uuid, current_setting('app.p2')::uuid, 10, 90);
    raise exception 'SECURITY FAIL: Alice wrote Bob''s allocation';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: direct allocation insert blocked (%)', sqlerrm;
  end;
end $$;
do $$ begin
  begin
    update public.allocations set risky_amount = 150
      where player_id = current_setting('app.p1')::uuid;
    raise exception 'SECURITY FAIL: Alice rewrote her allocation directly';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: direct allocation update blocked (%)', sqlerrm;
  end;
end $$;

-- ---- Alice cannot put more than her wealth (100) at risk ---------------------
-- submit_allocation CLAMPS rather than raising: 0 <= risky <= current wealth,
-- and safe is derived server-side, so an over-wealth request stores all-in.
do $$
declare a public.allocations%rowtype;
begin
  a := public.submit_allocation(current_setting('app.r1_id')::uuid, 150);
  if a.risky_amount <> 100 or a.safe_amount <> 0 then
    raise exception 'SECURITY FAIL: risky 150 on wealth 100 stored as %/%',
      a.risky_amount, a.safe_amount;
  end if;
  a := public.submit_allocation(current_setting('app.r1_id')::uuid, -20);
  if a.risky_amount <> 0 or a.safe_amount <> 100 then
    raise exception 'SECURITY FAIL: a negative risky amount stored as %/%',
      a.risky_amount, a.safe_amount;
  end if;
  raise notice 'PASS: risky is clamped to [0, wealth] server-side';
end $$;
-- back to the 50/50 the round-1 math below expects
select public.submit_allocation(:'r1_id', 50);

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
select public.submit_allocation(:'r1_id', 50);

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
select public.submit_allocation(:'r2_id', 105);
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
select public.submit_allocation(:'s2r1_id', 50);
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


-- =============================================================================
-- MANAGER GAME — the secrecy model. The whole module rests on students being
-- unable to see alpha, so these are security assertions, not feature tests.
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
-- index_fund off: this block pins the five-manager secrecy model; the index
-- fund has its own block at the end.
select id as m_id, join_code as m_code from public.create_session(
  '{"game_type":"manager","num_rounds":3,"starting_wealth":100,
    "show_full_leaderboard_to_students":true,"index_fund":false}'::jsonb) \gset
reset role;

select set_config('app.m_id', :'m_id', false);

-- ---- sessions.config must carry NO true parameters --------------------------
do $$
declare c text;
begin
  select config::text into c from public.sessions where id = current_setting('app.m_id')::uuid;
  if position('alpha' in c) > 0 then
    raise exception 'SECURITY FAIL: sessions.config leaks alpha';
  end if;
  if position('tracking_error' in c) > 0 then
    raise exception 'SECURITY FAIL: sessions.config leaks tracking_error';
  end if;
  if position('"beta"' in c) > 0 then
    raise exception 'SECURITY FAIL: sessions.config leaks beta';
  end if;
  if position('track_record' in c) = 0 then
    raise exception 'FAIL: manager config is missing the public track records';
  end if;
  raise notice 'PASS: manager config carries public data only';
end $$;

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as m_p1 from public.join_session(:'m_code', 'Alice') \gset
reset role;

-- ---- NEGATIVE: a student may NOT read session_secrets -----------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
begin
  perform 1 from public.session_secrets;
  raise exception 'SECURITY FAIL: student read session_secrets';
exception when others then
  if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
  raise notice 'PASS: session_secrets is unreadable by students (%)', sqlerrm;
end $$;
reset role;

-- ---- NEGATIVE: a student may NOT get the truth mid-game ---------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
begin
  perform public.get_manager_truth(current_setting('app.m_id')::uuid);
  raise exception 'SECURITY FAIL: student read manager truth before the game ended';
exception when others then
  if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
  raise notice 'PASS: get_manager_truth refuses students mid-game (%)', sqlerrm;
end $$;
reset role;

-- ---- POSITIVE: the host may read the truth at any status --------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.get_manager_truth(current_setting('app.m_id')::uuid);
  if jsonb_array_length(t->'managers') <> 5 then
    raise exception 'FAIL: expected 5 managers in the truth, got %',
      jsonb_array_length(t->'managers');
  end if;
  if not (t->'managers'->0 ? 'alpha') then
    raise exception 'FAIL: manager truth is missing alpha';
  end if;
  raise notice 'PASS: host reads manager truth while the game is live';
end $$;
reset role;

-- ---- Leverage + fees round-trip through resolve_round -----------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.start_round(:'m_id');
reset role;

select current_round as m_r1 from public.sessions where id = :'m_id' \gset
select id as m_r1_id from public.rounds
  where session_id = :'m_id' and round_number = :'m_r1' \gset

select set_config('app.m_r1_id', :'m_r1_id', false);

-- Alice levers 1.5x: $150 across the 5 managers on $100 of wealth.
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.submit_manager_allocation(:'m_r1_id', array[30,30,30,30,30]::numeric[]);
reset role;

-- ---- NEGATIVE: past the leverage cap is rejected ----------------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
begin
  perform public.submit_manager_allocation(
    current_setting('app.m_r1_id')::uuid, array[100,100,100,0,0]::numeric[]);
  raise exception 'SECURITY FAIL: allocation above the leverage cap was accepted';
exception when others then
  if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
  raise notice 'PASS: leverage cap enforced server-side (%)', sqlerrm;
end $$;
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.lock_round(:'m_id', :'m_r1');
select public.resolve_round(:'m_id', :'m_r1');
reset role;

select set_config('app.m_p1', :'m_p1', false);
do $$
declare a public.allocations%rowtype; r public.rounds%rowtype;
begin
  select * into r from public.rounds where id = current_setting('app.m_r1_id')::uuid;
  if r.market_return is null then
    raise exception 'FAIL: resolve_round did not write market_return';
  end if;
  if jsonb_array_length(r.manager_returns) <> 5 then
    raise exception 'FAIL: expected 5 manager returns';
  end if;

  select * into a from public.allocations
    where round_id = r.id and player_id = current_setting('app.m_p1')::uuid;
  -- levered 1.5x: safe_amount is NEGATIVE and is the borrowing
  if a.safe_amount >= 0 then
    raise exception 'FAIL: levered allocation should carry a negative safe_amount, got %',
      a.safe_amount;
  end if;
  if round(a.risky_amount + a.safe_amount, 4) <> 100 then
    raise exception 'FAIL: risky + safe must equal starting wealth, got %',
      a.risky_amount + a.safe_amount;
  end if;
  if a.fees_paid is null or a.fees_paid <= 0 then
    raise exception 'FAIL: a fully invested year must charge management fees, got %',
      a.fees_paid;
  end if;
  raise notice 'PASS: manager year resolved — levered, fee-charged, invariant held';
end $$;

-- ---- POSITIVE: once finished, students may read the truth -------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.finish_session(:'m_id');
reset role;

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.get_manager_truth(current_setting('app.m_id')::uuid);
  if jsonb_array_length(t->'managers') <> 5 then
    raise exception 'FAIL: finished-game truth is malformed';
  end if;
  raise notice 'PASS: students read the manager truth once the game is finished';
end $$;
reset role;

-- =============================================================================
-- INDEX FUND (0026) — appended after the shuffle, tracks the index exactly,
-- charges 0.05%. A second host keeps these sessions clear of the first host's
-- quota.
-- =============================================================================
insert into auth.users(id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-000000000002', 'prof2@example.edu', false)
on conflict do nothing;
\set host2_jwt '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}'

select set_config('request.jwt.claims', :'host2_jwt', false);
set role authenticated;
select id as ix_id, join_code as ix_code from public.create_session(
  '{"game_type":"manager","num_rounds":3,"starting_wealth":100}'::jsonb) \gset
select id as ix_hf_id from public.create_session(
  '{"game_type":"manager","num_rounds":3,"manager_preset":"hedge_fund"}'::jsonb) \gset
select id as ix_off_id from public.create_session(
  '{"game_type":"manager","num_rounds":3,"index_fund":false}'::jsonb) \gset
reset role;

select set_config('app.ix_id', :'ix_id', false);
select set_config('app.ix_hf_id', :'ix_hf_id', false);
select set_config('app.ix_off_id', :'ix_off_id', false);

-- ---- on by default, last, public-only, never shuffled -----------------------
do $$
declare c jsonb; f jsonb; t jsonb; s jsonb;
begin
  select config into c from public.sessions where id = current_setting('app.ix_id')::uuid;
  if (c->>'index_fund')::boolean is distinct from true then
    raise exception 'FAIL: index_fund should default to true, got %', c->'index_fund';
  end if;
  if (c->>'num_managers')::int <> 6 or jsonb_array_length(c->'managers') <> 6 then
    raise exception 'FAIL: default line-up plus the index fund should be 6, got %',
      c->>'num_managers';
  end if;
  f := c->'managers'->5;
  if (f->>'index_fund')::boolean is distinct from true
     or (f->>'mgmt_fee')::numeric <> 0.0005 or (f->>'perf_fee')::numeric <> 0 then
    raise exception 'FAIL: the last slot is not a 0.05%% index fund: %', f;
  end if;
  if f ? 'alpha' or f ? 'beta' or f ? 'tracking_error' then
    raise exception 'SECURITY FAIL: the index fund''s public entry carries truth: %', f;
  end if;
  if jsonb_array_length(f->'track_record'->'yearly') <> 10 then
    raise exception 'FAIL: the index fund needs a 10-year track record';
  end if;

  select secret into s from public.session_secrets
    where session_id = current_setting('app.ix_id')::uuid;
  t := s->'managers'->5;
  if (t->>'beta')::numeric <> 1 or (t->>'alpha')::numeric <> 0
     or (t->>'tracking_error')::numeric <> 0 then
    raise exception 'FAIL: index fund truth should be beta 1, alpha 0, TE 0: %', t;
  end if;
  if jsonb_array_length(s->'permutation') <> 5 then
    raise exception 'FAIL: the shuffle must cover the 5 active slots only, got %',
      s->'permutation';
  end if;
  raise notice 'PASS: index fund appended last, public-only, outside the shuffle';
end $$;

-- ---- hedge-fund preset: still 0.05%, never 2-and-20; and it can be switched off
do $$
declare f jsonb; n int;
begin
  select config->'managers'->5 into f from public.sessions
    where id = current_setting('app.ix_hf_id')::uuid;
  if (f->>'mgmt_fee')::numeric <> 0.0005 or (f->>'perf_fee')::numeric <> 0 then
    raise exception 'FAIL: the hedge-fund preset put the index fund on its fees: %', f;
  end if;
  select (config->>'num_managers')::int into n from public.sessions
    where id = current_setting('app.ix_off_id')::uuid;
  if n <> 5 then
    raise exception 'FAIL: index_fund=false should leave 5 managers, got %', n;
  end if;
  raise notice 'PASS: index fund keeps its own fee, and switches off';
end $$;

-- ---- a resolved year: gross = the market exactly, fee = 0.05% ----------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as ix_p1 from public.join_session(:'ix_code', 'Alice') \gset
reset role;
select set_config('app.ix_p1', :'ix_p1', false);

select set_config('request.jwt.claims', :'host2_jwt', false);
set role authenticated;
select public.start_round(:'ix_id');
reset role;
select id as ix_r1_id from public.rounds
  where session_id = :'ix_id' and round_number = 1 \gset
select set_config('app.ix_r1_id', :'ix_r1_id', false);

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.submit_manager_allocation(:'ix_r1_id', array[0,0,0,0,0,100]::numeric[]);
reset role;

select set_config('request.jwt.claims', :'host2_jwt', false);
set role authenticated;
select public.lock_round(:'ix_id', 1);
select public.resolve_round(:'ix_id', 1);
reset role;

do $$
declare r public.rounds%rowtype; a public.allocations%rowtype;
begin
  select * into r from public.rounds where id = current_setting('app.ix_r1_id')::uuid;
  -- 0015 stores market_return rounded to 6 places and manager_returns unrounded,
  -- so "exactly" is judged at the stored precision.
  if round((r.manager_returns->>5)::numeric, 6) <> r.market_return then
    raise exception 'FAIL: index fund returned % in a % market',
      r.manager_returns->>5, r.market_return;
  end if;
  select * into a from public.allocations
    where round_id = r.id and player_id = current_setting('app.ix_p1')::uuid;
  if round(a.fees_paid, 4) <> 0.05 then
    raise exception 'FAIL: $100 in the index fund should pay $0.05, paid %', a.fees_paid;
  end if;
  if round(a.resulting_wealth, 2) <> round(100 * (1 + r.market_return) - 0.05, 2) then
    raise exception 'FAIL: index fund holder ended at %, expected %',
      a.resulting_wealth, 100 * (1 + r.market_return) - 0.05;
  end if;
  raise notice 'PASS: index fund tracks the market exactly, less 0.05%%';
end $$;

-- =============================================================================
-- PLAYER NAMES AND MODERATION (0028) — what reaches the projector
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as nm_sid, join_code as nm_code
  from public.create_session('{"num_rounds":2,"market_mode":"manual"}'::jsonb) \gset
reset role;
select set_config('app.nm_sid', :'nm_sid', false);
select set_config('app.nm_code', :'nm_code', false);

-- join_session cleans the name: bidi overrides and control characters out,
-- 40 characters at most. (chr(8238) is U+202E, which reverses the text after it.)
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as nm_p1
  from public.join_session(:'nm_code', '  Al' || chr(8238) || 'ice' || chr(10) || repeat('x', 60)) \gset
reset role;
select set_config('app.nm_p1', :'nm_p1', false);

select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select id as nm_p2 from public.join_session(:'nm_code', 'Bob') \gset
reset role;
select set_config('app.nm_p2', :'nm_p2', false);

do $$
declare v text;
begin
  select display_name into v from public.players where id = current_setting('app.nm_p1')::uuid;
  if char_length(v) > 40 or position(chr(8238) in v) > 0 or position(chr(10) in v) > 0 then
    raise exception 'SECURITY FAIL: join_session stored an unclean name: %', v;
  end if;
  if v not like 'Alice%' then raise exception 'FAIL: cleaning mangled the name into %', v; end if;
  raise notice 'PASS: join_session strips control/bidi characters and caps names at 40';
end $$;

-- The column enforces it on every path, even the owner's.
do $$ begin
  begin
    update public.players set display_name = repeat('y', 41) where id = current_setting('app.nm_p1')::uuid;
    raise exception 'SECURITY FAIL: stored a 41-character player name';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: players.display_name CHECK rejects 41 characters (%)', sqlerrm;
  end;
  begin
    update public.players set display_name = '   ' where id = current_setting('app.nm_p1')::uuid;
    raise exception 'SECURITY FAIL: stored a blank player name';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: players.display_name CHECK rejects a blank name (%)', sqlerrm;
  end;
end $$;

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;

-- ---- NEGATIVE: no direct rename; the RPC works in the lobby -----------------
do $$ begin
  begin
    update public.players set display_name = repeat('X', 200000)
     where id = current_setting('app.nm_p1')::uuid;
    raise exception 'SECURITY FAIL: a student renamed themself with a direct update';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: direct display_name update blocked (%)', sqlerrm;
  end;
end $$;

do $$
declare p public.players%rowtype;
begin
  p := public.set_my_display_name(current_setting('app.nm_sid')::uuid, '   ');
  if p.display_name <> 'Player' then raise exception 'FAIL: a blank rename stored %', p.display_name; end if;
  p := public.set_my_display_name(current_setting('app.nm_sid')::uuid, 'Alice B');
  if p.display_name <> 'Alice B' then raise exception 'FAIL: the lobby rename did not apply'; end if;
  raise notice 'PASS: set_my_display_name renames in the lobby (blank becomes Player)';
end $$;

-- ---- NEGATIVE: auth_uid is not readable by students ------------------------
do $$
declare n int;
begin
  begin
    perform auth_uid from public.players where session_id = current_setting('app.nm_sid')::uuid;
    raise exception 'SECURITY FAIL: a student read players.auth_uid';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: players.auth_uid is not selectable by clients (%)', sqlerrm;
  end;
  -- ...while the policies that use it still work: the board is on, so Alice
  -- sees Bob too, and she can still find her own row.
  select count(*) into n from public.players where session_id = current_setting('app.nm_sid')::uuid;
  if n <> 2 then raise exception 'FAIL: Alice sees % players, expected 2', n; end if;
  if public.get_my_player_id(current_setting('app.nm_sid')::uuid)
     is distinct from current_setting('app.nm_p1')::uuid then
    raise exception 'FAIL: get_my_player_id did not return the caller''s row';
  end if;
  raise notice 'PASS: the roster stays visible and get_my_player_id finds "me"';
end $$;

-- ---- NEGATIVE: a student may not moderate ----------------------------------
do $$ begin
  begin
    perform public.host_rename_player(current_setting('app.nm_p2')::uuid, 'lol');
    raise exception 'SECURITY FAIL: a student renamed a classmate';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: student host_rename_player blocked (%)', sqlerrm;
  end;
  begin
    perform public.host_remove_player(current_setting('app.nm_p2')::uuid);
    raise exception 'SECURITY FAIL: a student removed a classmate';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: student host_remove_player blocked (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---- the host renames and removes; a removed player cannot rejoin ----------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.host_rename_player(:'nm_p2', 'Robert');
do $$ begin
  if (select display_name from public.players where id = current_setting('app.nm_p2')::uuid) <> 'Robert' then
    raise exception 'FAIL: host_rename_player did not apply';
  end if;
  raise notice 'PASS: the host can rename a player';
end $$;
select public.host_remove_player(:'nm_p2');
select count(*) as nm_bots from public.add_benchmark_bots(:'nm_sid') \gset
do $$
declare v_bot uuid;
begin
  select id into v_bot from public.players
   where session_id = current_setting('app.nm_sid')::uuid and is_bot limit 1;
  begin
    perform public.host_remove_player(v_bot);
    raise exception 'FAIL: removed a benchmark player';
  exception when others then
    if position('FAIL: removed' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: benchmark players cannot be removed (%)', sqlerrm;
  end;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.players where id = current_setting('app.nm_p2')::uuid) then
    raise exception 'FAIL: host_remove_player left the player row';
  end if;
  raise notice 'PASS: the host can remove a player';
end $$;

select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
do $$ begin
  begin
    -- the code from the projector: Bob can no longer read the session row
    perform public.join_session(current_setting('app.nm_code'), 'Bob again');
    raise exception 'SECURITY FAIL: a removed player rejoined';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: a removed player cannot rejoin (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---- once the game starts, names are fixed (except by the host) ------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.start_round(:'nm_sid');
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.set_my_display_name(current_setting('app.nm_sid')::uuid, 'Surprise');
    raise exception 'SECURITY FAIL: a student renamed themself mid-game';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: students cannot rename once the game has started (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- HIDDEN ODDS (0029) — "hide the odds" hides them from the data, not just the UI
-- =============================================================================
-- good_prob 1 is chosen so it is observable without reading it: the Edge bot
-- stakes (2p - 1) of its wealth, so it goes all-in at p = 1 and stakes 20% at
-- the 0.6 fallback resolve_round would use if it could not see the hidden odds.
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as ho_sid, join_code as ho_code
  from public.create_session('{"num_rounds":3,"market_mode":"auto","market_scope":"shared",
      "good_prob":1,"show_odds_to_students":false}'::jsonb) \gset
reset role;
select set_config('app.ho_sid', :'ho_sid', false);

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as ho_p1 from public.join_session(:'ho_code', 'Alice') \gset
do $$
declare c jsonb;
begin
  select config into c from public.sessions where id = current_setting('app.ho_sid')::uuid;
  if c ? 'good_prob' then
    raise exception 'SECURITY FAIL: a student can read hidden odds (good_prob = %)', c->>'good_prob';
  end if;
  if public.get_hidden_odds(current_setting('app.ho_sid')::uuid) is not null then
    raise exception 'SECURITY FAIL: get_hidden_odds answered a student';
  end if;
  raise notice 'PASS: hidden odds are absent from the student''s copy of the session';
end $$;
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$ begin
  if (public.get_hidden_odds(current_setting('app.ho_sid')::uuid)->>'good_prob')::numeric <> 1 then
    raise exception 'FAIL: the host cannot read the hidden odds';
  end if;
  raise notice 'PASS: the host reads hidden odds through get_hidden_odds';
end $$;
select count(*) as ho_bots from public.add_benchmark_bots(:'ho_sid') \gset
select public.start_round(:'ho_sid');
select public.lock_round(:'ho_sid', 1);
select public.resolve_round(:'ho_sid', 1);
reset role;
select set_config('app.ho_edge', (select id::text from public.players
  where session_id = :'ho_sid' and strategy = 'edge'), false);

do $$
declare r public.rounds%rowtype; a public.allocations%rowtype;
begin
  select * into r from public.rounds where session_id = current_setting('app.ho_sid')::uuid and round_number = 1;
  select * into a from public.allocations where round_id = r.id and player_id = current_setting('app.ho_edge')::uuid;
  if a.risky_amount <> 100 or r.market_outcome <> 'good' then
    raise exception 'FAIL: resolve_round ignored the hidden odds (edge staked %, market %)',
      a.risky_amount, r.market_outcome;
  end if;
  raise notice 'PASS: resolve_round plays the hidden odds';
end $$;

-- ---- a second reveal of the same round is refused --------------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.resolve_round(current_setting('app.ho_sid')::uuid, 1);
    raise exception 'FAIL: a revealed round was resolved again';
  exception when others then
    if position('FAIL: a revealed' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: a revealed round cannot be resolved again (%)', sqlerrm;
  end;
end $$;

-- ---- retuning hidden odds keeps them hidden, and the next round uses them ---
select public.set_good_prob(:'ho_sid', 0);
select public.next_round(:'ho_sid');
select public.lock_round(:'ho_sid', 2);
select public.resolve_round(:'ho_sid', 2);
reset role;
do $$
declare c jsonb; r public.rounds%rowtype; a public.allocations%rowtype;
begin
  select config into c from public.sessions where id = current_setting('app.ho_sid')::uuid;
  if c ? 'good_prob' then
    raise exception 'SECURITY FAIL: set_good_prob wrote hidden odds where students can read them';
  end if;
  select * into r from public.rounds where session_id = current_setting('app.ho_sid')::uuid and round_number = 2;
  select * into a from public.allocations where round_id = r.id and player_id = current_setting('app.ho_edge')::uuid;
  if a.risky_amount <> 0 or r.market_outcome <> 'bad' then
    raise exception 'FAIL: retuned hidden odds were not used (edge staked %, market %)',
      a.risky_amount, r.market_outcome;
  end if;
  raise notice 'PASS: set_good_prob while hidden stays hidden, and the next round uses it';
end $$;

-- ---- showing them puts them back; hiding again takes them away -------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.set_show_odds(:'ho_sid', true);
reset role;
do $$ begin
  if (select (config->>'good_prob')::numeric from public.sessions
       where id = current_setting('app.ho_sid')::uuid) is distinct from 0 then
    raise exception 'FAIL: showing the odds did not restore good_prob';
  end if;
  if exists (select 1 from public.session_secrets where session_id = current_setting('app.ho_sid')::uuid) then
    raise exception 'FAIL: shown odds left a copy in session_secrets';
  end if;
  raise notice 'PASS: set_show_odds(true) restores the odds to the session';
end $$;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.set_show_odds(:'ho_sid', false);
select public.finish_session(:'ho_sid');
reset role;
do $$ begin
  if (select (config->>'good_prob')::numeric from public.sessions
       where id = current_setting('app.ho_sid')::uuid) is distinct from 0 then
    raise exception 'FAIL: finishing the game did not reveal the odds';
  end if;
  raise notice 'PASS: finishing the game reveals the odds to students';
end $$;

-- ---- portfolio: per-asset odds are hidden too ------------------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as hp_sid from public.create_session(
  '{"game_type":"portfolio","num_assets":2,"num_rounds":2,"show_odds_to_students":false,
    "assets":[{"name":"Tech","good_prob":0.9},{"name":"Bonds","good_prob":0.1}]}'::jsonb) \gset
reset role;
select set_config('app.hp_sid', :'hp_sid', false);
do $$
declare c jsonb; s jsonb;
begin
  select config into c from public.sessions where id = current_setting('app.hp_sid')::uuid;
  select secret->'odds' into s from public.session_secrets
   where session_id = current_setting('app.hp_sid')::uuid;
  if c->'assets'->0 ? 'good_prob' or c->'assets'->1 ? 'good_prob' then
    raise exception 'SECURITY FAIL: per-asset odds are readable while hidden';
  end if;
  if c->'assets'->0->>'name' <> 'Tech' then
    raise exception 'FAIL: hiding the odds dropped the rest of the asset (%)', c->'assets'->0;
  end if;
  if (s->'assets'->>0)::numeric <> 0.9 or (s->'assets'->>1)::numeric <> 0.1 then
    raise exception 'FAIL: per-asset odds were not stashed intact: %', s;
  end if;
  raise notice 'PASS: per-asset odds are stashed, and the assets keep their other fields';
end $$;

select '*** ALL GAME SELF-TESTS PASSED ***' as result;
