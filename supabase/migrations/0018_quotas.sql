-- =============================================================================
-- 0018_quotas.sql — per-account limits, and the index they need.
--
-- Two bounds that did not exist before: how many sessions one account may run,
-- and how many students one session may hold. Both are enforced by BEFORE
-- INSERT triggers rather than by editing create_session/join_session, because
-- create_session's body is ~220 lines as of 0014 and copying it forward for
-- every policy tweak is how the definitions drift apart. A trigger also covers
-- any future insert path automatically.
--
-- These are anti-abuse bounds, not a paywall. The real controls against mass
-- signup are CAPTCHA on the auth endpoints and email verification — see
-- docs/ACCOUNTS.md §4. A quota only caps what one account can cost you.
-- =============================================================================

-- The index the host dashboard has always wanted, and the quota check needs.
create index if not exists sessions_host_idx
  on public.sessions (host_id, created_at desc);

-- ---------------------------------------------------------------------------
-- session_quota — sessions per account per 30 days, by plan.
-- Billing will set profiles.plan; nothing else here changes when it does.
-- ---------------------------------------------------------------------------
create or replace function public.session_quota(p_uid uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case coalesce((select p.plan from public.profiles p where p.id = p_uid), 'free')
    when 'dept'  then 500
    when 'pilot' then 100
    else 12
  end;
$$;

-- ---------------------------------------------------------------------------
-- Session quota trigger.
--
-- Counts LIVE sessions in the window, so deleting a session frees its slot.
-- That is deliberate — the resource being protected is rows in the database,
-- not a lifetime count — and it means an honest host who cleans up is never
-- blocked. It does mean a create/delete loop is not rate-limited by this; that
-- is CAPTCHA's job, not the quota's.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_session_quota()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_quota int := public.session_quota(new.host_id);
begin
  if (select count(*) from public.sessions s
        where s.host_id = new.host_id
          and s.created_at > now() - interval '30 days') >= v_quota then
    raise exception
      'session limit reached: % sessions per 30 days on this account. Delete an old session or get in touch.',
      v_quota
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_quota_check on public.sessions;
create trigger sessions_quota_check
  before insert on public.sessions
  for each row execute function public.enforce_session_quota();

-- ---------------------------------------------------------------------------
-- Player cap. Bots are excluded from the count (a host adds at most 4, and they
-- are not an abuse vector). 400 is well above any real lecture; the realtime
-- connection ceiling bites long before this does (docs/ACCOUNTS.md §6.3).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_player_cap()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.is_bot, false) then return new; end if;
  if (select count(*) from public.players p
        where p.session_id = new.session_id and not p.is_bot) >= 400 then
    raise exception 'this session is full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists players_cap_check on public.players;
create trigger players_cap_check
  before insert on public.players
  for each row execute function public.enforce_player_cap();
