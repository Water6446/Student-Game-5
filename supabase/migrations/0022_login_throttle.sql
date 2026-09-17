-- =============================================================================
-- 0022_login_throttle.sql — brute-force limits for the username sign-in path.
--
-- *** WHY THIS IS NEEDED ONLY FOR USERNAME LOGIN ***
-- An email login goes straight from the browser to Supabase, so GoTrue sees the
-- real client IP and applies its own per-IP limit. A username login cannot: it
-- has to pass through our Route Handler (0021) to resolve the handle, and from
-- Supabase's side every one of those requests arrives from the Vercel egress IP.
-- That single shared bucket is both useless as a brute-force limit and a
-- self-inflicted denial of service — 30 guesses by an attacker would lock out
-- every legitimate username login for an hour.
--
-- So the proxied path carries its own throttle, keyed on two buckets at once:
-- the username being targeted, and the caller's IP. Either one tripping blocks
-- the attempt.
--
-- IPs are never stored. The Route Handler passes sha256(ip + secret), so this
-- table holds opaque digests: enough to count, useless as personal data, and
-- not reversible without the server secret.
-- =============================================================================

create table if not exists public.login_throttle (
  bucket       text primary key,
  fails        int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.login_throttle enable row level security;
revoke all on public.login_throttle from anon, authenticated;

comment on table public.login_throttle is
  'Failure counters for proxied username sign-in. Buckets are opaque: '
  'u:<username> or ip:<sha256 digest>. RLS on, no policies, no grants.';

-- Tunables. 8 failures in 15 minutes locks that bucket for 15 minutes.
-- Deliberately generous enough that a person mistyping twice never notices.
create or replace function public._throttle_max() returns int
  language sql immutable as $$ select 8 $$;
create or replace function public._throttle_window() returns interval
  language sql immutable as $$ select interval '15 minutes' $$;

-- ---------------------------------------------------------------------------
-- login_gate — may this bucket attempt a sign-in right now?
-- Returns false when locked. Same secret gate as 0021: no secret, no answer.
-- ---------------------------------------------------------------------------
create or replace function public.login_gate(p_buckets text[], p_secret text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_expected text;
begin
  select value into v_expected from public.app_secrets where key = 'username_lookup';
  if v_expected is null or length(v_expected) < 32 then return false; end if;
  if p_secret is null or p_secret <> v_expected then return false; end if;

  return not exists (
    select 1 from public.login_throttle t
     where t.bucket = any(p_buckets)
       and t.locked_until is not null
       and t.locked_until > now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- login_record — book the outcome of an attempt.
-- Success clears the buckets; failure increments and may lock them.
-- ---------------------------------------------------------------------------
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
    delete from public.login_throttle where bucket = any(p_buckets);
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
                        then 1 else public.login_throttle.fails + 1 end) >= public._throttle_max()
                then now() + public._throttle_window() else null end;
  end loop;
end;
$$;

revoke all on function public.login_gate(text[], text)          from public;
revoke all on function public.login_record(text[], boolean, text) from public;
grant execute on function public.login_gate(text[], text)          to anon, authenticated;
grant execute on function public.login_record(text[], boolean, text) to anon, authenticated;

-- Housekeeping: drop rows that are past their window and not locked. Owner-only.
-- Schedule alongside purge_stale_guests if you use pg_cron.
create or replace function public.purge_login_throttle()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  with gone as (
    delete from public.login_throttle t
     where coalesce(t.locked_until, t.window_start) < now() - interval '1 day'
    returning 1)
  select count(*)::int into v_n from gone;
  return v_n;
end;
$$;

revoke all on function public.purge_login_throttle() from public, anon, authenticated;
