-- =============================================================================
-- accounts_selftest.sql — proves the account layer (migrations 0016-0025)
-- against EVERY migration in supabase/migrations, the schema as deployed.
-- db_selftest.sql covers the game itself; the two run as separate suites, each
-- on a fresh database.
--
-- Run: npm run test:db   (or: npm run test:db -- accounts)
--
-- Convention (shared with db_selftest.sql):
--   * "PASS:" notices mark an assertion that held.
--   * a raised exception containing FAIL means an invariant broke.
-- =============================================================================
\set ON_ERROR_STOP on

-- =============================================================================
-- 1. Sign-up creates a profile — and only for real identities
-- =============================================================================
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'prof@example.edu', false,
   '{"username":"jsmith","display_name":"J. Smith"}'::jsonb);

do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = 'a1000000-0000-0000-0000-000000000001';
  if not found then raise exception 'FAIL: no profile created for a real sign-up'; end if;
  if p.username <> 'jsmith' then
    raise exception 'FAIL: username not taken from sign-up metadata, got %', p.username;
  end if;
  if p.role <> 'user' or p.plan <> 'free' then
    raise exception 'FAIL: unexpected default role/plan % / %', p.role, p.plan;
  end if;
  raise notice 'PASS: sign-up creates a profile with the chosen username';
end $$;

-- A guest is not an account.
insert into auth.users (id, email, is_anonymous) values
  ('b1000000-0000-0000-0000-000000000001', null, true),
  ('b1000000-0000-0000-0000-000000000002', null, true);

do $$ begin
  if exists (select 1 from public.profiles where id = 'b1000000-0000-0000-0000-000000000001') then
    raise exception 'FAIL: an anonymous guest got a profile row';
  end if;
  raise notice 'PASS: anonymous guests get no profile row';
end $$;

-- =============================================================================
-- 2. user_metadata cannot be used to steal a username or claim a role
-- =============================================================================
do $$ begin
  begin
    insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
      ('a1000000-0000-0000-0000-000000000002', 'thief@example.edu', false,
       '{"username":"JSMITH"}'::jsonb);
    raise exception 'SECURITY FAIL: a taken username was re-used via metadata';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: duplicate username rejected at sign-up (%)', sqlerrm;
  end;
end $$;

-- role in metadata is ignored: profiles.role is the only thing anything reads.
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000003', 'sneaky@example.edu', false,
   '{"username":"sneaky","role":"admin","plan":"dept"}'::jsonb);

do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = 'a1000000-0000-0000-0000-000000000003';
  if p.role <> 'user' or p.plan <> 'free' then
    raise exception 'SECURITY FAIL: metadata set role/plan to % / %', p.role, p.plan;
  end if;
  raise notice 'PASS: role/plan in user_metadata are ignored';
end $$;

-- OAuth sign-up (no username in metadata) gets one derived from the email.
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000004', 'jsmith@other.edu', false,
   '{"name":"Jane Smith"}'::jsonb);

do $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = 'a1000000-0000-0000-0000-000000000004';
  if p.username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'FAIL: generated username is malformed: %', p.username;
  end if;
  if lower(p.username) = 'jsmith' then
    raise exception 'FAIL: generated username collided with the existing jsmith';
  end if;
  raise notice 'PASS: OAuth sign-up gets a generated, unique username (%)', p.username;
end $$;

-- username_available is what a registration form calls before signing up, so a
-- wrong answer here reads to the user as "that username is taken" for every name
-- they try. It must be exact about all four cases.
do $$ begin
  if public.username_available('a_free_name') is not true then
    raise exception 'FAIL: a free, valid username reported as unavailable';
  end if;
  if public.username_available('jsmith') is not false then
    raise exception 'FAIL: a taken username reported as available';
  end if;
  if public.username_available('JSmiTH') is not false then
    raise exception 'FAIL: username availability is case sensitive; it must not be';
  end if;
  if public.username_available('ab') is not false then
    raise exception 'FAIL: a too-short username reported as available';
  end if;
  if public.username_available('has space') is not false then
    raise exception 'FAIL: a malformed username reported as available';
  end if;
  if public.username_available(null) is not false then
    raise exception 'FAIL: null username reported as available';
  end if;
  raise notice 'PASS: username_available answers correctly for free/taken/malformed/null';
end $$;

\set prof_jwt   '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}'
\set sneaky_jwt '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":false}'
\set guest_jwt  '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}'
\set guest2_jwt '{"sub":"b1000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}'

-- =============================================================================
-- 3. Profile isolation and column grants
-- =============================================================================
select set_config('request.jwt.claims', :'sneaky_jwt', false);
set role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.profiles
    where id = 'a1000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'SECURITY FAIL: read another account''s profile'; end if;
  raise notice 'PASS: a signed-in user cannot read another profile row';
end $$;

do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'SECURITY FAIL: self-promoted to admin';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: role escalation blocked by column grant (%)', sqlerrm;
  end;
end $$;

do $$ begin
  begin
    update public.profiles set plan = 'dept' where id = auth.uid();
    raise exception 'SECURITY FAIL: self-upgraded plan';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: plan escalation blocked by column grant (%)', sqlerrm;
  end;
end $$;

do $$ begin
  begin
    update public.profiles set username = 'stolen' where id = auth.uid();
    raise exception 'SECURITY FAIL: wrote username directly, bypassing validation';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: direct username write blocked by column grant (%)', sqlerrm;
  end;
end $$;

-- The two columns that ARE granted still work.
update public.profiles set display_name = 'Renamed', institution = 'Example U'
  where id = auth.uid();
do $$ begin
  if not exists (select 1 from public.profiles
                 where id = auth.uid() and display_name = 'Renamed') then
    raise exception 'FAIL: display_name update did not apply';
  end if;
  raise notice 'PASS: display_name/institution remain writable by their owner';
end $$;

-- set_my_username validates format and uniqueness.
do $$ begin
  begin
    perform public.set_my_username('no spaces!');
    raise exception 'SECURITY FAIL: accepted a malformed username';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: malformed username rejected (%)', sqlerrm;
  end;
  begin
    perform public.set_my_username('jsmith');
    raise exception 'SECURITY FAIL: took a username already in use';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: taken username rejected (%)', sqlerrm;
  end;
  perform public.set_my_username('sneaky_renamed');
  raise notice 'PASS: set_my_username accepts a valid, free name';
end $$;
reset role;

-- =============================================================================
-- 4. claim_my_account refuses a guest who has not linked an identity
-- =============================================================================
select set_config('request.jwt.claims', :'guest_jwt', false);
set role authenticated;
do $$ begin
  begin
    perform public.claim_my_account('guesty');
    raise exception 'SECURITY FAIL: an anonymous user claimed an account';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: claim_my_account rejects an anonymous caller (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- 5. A guest plays, then claims — and keeps the history
-- =============================================================================
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
select id as s_id, join_code as s_code from public.create_session(
  '{"num_rounds":1,"starting_wealth":100,"market_mode":"manual"}'::jsonb) \gset
reset role;
select set_config('app.s_id', :'s_id', false);

select set_config('request.jwt.claims', :'guest_jwt', false);
set role authenticated;
select id as g_pid from public.join_session(:'s_code', 'Guesty') \gset
reset role;
select set_config('app.g_pid', :'g_pid', false);

-- Play one round so there is something worth keeping.
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
select round_number as rn from public.start_round(:'s_id') \gset
reset role;
select id as r_id from public.rounds
  where session_id = :'s_id' and round_number = :rn \gset

select set_config('request.jwt.claims', :'guest_jwt', false);
set role authenticated;
select public.submit_allocation(:'r_id', 50);
reset role;
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
select public.lock_round(:'s_id', :rn);
select public.resolve_round(:'s_id', :rn, 'good');
select public.finish_session(:'s_id');
reset role;

-- The guest links an identity: same auth.users.id, is_anonymous flips.
update auth.users set is_anonymous = false, email = 'guesty@example.edu'
  where id = 'b1000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',
  false);
set role authenticated;
do $$
declare p public.profiles; h record; n int;
begin
  p := public.claim_my_account('guesty', 'Guesty');
  if p.username <> 'guesty' then raise exception 'FAIL: claim did not set the username'; end if;

  select count(*) into n from public.get_my_history();
  if n <> 1 then raise exception 'FAIL: history should carry the pre-claim session, got %', n; end if;
  select * into h from public.get_my_history() limit 1;
  if h.total < 1 or h.rank < 1 then raise exception 'FAIL: malformed history row'; end if;
  raise notice 'PASS: a claimed guest keeps the sessions played before claiming';
end $$;
reset role;

-- =============================================================================
-- 6. Session quota (free plan = 12 per 30 days)
-- =============================================================================
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
do $$
declare i int;
begin
  -- one session already exists from section 5
  for i in 2..12 loop
    perform public.create_session('{"num_rounds":1}'::jsonb);
  end loop;
  begin
    perform public.create_session('{"num_rounds":1}'::jsonb);
    raise exception 'SECURITY FAIL: session quota did not bind at 12';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: session quota blocks the 13th session (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- 7. Player cap
-- =============================================================================
do $$
declare v_sid uuid; i int;
begin
  select id into v_sid from public.sessions
   where host_id = 'a1000000-0000-0000-0000-000000000001' and status = 'lobby' limit 1;

  -- purged_at is set inline: a human row with no auth_uid must carry it, or the
  -- widened players_auth_or_bot_chk (0019) rejects the insert. This section is
  -- about the cap, not about identity.
  insert into public.players (session_id, auth_uid, display_name, current_wealth, purged_at)
  select v_sid, null, 'Filler ' || g, 100, now() from generate_series(1, 400) g;

  begin
    insert into public.players (session_id, auth_uid, display_name, current_wealth, purged_at)
    values (v_sid, null, 'One too many', 100, now());
    raise exception 'SECURITY FAIL: player cap did not bind at 400';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: player cap blocks the 401st student (%)', sqlerrm;
  end;
end $$;

-- =============================================================================
-- 8. THE BIG ONE: purging a stale guest severs, it does not cascade
-- =============================================================================
do $$
declare
  v_before_players int;
  v_before_allocs  int;
  v_after_players  int;
  v_after_allocs   int;
  v_purged         int;
  v_uid            uuid := 'b1000000-0000-0000-0000-000000000002';
  v_sid            uuid := current_setting('app.s_id')::uuid;
  v_pid            uuid;
begin
  -- A second guest who played the (now finished) session.
  insert into public.players (session_id, auth_uid, display_name, current_wealth)
  values (v_sid, v_uid, 'Stale Guest', 120) returning id into v_pid;
  insert into public.allocations (round_id, player_id, risky_amount, safe_amount, resulting_wealth)
  select r.id, v_pid, 40, 60, 120 from public.rounds r where r.session_id = v_sid limit 1;

  select count(*) into v_before_players from public.players where id = v_pid;
  select count(*) into v_before_allocs  from public.allocations where player_id = v_pid;
  if v_before_players <> 1 or v_before_allocs <> 1 then
    raise exception 'FAIL: test fixture did not set up (% players, % allocs)',
      v_before_players, v_before_allocs;
  end if;

  -- Age the guest past the retention window — both the account and its last
  -- game, since recent play keeps a guest alive (0024) — then purge.
  update auth.users set created_at = now() - interval '90 days' where id = v_uid;
  update public.players set joined_at = now() - interval '90 days' where id = v_pid;
  v_purged := public.purge_stale_guests(45);
  if v_purged < 1 then raise exception 'FAIL: purge removed nothing'; end if;

  select count(*) into v_after_players from public.players where id = v_pid;
  select count(*) into v_after_allocs  from public.allocations where player_id = v_pid;

  if v_after_players <> 1 then
    raise exception 'FAIL: purging a guest CASCADED away their players row — class history lost';
  end if;
  if v_after_allocs <> 1 then
    raise exception 'FAIL: purging a guest cascaded away their allocations';
  end if;
  if (select auth_uid from public.players where id = v_pid) is not null then
    raise exception 'FAIL: auth_uid was not severed';
  end if;
  if (select purged_at from public.players where id = v_pid) is null then
    raise exception 'FAIL: purged_at was not stamped';
  end if;
  raise notice 'PASS: purging a stale guest severs the identity and keeps the results';
end $$;

-- A guest still in a LIVE session is never touched.
do $$
declare v_sid uuid; v_uid uuid := 'b1000000-0000-0000-0000-000000000009'; v_n int;
begin
  insert into auth.users (id, is_anonymous, created_at)
  values (v_uid, true, now() - interval '90 days');
  -- An EMPTY lobby session: the one used above is now at the player cap.
  select s.id into v_sid from public.sessions s
   where s.host_id = 'a1000000-0000-0000-0000-000000000001' and s.status = 'lobby'
     and not exists (select 1 from public.players p where p.session_id = s.id)
   limit 1;
  insert into public.players (session_id, auth_uid, display_name, current_wealth)
  values (v_sid, v_uid, 'Mid-game guest', 100);

  perform public.purge_stale_guests(45);
  select count(*) into v_n from auth.users where id = v_uid;
  if v_n <> 1 then raise exception 'FAIL: purged a guest who is still in a live session'; end if;
  raise notice 'PASS: a guest in an unfinished session survives the purge';
end $$;

-- THE OTHER BIG ONE: an anonymous HOST (the "Skip email" testing bypass, 0008).
-- sessions.host_id cascades, so purging them would delete the whole class —
-- here a FINISHED one, which the live-session check alone would not protect.
\set anon_host_jwt '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated","is_anonymous":true}'
insert into auth.users (id, is_anonymous, created_at)
values ('b1000000-0000-0000-0000-00000000000b', true, now() - interval '90 days');
select set_config('request.jwt.claims', :'anon_host_jwt', false);
set role authenticated;
select id as ah_sid from public.create_session('{"num_rounds":1}'::jsonb) \gset
reset role;
select set_config('app.ah_sid', :'ah_sid', false);

do $$
declare
  v_host uuid := 'b1000000-0000-0000-0000-00000000000b';
  v_sid  uuid := current_setting('app.ah_sid')::uuid;
  v_pid  uuid;
  v_n    int;
begin
  update public.sessions set status = 'finished' where id = v_sid;
  insert into public.players (session_id, auth_uid, display_name, current_wealth, purged_at)
  values (v_sid, null, 'Their student', 130, now()) returning id into v_pid;

  perform public.purge_stale_guests(45);

  select count(*) into v_n from auth.users where id = v_host;
  if v_n <> 1 then
    raise exception 'FAIL: purged an anonymous guest who hosts a session';
  end if;
  if not exists (select 1 from public.sessions where id = v_sid) then
    raise exception 'FAIL: purging an anonymous host CASCADED away their session';
  end if;
  if not exists (select 1 from public.players where id = v_pid) then
    raise exception 'FAIL: purging an anonymous host deleted their students'' results';
  end if;
  raise notice 'PASS: an anonymous host and their class survive the purge';
end $$;

-- A guest whose account is old but who played recently is still active (0024).
-- Joins the anonymous host's finished session, so section 12's roster counts
-- for the section-5 session are untouched.
do $$
declare v_uid uuid := 'b1000000-0000-0000-0000-00000000000a'; v_n int;
begin
  insert into auth.users (id, is_anonymous, created_at)
  values (v_uid, true, now() - interval '90 days');
  insert into public.players (session_id, auth_uid, display_name, current_wealth)
  values (current_setting('app.ah_sid')::uuid, v_uid, 'Returning guest', 100);

  perform public.purge_stale_guests(45);
  select count(*) into v_n from auth.users where id = v_uid;
  if v_n <> 1 then
    raise exception 'FAIL: purged a guest who joined a game inside the retention window';
  end if;
  raise notice 'PASS: an old guest who played recently survives the purge';
end $$;

-- The window itself is guarded.
do $$ begin
  begin
    perform public.purge_stale_guests(1);
    raise exception 'SECURITY FAIL: purge accepted a 1-day window';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: purge refuses a reckless retention window (%)', sqlerrm;
  end;
end $$;

-- =============================================================================
-- 9. Username lookup is useless without the server secret
-- =============================================================================
set role authenticated;
do $$ begin
  if public.email_for_username('jsmith', null) is not null then
    raise exception 'SECURITY FAIL: resolved an email with no secret';
  end if;
  if public.email_for_username('jsmith', 'wrong-secret-but-long-enough-to-pass-length') is not null then
    raise exception 'SECURITY FAIL: resolved an email with the wrong secret';
  end if;
  raise notice 'PASS: username -> email lookup returns nothing without the secret';
end $$;

do $$ begin
  begin
    perform * from public.app_secrets;
    raise exception 'SECURITY FAIL: a client read the app_secrets table';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: app_secrets is unreadable by clients (%)', sqlerrm;
  end;
end $$;
reset role;

insert into public.app_secrets (key, value)
values ('username_lookup', repeat('a', 64))
on conflict (key) do update set value = excluded.value;

set role authenticated;
do $$ begin
  if public.email_for_username('jsmith', repeat('a', 64)) <> 'prof@example.edu' then
    raise exception 'FAIL: correct secret did not resolve the username';
  end if;
  if public.email_for_username('nobody_here', repeat('a', 64)) is not null then
    raise exception 'FAIL: unknown username should resolve to null';
  end if;
  raise notice 'PASS: username -> email resolves only with the right secret';
end $$;

-- =============================================================================
-- 10. Login throttle
-- =============================================================================
do $$
declare i int; v_ok boolean;
begin
  if not public.login_gate(array['u:jsmith'], repeat('a', 64)) then
    raise exception 'FAIL: a fresh bucket should be allowed';
  end if;
  for i in 1..8 loop
    perform public.login_record(array['u:jsmith'], false, repeat('a', 64));
  end loop;
  if public.login_gate(array['u:jsmith'], repeat('a', 64)) then
    raise exception 'SECURITY FAIL: bucket not locked after 8 failures';
  end if;
  raise notice 'PASS: login throttle locks a bucket after 8 failures';

  -- A success clears it.
  perform public.login_record(array['u:jsmith'], true, repeat('a', 64));
  if not public.login_gate(array['u:jsmith'], repeat('a', 64)) then
    raise exception 'FAIL: a successful sign-in should clear the lock';
  end if;
  raise notice 'PASS: a successful sign-in clears the throttle';

  if public.login_gate(array['u:jsmith'], 'wrong') is not null then
    raise exception 'SECURITY FAIL: throttle gate answered without the secret';
  end if;
  -- NULL, not FALSE: a secret mismatch is a deploy problem, and FALSE is what
  -- the route reports to the person as "too many attempts" (0024).
  raise notice 'PASS: the throttle gate requires the secret, and says so with NULL';
end $$;

-- The IP bucket is shared by a whole NAT'd lecture theatre, so it trips later.
do $$
declare i int;
begin
  for i in 1..8 loop
    perform public.login_record(array['ip:campus'], false, repeat('a', 64));
  end loop;
  if not public.login_gate(array['ip:campus'], repeat('a', 64)) then
    raise exception 'FAIL: an IP bucket locked at the per-username threshold';
  end if;
  for i in 9..30 loop
    perform public.login_record(array['ip:campus'], false, repeat('a', 64));
  end loop;
  if public.login_gate(array['ip:campus'], repeat('a', 64)) then
    raise exception 'SECURITY FAIL: IP bucket not locked after 30 failures';
  end if;
  raise notice 'PASS: an IP bucket locks after 30 failures, not 8';
end $$;

-- One good login must not launder a spray. Before 0024 a success cleared the
-- IP bucket too, so an attacker could reset it with their own account.
-- (Owner role: reading login_throttle directly needs it, by design.)
reset role;
do $$
declare i int; v_fails int;
begin
  for i in 1..7 loop
    perform public.login_record(array['u:victim' || i, 'ip:sprayer'], false, repeat('a', 64));
  end loop;
  perform public.login_record(array['u:attacker', 'ip:sprayer'], true, repeat('a', 64));
  select fails into v_fails from public.login_throttle where bucket = 'ip:sprayer';
  if coalesce(v_fails, 0) <> 7 then
    raise exception 'SECURITY FAIL: a successful login reset the IP bucket (fails now %)', v_fails;
  end if;
  raise notice 'PASS: a successful sign-in clears its username bucket, not the IP bucket';
end $$;
reset role;

-- =============================================================================
-- 11. Export and delete
-- =============================================================================
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
do $$
declare v jsonb;
begin
  v := public.export_my_data();
  if v->'profile'->>'username' <> 'jsmith' then
    raise exception 'FAIL: export is missing the caller profile';
  end if;
  if jsonb_array_length(v->'sessions_hosted') < 1 then
    raise exception 'FAIL: export is missing hosted sessions';
  end if;
  raise notice 'PASS: export_my_data returns the caller''s own record';
end $$;

do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'SECURITY FAIL: deleted an account that still hosts a live session';
  exception when others then
    if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS: delete_my_account refuses while a session is running (%)', sqlerrm;
  end;
end $$;
reset role;

-- =============================================================================
-- 12. Host dashboard overview (0023)
-- =============================================================================
select set_config('request.jwt.claims', :'prof_jwt', false);
set role authenticated;
do $$
declare r record; n int;
begin
  select count(*)::int into n from public.get_my_sessions_overview();
  if n < 1 then raise exception 'FAIL: overview returned no sessions for their host'; end if;

  -- Section 5's session took one guest, and section 8 added a second that was
  -- then purged. Both players rows survive the purge, and neither is a bot, so
  -- the roster count must still be 2.
  select * into r from public.get_my_sessions_overview()
   where get_my_sessions_overview.id = current_setting('app.s_id')::uuid;
  if r.player_count <> 2 then
    raise exception 'FAIL: roster count should be 2 (bots excluded, purged guest kept), got %',
      r.player_count;
  end if;
  raise notice 'PASS: overview returns % session(s) with correct roster counts', n;
end $$;
reset role;

-- Another account sees none of them.
select set_config('request.jwt.claims', :'sneaky_jwt', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*)::int into n from public.get_my_sessions_overview();
  if n <> 0 then
    raise exception 'SECURITY FAIL: overview leaked % of another host''s sessions', n;
  end if;
  raise notice 'PASS: the overview shows nothing of another host''s sessions';
end $$;
reset role;

-- The label is trimmed, capped and dropped when blank.
do $$
declare v_sid uuid; v_cfg jsonb;
begin
  select id into v_sid from public.sessions
   where host_id = 'a1000000-0000-0000-0000-000000000001' limit 1;

  update public.sessions
     set config = jsonb_set(config, '{label}', to_jsonb('   ECON 101   '::text))
   where id = v_sid;
  select config into v_cfg from public.sessions where id = v_sid;
  if v_cfg->>'label' <> 'ECON 101' then
    raise exception 'FAIL: label not trimmed, got %', v_cfg->>'label';
  end if;

  update public.sessions
     set config = jsonb_set(config, '{label}', to_jsonb(repeat('x', 300)))
   where id = v_sid;
  select config into v_cfg from public.sessions where id = v_sid;
  if length(v_cfg->>'label') <> 80 then
    raise exception 'FAIL: label not capped at 80, got %', length(v_cfg->>'label');
  end if;

  update public.sessions
     set config = jsonb_set(config, '{label}', to_jsonb('    '::text))
   where id = v_sid;
  select config into v_cfg from public.sessions where id = v_sid;
  if v_cfg ? 'label' then
    raise exception 'FAIL: a blank label should be removed, not stored empty';
  end if;
  raise notice 'PASS: session label is trimmed, capped at 80 and dropped when blank';
end $$;

-- =============================================================================
-- 13. A caller with NO JWT (just the public key) can do nothing but sign in
--     (0024). The host checks compare host_id <> auth.uid(), which is NULL —
--     so skipped — when there is no JWT; the grant is the only thing in the way.
-- =============================================================================
select id as victim_sid from public.sessions
 where host_id = 'a1000000-0000-0000-0000-000000000001' and status = 'lobby'
 limit 1 \gset
select set_config('app.victim_sid', :'victim_sid', false);
select set_config('request.jwt.claims', '', false);
set role anon;
do $$
declare
  v_sid uuid := current_setting('app.victim_sid')::uuid;
  v_fn  text;
begin
  foreach v_fn in array array['start_round', 'finish_session', 'delete_session'] loop
    begin
      execute format('select public.%I($1)', v_fn) using v_sid;
      raise exception 'SECURITY FAIL: a signed-out caller ran % on someone else''s session', v_fn;
    exception when others then
      if position('SECURITY FAIL' in sqlerrm) > 0 then raise; end if;
    end;
  end loop;
  raise notice 'PASS: a signed-out caller cannot start, finish or delete a session';
end $$;
reset role;

do $$
declare
  v_sid    uuid := current_setting('app.victim_sid')::uuid;
  v_status text;
begin
  select status into v_status from public.sessions where id = v_sid;
  if v_status is distinct from 'lobby' then
    raise exception 'SECURITY FAIL: the session was changed by a signed-out caller (now %)',
      coalesce(v_status, 'DELETED');
  end if;
  raise notice 'PASS: the session is untouched';
end $$;

-- The whole anon surface, exactly. A new function that forgets to revoke anon
-- fails HERE, before it can ship.
do $$
declare v_got text;
begin
  select string_agg(distinct p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_got is distinct from 'email_for_username,login_gate,login_record,username_available' then
    raise exception 'SECURITY FAIL: anon can execute an unexpected set of functions: %', v_got;
  end if;
  raise notice 'PASS: anon can execute only the four sign-in functions';
end $$;

-- Internal helpers are for their SECURITY DEFINER callers only.
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public._open_next_round(uuid)', 'public._unique_username(text)',
    'public.session_quota(uuid)', 'public._throttle_window()',
    'public.purge_stale_guests(integer)', 'public.purge_login_throttle()'] loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'SECURITY FAIL: clients can call internal helper %', v_fn;
    end if;
  end loop;
  raise notice 'PASS: internal helpers are not client-callable';
end $$;

select '*** ALL ACCOUNT SELF-TESTS PASSED ***' as result;
