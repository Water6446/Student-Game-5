-- =============================================================================
-- 0024_account_edge_cases.sql — fixes found auditing the account layer.
--
-- 4 (at the bottom) is a SECURITY fix and the most urgent: without it, anyone
-- with the public key can delete or drive any session. Push this promptly.
--
-- 1. purge_stale_guests could delete a whole class.
--    It skipped guests still PLAYING in a live session, but never looked at what
--    a guest HOSTS. sessions.host_id is ON DELETE CASCADE (0001), and the testing
--    bypass (0008) makes every "Skip email" host an anonymous user — so purging
--    one deleted their sessions, and every student's players and allocations
--    rows inside them, live sessions included. It also judged staleness by
--    created_at alone, so a guest who joined a game yesterday was purged if
--    their browser first visited 46 days ago.
--
-- 2. login_gate answered FALSE for "wrong/missing secret", which is the same
--    answer as "locked out". A deploy whose USERNAME_LOOKUP_SECRET did not match
--    app_secrets told every username sign-in "too many attempts, wait 15
--    minutes". It now answers NULL for a secret problem, FALSE only for a lock.
--    (That does let a caller tell a right secret from a wrong one — but so does
--    email_for_username on any public username, and the secret is 256 bits.)
--
-- 3. A successful sign-in cleared EVERY bucket it was booked against, including
--    the caller's IP bucket. So an attacker with any working account could spray
--    7 guesses across other usernames, sign in to their own account to wipe the
--    IP counter, and repeat — the IP bucket never tripped. Success now clears
--    only the username bucket.
--    The IP bucket also gets a higher threshold than a username's: one lecture
--    theatre shares one NAT address, and 8 mistyped passwords from anyone on
--    campus should not lock the whole campus out.
-- =============================================================================

-- ---- 1. purge: never a host, and staleness means "no recent activity" -------
create or replace function public.purge_stale_guests(p_days int default 45)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n      int;
  v_cutoff timestamptz;
begin
  if p_days is null or p_days < 7 then
    raise exception 'refusing to purge guests younger than 7 days';
  end if;
  v_cutoff := now() - make_interval(days => p_days);

  with doomed as (
    delete from auth.users u
     where coalesce(u.is_anonymous, false)
       and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at)) < v_cutoff
       -- joined a game inside the window: still active, whatever created_at says
       and not exists (
         select 1 from public.players p
          where p.auth_uid = u.id and p.joined_at >= v_cutoff)
       -- still in a session that has not finished
       and not exists (
         select 1 from public.players p
           join public.sessions s on s.id = p.session_id
          where p.auth_uid = u.id and s.status <> 'finished')
       -- hosts anything at all: the cascade would take the class with them.
       -- Such guests are kept until their sessions are deleted deliberately.
       and not exists (
         select 1 from public.sessions s where s.host_id = u.id)
    returning 1)
  select count(*)::int into v_n from doomed;
  return v_n;
end;
$$;

revoke all on function public.purge_stale_guests(int) from public, anon, authenticated;

comment on function public.purge_stale_guests(int) is
  'Deletes anonymous auth.users with no activity for N days, who are in no live '
  'session and host no session. Their players rows survive with auth_uid NULL '
  'and purged_at set.';

-- ---- 2. gate: NULL for a secret problem, FALSE only for a lock --------------
create or replace function public.login_gate(p_buckets text[], p_secret text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_expected text;
begin
  select value into v_expected from public.app_secrets where key = 'username_lookup';
  if v_expected is null or length(v_expected) < 32 then return null; end if;
  if p_secret is null or p_secret <> v_expected then return null; end if;

  return not exists (
    select 1 from public.login_throttle t
     where t.bucket = any(p_buckets)
       and t.locked_until is not null
       and t.locked_until > now()
  );
end;
$$;

-- ---- 3. record: per-kind thresholds; success clears only username buckets ---
create or replace function public._throttle_max(p_bucket text) returns int
  language sql immutable as $$
  select case when p_bucket like 'ip:%' then 30 else public._throttle_max() end
$$;

create or replace function public.login_record(p_buckets text[], p_ok boolean, p_secret text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expected text;
  v_bucket   text;
begin
  select value into v_expected from public.app_secrets where key = 'username_lookup';
  if v_expected is null or length(v_expected) < 32 then return; end if;
  if p_secret is null or p_secret <> v_expected then return; end if;

  if coalesce(p_ok, false) then
    -- Only the account that just proved its password is forgiven. The IP bucket
    -- keeps counting: clearing it let one good login launder the failures of
    -- a spray across other usernames.
    delete from public.login_throttle
     where bucket = any(p_buckets) and bucket like 'u:%';
    return;
  end if;

  foreach v_bucket in array p_buckets loop
    insert into public.login_throttle (bucket, fails, window_start)
    values (v_bucket, 1, now())
    on conflict (bucket) do update set
      -- a stale window restarts the count rather than accumulating forever
      fails = case
                when public.login_throttle.window_start < now() - public._throttle_window()
                then 1 else public.login_throttle.fails + 1 end,
      window_start = case
                when public.login_throttle.window_start < now() - public._throttle_window()
                then now() else public.login_throttle.window_start end,
      locked_until = case
                when (case
                        when public.login_throttle.window_start < now() - public._throttle_window()
                        then 1 else public.login_throttle.fails + 1 end)
                     >= public._throttle_max(v_bucket)
                then now() + public._throttle_window() else null end;
  end loop;
end;
$$;

revoke all on function public.login_gate(text[], text)            from public;
revoke all on function public.login_record(text[], boolean, text) from public;
grant execute on function public.login_gate(text[], text)            to anon, authenticated;
grant execute on function public.login_record(text[], boolean, text) to anon, authenticated;

-- ---- 4. a caller with no JWT may run only what signing in needs -------------
-- *** SECURITY: this closes a live hole, not a theoretical one ***
-- Supabase grants EXECUTE on every new public function DIRECTLY to anon (its
-- default privileges). Every migration here did `revoke all ... from public`
-- then granted `authenticated` — but revoking PUBLIC does not touch a direct
-- grant, so anon kept EXECUTE on everything.
--
-- That alone would be harmless, except the host-only RPCs check
--     if v_session.host_id <> auth.uid() then raise ...
-- and for a caller with no JWT auth.uid() IS NULL, so the comparison is NULL,
-- `if NULL` is false, and the check is skipped. Anyone holding the public key
-- (it ships in the JS bundle) and a session id (it is in every student's
-- /play/<id> URL) could start, resolve, finish or DELETE that session.
--
-- Fixed at the grant boundary, for every function at once and for future ones:
-- anon keeps exactly the four functions a signed-out browser or the sign-in
-- route calls. Guests are unaffected — anonymous sign-in is the
-- `authenticated` role, with a real uid, so the host checks hold for them.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from anon;

grant execute on function public.username_available(text)          to anon, authenticated;
grant execute on function public.email_for_username(text, text)    to anon, authenticated;
grant execute on function public.login_gate(text[], text)            to anon, authenticated;
grant execute on function public.login_record(text[], boolean, text) to anon, authenticated;

-- Internal helpers: only ever called from inside SECURITY DEFINER functions
-- (which run as the owner), never by a client. _open_next_round shares the
-- NULL-unsafe host check above; session_quota would tell anyone any account's
-- plan.
revoke execute on function public._open_next_round(uuid)  from authenticated;
revoke execute on function public._unique_username(text)  from authenticated;
revoke execute on function public.session_quota(uuid)     from authenticated;
revoke execute on function public._throttle_max()         from authenticated;
revoke execute on function public._throttle_max(text)     from authenticated;
revoke execute on function public._throttle_window()      from authenticated;
