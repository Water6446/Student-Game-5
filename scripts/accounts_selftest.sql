-- =============================================================================
-- accounts_selftest.sql — proves the account layer (migrations 0016-0022)
-- against the REAL migrations, the same way db_selftest.sql proves Stage 1.
--
-- Why a second file: db_selftest.sql applies ONLY 0001-0003, which is what lets
-- it assert "an anonymous user may not host" — a guard migration 0008 later
-- removes on purpose for testing. This file applies every migration, so it
-- asserts the account layer against the schema as actually deployed.
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

  -- Age the guest past the retention window, then purge.
  update auth.users set created_at = now() - interval '90 days' where id = v_uid;
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

  if public.login_gate(array['u:jsmith'], 'wrong') then
    raise exception 'SECURITY FAIL: throttle gate opened without the secret';
  end if;
  raise notice 'PASS: the throttle gate also requires the server secret';
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

select '*** ALL ACCOUNT SELF-TESTS PASSED ***' as result;
