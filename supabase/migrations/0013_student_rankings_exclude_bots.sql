-- =============================================================================
-- 0011_student_rankings_exclude_bots.sql — benchmark bots are teaching props,
-- not competitors: they must not appear in STUDENT-facing rankings. A lone
-- student should finish "1st of 1", not "3rd of 5" behind bots.
--
-- Applies to both games (basic + portfolio) — these RPCs are game-agnostic.
-- Host screens are unaffected: they read players directly and keep the
-- show/hide-bots toggle.
-- =============================================================================

-- get_my_rank: rank + class size among REAL students only.
create or replace function public.get_my_rank(p_session_id uuid)
returns table (rank int, total int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_my_wealth numeric;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select current_wealth into v_my_wealth from public.players
    where session_id = p_session_id and auth_uid = auth.uid();
  if not found then
    raise exception 'no player row for caller (host has no rank)';
  end if;

  return query
    select (1 + count(*) filter (where p.current_wealth > v_my_wealth))::int,
           count(*)::int
    from public.players p
    where p.session_id = p_session_id and p.is_active = true and p.is_bot = false;
end;
$$;

-- get_leaderboard: the student-facing ranked list — real students only.
create or replace function public.get_leaderboard(p_session_id uuid)
returns table (player_id uuid, display_name text, current_wealth numeric,
               rank int, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  if not (public.is_session_host(p_session_id)
          or public.session_show_leaderboard(p_session_id)) then
    raise exception 'the full leaderboard is hidden from students in this session';
  end if;

  return query
    select p.id, p.display_name, p.current_wealth,
           (rank() over (order by p.current_wealth desc))::int,
           (p.auth_uid = auth.uid())
    from public.players p
    where p.session_id = p_session_id and p.is_active = true and p.is_bot = false
    order by p.current_wealth desc, p.joined_at asc;
end;
$$;
