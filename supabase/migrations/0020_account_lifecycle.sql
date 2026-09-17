-- =============================================================================
-- 0020_account_lifecycle.sql — export and delete, i.e. the promises a privacy
-- policy has to be able to keep (docs/ACCOUNTS.md §6.6).
--
-- Both are SECURITY DEFINER and both filter on auth.uid() and nothing else, so
-- neither can reach another account's rows whatever it is passed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- export_my_data — everything this account owns, as one JSON document.
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;

  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select to_jsonb(x) from (
        select u.id, u.email, u.created_at, u.last_sign_in_at,
               coalesce(u.is_anonymous, false) as is_anonymous
          from auth.users u where u.id = v_uid
      ) x),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'sessions_hosted', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
        from public.sessions s where s.host_id = v_uid), '[]'::jsonb),
    'sessions_played', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'player', to_jsonb(p),
                 'session', jsonb_build_object(
                    'id', s.id, 'status', s.status, 'created_at', s.created_at,
                    'config', s.config),
                 'allocations', coalesce((
                    select jsonb_agg(to_jsonb(a) order by r.round_number)
                      from public.allocations a
                      join public.rounds r on r.id = a.round_id
                     where a.player_id = p.id), '[]'::jsonb))
               order by p.joined_at)
        from public.players p
        join public.sessions s on s.id = p.session_id
       where p.auth_uid = v_uid), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- my_deletion_preview — what deleting this account would destroy.
--
-- sessions.host_id carries ON DELETE CASCADE from 0001, so removing a host
-- removes the sessions they ran, and with them every student's rows in those
-- sessions. That is a bigger hammer than most people expect from "delete my
-- account", so the UI shows these counts and makes the user type to confirm.
-- ---------------------------------------------------------------------------
create or replace function public.my_deletion_preview()
returns table (sessions_hosted int, live_sessions_hosted int, sessions_played int)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    (select count(*)::int from public.sessions s where s.host_id = auth.uid()),
    (select count(*)::int from public.sessions s
      where s.host_id = auth.uid() and s.status <> 'finished'),
    (select count(*)::int from public.players p
      where p.auth_uid = auth.uid() and not p.is_bot);
$$;

revoke all on function public.my_deletion_preview() from public;
grant execute on function public.my_deletion_preview() to authenticated;

-- ---------------------------------------------------------------------------
-- delete_my_account — irreversible.
--
-- Refuses while the account still hosts an unfinished session: a class in
-- progress must not vanish under the students sitting in it. Sessions this
-- account only PLAYED are untouched — 0019 made that FK ON DELETE SET NULL, so
-- those player rows survive with auth_uid NULL and purged_at stamped.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_live int;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;

  select count(*) into v_live from public.sessions s
   where s.host_id = v_uid and s.status <> 'finished';
  if v_live > 0 then
    raise exception
      'finish or delete your % running session(s) first', v_live
      using errcode = 'check_violation';
  end if;

  delete from public.profiles where id = v_uid;
  -- Cascades the sessions this account hosted; severs (does not delete) the
  -- player rows it owns elsewhere.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
