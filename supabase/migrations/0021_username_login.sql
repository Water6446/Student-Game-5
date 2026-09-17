-- =============================================================================
-- 0021_username_login.sql — sign in with a username instead of an email.
--
-- Supabase Auth has no username login: signInWithPassword takes an email. So
-- something has to map username -> email BEFORE GoTrue ever sees the request.
-- That mapping is the whole security problem, because the naive version — an
-- RPC that any anonymous caller may invoke — is an email harvester: guess
-- handles, collect addresses, phish or credential-stuff them. For a tool
-- holding student data that is not an acceptable endpoint to ship.
--
-- *** THE THREE OPTIONS, AND WHY THIS ONE ***
--   a) Open RPC username -> email.  Rejected: email enumeration oracle.
--   b) Verify the password inside Postgres with crypt(), return the email only
--      on success.  Rejected: that is a home-rolled auth path outside GoTrue's
--      rate limiting and lockout — an unthrottled password oracle.
--   c) THIS: the lookup requires a server-only shared secret, so only our own
--      Route Handler can perform it. GoTrue still does every password check and
--      keeps its own rate limits; we only resolve an identifier.
--
-- Why a scoped secret and not the service_role key: service_role bypasses RLS
-- entirely, so leaking it means the whole database — including session_secrets
-- and every student's rows. Leaking THIS secret means username -> email
-- enumeration and nothing else. Same setup cost, ~100x smaller blast radius,
-- and it keeps the property README.md advertises: the app holds no key that
-- can bypass RLS.
--
-- *** SETUP (required before username login works) ***
--   1. Generate a secret:            openssl rand -hex 32
--   2. Store it (SQL editor, as the owner):
--        insert into public.app_secrets (key, value)
--        values ('username_lookup', '<the 64 hex chars>')
--        on conflict (key) do update set value = excluded.value;
--   3. Set USERNAME_LOOKUP_SECRET to the same value in Vercel (server-only —
--      it must NEVER be prefixed NEXT_PUBLIC_).
--
-- Until all three are done the function returns NULL for every call and the
-- sign-in form silently accepts email only. It fails closed, never open.
-- =============================================================================

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Same shape as session_secrets in 0014: RLS on, NO policies and NO grants, so
-- the only way in is a SECURITY DEFINER function.
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

comment on table public.app_secrets is
  'Server-only shared secrets. RLS on, no policies, no grants — reachable only '
  'through SECURITY DEFINER functions. Never expose a row to a client.';

-- ---------------------------------------------------------------------------
-- email_for_username — resolve a login handle, for the Route Handler only.
--
-- Returns NULL for: no secret configured, wrong secret, unknown username. The
-- caller cannot tell those apart, so it is not an oracle for the secret either.
-- ---------------------------------------------------------------------------
create or replace function public.email_for_username(p_username text, p_secret text)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_expected text;
  v_email    text;
begin
  select value into v_expected from public.app_secrets where key = 'username_lookup';

  -- Fail closed. A short or absent secret disables username login rather than
  -- weakening it.
  if v_expected is null or length(v_expected) < 32 then return null; end if;
  if p_secret is null or p_secret <> v_expected then return null; end if;

  select u.email into v_email
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(trim(coalesce(p_username, '')));

  return v_email;
end;
$$;

-- anon may call it — an unauthenticated user is exactly who is signing in — but
-- without the secret every call returns NULL.
revoke all on function public.email_for_username(text, text) from public;
grant execute on function public.email_for_username(text, text) to anon, authenticated;

comment on function public.email_for_username(text, text) is
  'Username -> email for the sign-in Route Handler. Requires the server-only '
  'app_secrets.username_lookup value; returns NULL without it. Never call this '
  'from browser code — the secret must not leave the server.';
