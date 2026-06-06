-- =============================================================================
-- _supabase_mock.sql — minimal local stand-ins for the Supabase platform so the
-- real migrations can be applied and exercised in a vanilla Postgres container.
-- This is ONLY for the offline self-test; it is never deployed. It recreates
-- just enough of the Supabase auth surface that our migrations/RPCs depend on:
--   * schema auth + auth.users
--   * auth.uid() / auth.jwt() / auth.role() reading request.jwt.claims
--   * the anon / authenticated / service_role database roles
--   * the supabase_realtime publication
-- =============================================================================
create extension if not exists pgcrypto;
create schema if not exists auth;

create table if not exists auth.users (
  id           uuid primary key default gen_random_uuid(),
  email        text,
  is_anonymous boolean not null default false
);

-- auth.jwt(): the decoded JWT claims, supplied per-request via the GUC.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

-- platform roles (Supabase ships these; service_role bypasses RLS)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- realtime publication stand-in (our 0002 migration adds tables to it)
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
