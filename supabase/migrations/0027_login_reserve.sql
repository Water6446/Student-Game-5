-- =============================================================================
-- 0027_login_reserve.sql — count a username sign-in attempt BEFORE it is tried.
--
-- 0022/0024 checked the counters (login_gate), let GoTrue check the password,
-- and only then booked the outcome (login_record). Those are separate round
-- trips with a few hundred milliseconds of password hashing in between, so a
-- burst of simultaneous guesses all read "not locked" before any one of them
-- was counted: "8 guesses per 15 minutes" became "as many as fit in one burst".
--
-- login_begin books the attempt as a failure in the same transaction that
-- decides whether it may go ahead, holding each bucket's row lock while it does.
-- Concurrent attempts on one bucket therefore queue, and each sees the count
-- the previous one left. login_finish then settles the attempt:
--
--   'ok'     the password was right. The username bucket is forgiven, and THIS
--            attempt is handed back to the IP bucket, so a lecture theatre full
--            of successful sign-ins never locks its own NAT address. Only this
--            one attempt: the IP's other failures stay (0024 §3 — one good login
--            must not launder a spray across other usernames).
--   'refund' GoTrue or the database failed, which says nothing about the
--            password. Every bucket gets this attempt back.
--   'wrong'  nothing to do — it was booked as a failure up front.
--
-- An attempt that never reaches login_finish (a crashed or timed-out function)
-- stays booked as a failure. That is the safe direction to fail.
--
-- login_gate / login_record (0022, 0024) are left in place so an app deployed
-- before this migration keeps signing people in during the rollout. Nothing
-- calls them once the new route is live; a later migration can drop them.
-- =============================================================================

create or replace function public.login_begin(p_buckets text[], p_secret text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expected text;
  v_buckets  text[];
  v_bucket   text;
  v_row      public.login_throttle%rowtype;
begin
  -- Same secret gate as 0021/0024: NULL means "misconfigured", never "locked".
  select value into v_expected from public.app_secrets where key = 'username_lookup';
  if v_expected is null or length(v_expected) < 32 then return null; end if;
  if p_secret is null or p_secret <> v_expected then return null; end if;

  -- One fixed lock order, whatever order the caller passed: two attempts that
  -- share buckets can then never each hold the row the other is waiting for.
  select coalesce(array_agg(distinct b order by b), '{}'::text[]) into v_buckets
    from unnest(coalesce(p_buckets, '{}'::text[])) b
   where b is not null;
  if cardinality(v_buckets) = 0 then return false; end if;

  -- Pass 1: lock every bucket and refuse if any is locked. A refused attempt is
  -- not counted — it never reached GoTrue.
  foreach v_bucket in array v_buckets loop
    insert into public.login_throttle (bucket, fails, window_start)
    values (v_bucket, 0, now())
    on conflict (bucket) do nothing;

    select * into v_row from public.login_throttle where bucket = v_bucket for update;
    if v_row.locked_until is not null and v_row.locked_until > now() then
      return false;
    end if;
  end loop;

  -- Pass 2: book the attempt against every bucket, locking any that reach the
  -- threshold. The rows are still locked from pass 1.
  foreach v_bucket in array v_buckets loop
    select * into v_row from public.login_throttle where bucket = v_bucket;
    if v_row.window_start < now() - public._throttle_window() then
      -- a stale window restarts the count rather than accumulating forever
      v_row.fails := 1;
      v_row.window_start := now();
    else
      v_row.fails := v_row.fails + 1;
    end if;

    update public.login_throttle
       set fails        = v_row.fails,
           window_start = v_row.window_start,
           locked_until = case when v_row.fails >= public._throttle_max(v_bucket)
                               then now() + public._throttle_window() end
     where bucket = v_bucket;
  end loop;

  return true;
end;
$$;

create or replace function public.login_finish(p_buckets text[], p_outcome text, p_secret text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_expected text;
begin
  select value into v_expected from public.app_secrets where key = 'username_lookup';
  if v_expected is null or length(v_expected) < 32 then return; end if;
  if p_secret is null or p_secret <> v_expected then return; end if;

  if p_outcome = 'wrong' then
    return;
  elsif p_outcome = 'ok' then
    delete from public.login_throttle
     where bucket = any(p_buckets) and bucket like 'u:%';
    update public.login_throttle t
       set fails = greatest(t.fails - 1, 0),
           locked_until = case when greatest(t.fails - 1, 0) >= public._throttle_max(t.bucket)
                               then t.locked_until end
     where t.bucket = any(p_buckets) and t.bucket not like 'u:%';
  elsif p_outcome = 'refund' then
    -- Handing the attempt back also lifts a lock that this attempt set.
    update public.login_throttle t
       set fails = greatest(t.fails - 1, 0),
           locked_until = case when greatest(t.fails - 1, 0) >= public._throttle_max(t.bucket)
                               then t.locked_until end
     where t.bucket = any(p_buckets);
  else
    raise exception 'login_finish: unknown outcome %', p_outcome;
  end if;
end;
$$;

revoke all on function public.login_begin(text[], text)        from public;
revoke all on function public.login_finish(text[], text, text) from public;
grant execute on function public.login_begin(text[], text)        to anon, authenticated;
grant execute on function public.login_finish(text[], text, text) to anon, authenticated;

comment on function public.login_begin(text[], text) is
  'Username sign-in: books the attempt as a failure and says whether it may '
  'proceed, atomically. NULL = secret problem, FALSE = locked. See 0027.';
comment on function public.login_finish(text[], text, text) is
  'Settles a login_begin attempt: ok | wrong | refund. See 0027.';
