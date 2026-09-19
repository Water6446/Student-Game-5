-- =============================================================================
-- 0025_rename_session.sql — let a host rename a session after creating it.
--
-- The label (0023) could only be set at creation, so a session started in a
-- hurry stayed "Basic game" forever. Hosts have no direct write grant on
-- sessions (0002: all writes go through RPCs), so renaming is one more
-- host-only RPC in the shape of set_show_odds (0007).
--
-- The existing sessions_clamp_label trigger (0023) fires on UPDATE too, so the
-- trim / 80-character clamp / blank-means-remove rules apply here unchanged.
-- Renaming is allowed in every status: a finished session is exactly the one
-- whose name matters a week later.
-- =============================================================================

create or replace function public.set_session_label(p_session_id uuid, p_label text)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id is distinct from auth.uid() then
    raise exception 'not authorized: host only';
  end if;

  update public.sessions
     set config = jsonb_set(config, '{label}', to_jsonb(coalesce(p_label, '')))
   where id = p_session_id
   returning * into v_session;
  return v_session;
end;
$$;

-- 0024 revokes EXECUTE from anon by default privilege; be explicit anyway.
revoke all on function public.set_session_label(uuid, text) from public, anon;
grant execute on function public.set_session_label(uuid, text) to authenticated;
