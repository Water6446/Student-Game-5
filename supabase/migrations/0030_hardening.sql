-- =============================================================================
-- 0030_hardening.sql — internal helpers out of client reach, and size limits
-- on the free text clients can store.
--
-- 1. Signed-in users could call internal helpers.
--    Supabase grants EXECUTE on every new public function directly to
--    `authenticated`, and `revoke ... from public` does not undo a direct
--    grant. 0024 withdrew some helpers; these were missed:
--      _manager_preset   returned the preset line-ups WITH their alphas. The
--                        skill shuffle still hid which fund held which, so it
--                        was not a leak — but nothing a client needs.
--      _gen_track_record, _rand_normal   harmless maths, still not an API.
--      the trigger functions             cannot be called outside a trigger
--                                        anyway; withdrawn so the list of what
--                                        a client can execute is exactly the
--                                        RPCs (see accounts_selftest.sql).
--    Withdrawing EXECUTE does not stop the triggers firing: the privilege is
--    checked when a trigger is created, not each time it runs.
--
--    Why not `alter default privileges ... revoke execute on functions from
--    public` as well? It would have to be global (a per-schema revoke cannot
--    remove a global default), so it would also strip EXECUTE from functions
--    that any extension created by this role installs later — a quiet breakage
--    far from its cause. The exact allowlists in accounts_selftest.sql catch a
--    new function that forgets its revokes instead.
--
-- 2. No size limits on free text.
--    profiles.display_name and .institution had none (the form sliced to 80,
--    PostgREST did not), and create_session merges any extra config keys the
--    caller sends — a 500 KB junk key was accepted and then sent to every
--    student on every session fetch and realtime update.
--    The config limit is 32 KB, roughly eight times the largest real config (an
--    eight-manager game with full track records). It is NOT VALID so an
--    existing oversized row does not block this migration; every insert and
--    update is checked from now on.
-- =============================================================================

-- ---- 1. helpers ------------------------------------------------------------
revoke execute on function public._manager_preset(text) from public, anon, authenticated;
revoke execute on function public._gen_track_record(numeric, numeric, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
revoke execute on function public._rand_normal(numeric, numeric) from public, anon, authenticated;

revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.enforce_session_quota() from public, anon, authenticated;
revoke execute on function public.enforce_player_cap()    from public, anon, authenticated;
revoke execute on function public.mark_player_purged()    from public, anon, authenticated;
revoke execute on function public.clamp_session_label()   from public, anon, authenticated;

-- ---- 2. size limits ----------------------------------------------------------
update public.profiles set display_name = left(display_name, 80)
 where char_length(display_name) > 80;
update public.profiles set institution = left(institution, 120)
 where char_length(institution) > 120;

alter table public.profiles drop constraint if exists profiles_display_name_len_chk;
alter table public.profiles add constraint profiles_display_name_len_chk
  check (char_length(display_name) <= 80);

alter table public.profiles drop constraint if exists profiles_institution_len_chk;
alter table public.profiles add constraint profiles_institution_len_chk
  check (institution is null or char_length(institution) <= 120);

alter table public.sessions drop constraint if exists sessions_config_size_chk;
alter table public.sessions add constraint sessions_config_size_chk
  check (octet_length(config::text) <= 32768) not valid;
