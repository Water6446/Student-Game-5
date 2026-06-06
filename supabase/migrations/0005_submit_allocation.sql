-- =============================================================================
-- 0005_submit_allocation.sql — route student allocation writes through an RPC.
--
-- Why: the client used `supabase.from('allocations').upsert(..., {onConflict})`,
-- which PostgREST compiles to `INSERT ... ON CONFLICT DO UPDATE SET <every
-- payload column>` — including the conflict-key columns round_id/player_id. Our
-- column-level UPDATE grant only covered (risky_amount, safe_amount), so Postgres
-- rejected the whole statement with "permission denied for table allocations".
--
-- Fixing the grant would mean letting students UPDATE round_id/player_id, which we
-- don't want. Instead we do what every other write in this app does: a host/owner
-- -checked SECURITY DEFINER function. Students no longer need ANY direct
-- insert/update privilege on allocations — only execute on this function. The
-- server is the sole authority for safe_amount (= wealth - risky) and the
-- open-round / ownership / bounds checks.
-- =============================================================================

create or replace function public.submit_allocation(
  p_round_id uuid, p_risky_amount numeric
) returns public.allocations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_round  public.rounds%rowtype;
  v_player public.players%rowtype;
  v_risky  numeric;
  v_safe   numeric;
  v_alloc  public.allocations%rowtype;
begin
  if v_uid is null then
    raise exception 'must be signed in to submit';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'round not found'; end if;
  if v_round.status <> 'open' then
    raise exception 'this round is not open for submissions';
  end if;

  -- the caller's OWN player row in this round's session (ties the allocation to
  -- auth.uid(); a student can never submit for someone else)
  select * into v_player from public.players
    where session_id = v_round.session_id and auth_uid = v_uid and is_active = true;
  if not found then
    raise exception 'you are not an active player in this session';
  end if;

  -- validate + clamp: 0 <= risky <= current wealth. safe is derived server-side
  -- (the client's safe value is ignored entirely).
  v_risky := coalesce(p_risky_amount, 0);
  if v_risky < 0 then v_risky := 0; end if;
  if v_risky > v_player.current_wealth then v_risky := v_player.current_wealth; end if;
  v_safe := v_player.current_wealth - v_risky;

  insert into public.allocations (round_id, player_id, risky_amount, safe_amount)
  values (p_round_id, v_player.id, v_risky, v_safe)
  on conflict (round_id, player_id) do update
    set risky_amount = excluded.risky_amount,
        safe_amount  = excluded.safe_amount,
        submitted_at = now()
  returning * into v_alloc;

  return v_alloc;
end;
$$;

revoke all on function public.submit_allocation(uuid, numeric) from public;
grant execute on function public.submit_allocation(uuid, numeric) to authenticated;

-- Students no longer write the table directly; pull back the direct write grants.
-- (SELECT stays so they can read their own allocation / the reveal.) The RLS
-- insert/update policies are left in place as harmless defense-in-depth.
revoke insert on public.allocations from authenticated;
revoke update on public.allocations from authenticated;
