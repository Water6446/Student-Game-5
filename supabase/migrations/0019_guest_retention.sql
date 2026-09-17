-- =============================================================================
-- 0019_guest_retention.sql — clean up stale guests WITHOUT eating class history.
--
-- Every browser that ever reaches /join leaves a permanent auth.users row, and
-- Supabase has no built-in cleanup for anonymous users. Left alone that grows
-- without bound; it is also the thing a bot inflates (docs/ACCOUNTS.md T1).
--
-- *** WHY THIS MIGRATION IS NOT JUST A DELETE JOB ***
-- players.auth_uid still carries ON DELETE CASCADE from 0001. Deleting a stale
-- guest would therefore cascade away their players row and every allocations
-- row under it — silently destroying a past class's results. The FK has to
-- become ON DELETE SET NULL *before* any purge exists.
--
-- 0009 already dropped NOT NULL from auth_uid (bots have none), but it added
--   players_auth_or_bot_chk: check (auth_uid is not null or is_bot)
-- which would reject a severed human row. So the invariant is widened rather
-- than dropped: a row with no auth_uid is now either a bot or a purged guest.
--
-- Severing instead of deleting is also the right shape for erasure requests:
-- the wealth curve survives as an anonymous record, the person does not.
-- =============================================================================

-- A human player row whose account has been erased. Set by the trigger below,
-- including when the FK action does the update, so it can never be forgotten.
alter table public.players add column if not exists purged_at timestamptz;

-- ---- 1. sever instead of cascade ------------------------------------------
alter table public.players drop constraint if exists players_auth_uid_fkey;
alter table public.players add constraint players_auth_uid_fkey
  foreign key (auth_uid) references auth.users (id) on delete set null;

-- ---- 2. stamp purged_at whenever auth_uid is cleared ----------------------
-- BEFORE ROW triggers fire for the UPDATE that ON DELETE SET NULL performs, and
-- CHECK constraints are evaluated against the final NEW — so stamping here is
-- what keeps the widened constraint below satisfiable.
create or replace function public.mark_player_purged()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.auth_uid is not null and new.auth_uid is null and not coalesce(new.is_bot, false) then
    new.purged_at := coalesce(new.purged_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists players_mark_purged on public.players;
create trigger players_mark_purged
  before update on public.players
  for each row execute function public.mark_player_purged();

-- ---- 3. widen the invariant ------------------------------------------------
alter table public.players drop constraint if exists players_auth_or_bot_chk;
alter table public.players add constraint players_auth_or_bot_chk
  check (auth_uid is not null or is_bot or purged_at is not null);

-- ---- 4. the purge itself ---------------------------------------------------
-- Owner-only: no grant to anon/authenticated/service consumers. Run it from the
-- SQL editor, or schedule weekly with pg_cron:
--   select cron.schedule('purge-stale-guests', '0 4 * * 0',
--                        $$select public.purge_stale_guests(45)$$);
create or replace function public.purge_stale_guests(p_days int default 45)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if p_days is null or p_days < 7 then
    raise exception 'refusing to purge guests younger than 7 days';
  end if;

  with doomed as (
    delete from auth.users u
     where coalesce(u.is_anonymous, false)
       and u.created_at < now() - make_interval(days => p_days)
       -- never touch someone still in a session that has not finished
       and not exists (
         select 1 from public.players p
           join public.sessions s on s.id = p.session_id
          where p.auth_uid = u.id and s.status <> 'finished')
    returning 1)
  select count(*)::int into v_n from doomed;
  return v_n;
end;
$$;

revoke all on function public.purge_stale_guests(int) from public, anon, authenticated;

comment on function public.purge_stale_guests(int) is
  'Deletes anonymous auth.users older than N days who are in no live session. '
  'Their players rows survive with auth_uid NULL and purged_at set.';
