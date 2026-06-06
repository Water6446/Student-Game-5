-- =============================================================================
-- 0006_set_good_prob.sql — let the host tune the market odds mid-game.
--
-- good_prob lives in sessions.config and is read by resolve_round at reveal
-- time, so updating it before a round is revealed changes that round's auto
-- roll. Host-only, validated 0..1. No effect in manual market mode (the host
-- picks the outcome directly there) but we still allow setting it for when they
-- switch strategies. Students cannot call this.
-- =============================================================================
create or replace function public.set_good_prob(p_session_id uuid, p_good_prob numeric)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if p_good_prob is null or p_good_prob < 0 or p_good_prob > 1 then
    raise exception 'good_prob must be between 0 and 1';
  end if;

  update public.sessions
    set config = jsonb_set(config, '{good_prob}', to_jsonb(p_good_prob))
    where id = p_session_id
    returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.set_good_prob(uuid, numeric) from public;
grant execute on function public.set_good_prob(uuid, numeric) to authenticated;
