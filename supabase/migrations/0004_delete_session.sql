-- =============================================================================
-- 0004_delete_session.sql — host-only deletion of a whole session.
--
-- Deleting the sessions row cascades (ON DELETE CASCADE) to players, rounds and
-- allocations, so this one statement tears down the entire game. Works in any
-- status (lobby / active / finished). Host-only, re-checked server-side; a
-- student calling this can never delete a session they don't own.
-- =============================================================================
create or replace function public.delete_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    -- already gone: treat as success so the UI is idempotent
    return;
  end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: only the host may delete this session';
  end if;

  delete from public.sessions where id = p_session_id;  -- cascades to children
end;
$$;

revoke all on function public.delete_session(uuid) from public;
grant execute on function public.delete_session(uuid) to authenticated;
