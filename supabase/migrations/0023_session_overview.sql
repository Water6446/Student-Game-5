-- =============================================================================
-- 0023_session_overview.sql — what the host dashboard actually needs to show.
--
-- The dashboard listed sessions straight from the table, so a row could only say
-- "join code, game type, timestamp, status". Answering "which class was that?"
-- needs the roster size too, and counting players client-side would mean pulling
-- every player row for every session the host has ever run.
--
-- Also clamps the new session label so a display string cannot grow unbounded.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- get_my_sessions_overview — one row per session this account hosts, with the
-- roster size computed server-side. Bots are excluded: four benchmark players
-- are not four students.
--
-- SECURITY DEFINER, filtered on host_id = auth.uid() and nothing else, so it can
-- only ever return the caller's own sessions.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_sessions_overview()
returns table (
  id            uuid,
  join_code     text,
  status        text,
  current_round int,
  config        jsonb,
  created_at    timestamptz,
  player_count  int
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    s.id,
    s.join_code,
    s.status,
    s.current_round,
    s.config,
    s.created_at,
    (select count(*)::int from public.players p
      where p.session_id = s.id and not p.is_bot)
  from public.sessions s
  where s.host_id = auth.uid()     -- null uid matches nothing
  order by s.created_at desc;
$$;

revoke all on function public.get_my_sessions_overview() from public;
grant execute on function public.get_my_sessions_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Session labels ("ECON 101 — Section B").
--
-- The label lives in config, which create_session merges verbatim from the
-- caller, so it is client-supplied text. It is only ever rendered as text by
-- React (no dangerouslySetInnerHTML anywhere), so the risk is size rather than
-- injection: trim it, cap it, and drop it entirely when blank so an empty string
-- never has to be special-cased in the UI.
-- ---------------------------------------------------------------------------
create or replace function public.clamp_session_label()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_label text;
begin
  if new.config ? 'label' then
    v_label := left(trim(coalesce(new.config->>'label', '')), 80);
    if v_label = '' then
      new.config := new.config - 'label';
    else
      new.config := jsonb_set(new.config, '{label}', to_jsonb(v_label));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_clamp_label on public.sessions;
create trigger sessions_clamp_label
  before insert or update on public.sessions
  for each row execute function public.clamp_session_label();
