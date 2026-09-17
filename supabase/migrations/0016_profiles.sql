-- =============================================================================
-- 0016_profiles.sql — the account record.
--
-- Adds public.profiles: the app-owned half of an identity. auth.users stays the
-- source of truth for credentials; everything the APP needs to trust lives here,
-- in a table whose sensitive columns have no client write grant.
--
-- *** THE RULE THIS FILE EXISTS TO ENFORCE ***
-- Never put a role, plan, or any other authorization fact in user_metadata
-- (auth.users.raw_user_meta_data). It is writable by the user themself via
-- supabase.auth.updateUser({ data: ... }) — a student could set
-- {"role":"admin"} in a single API call. Anything the server must trust belongs
-- in THIS table, with column-scoped grants, exactly as players.current_wealth is
-- kept out of reach in 0002_rls.sql.
--
-- raw_user_meta_data is read exactly once, by the insert trigger below, and only
-- for the username/display name a user chose at sign-up. The unique index is
-- what makes that safe: metadata cannot be used to steal a taken username, and
-- changing metadata afterwards does NOT change this table (there is no update
-- trigger). profiles.username is authoritative from the moment of creation.
-- =============================================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- login handle. Case-insensitively unique; see profiles_username_lower_idx.
  username     text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null default '',
  institution  text null,
  -- 'user' | 'admin'. NOT a host/student switch: hosting is gated on "has a
  -- real (non-anonymous) identity" + the quota in 0018, so there is no
  -- privilege bit for an attacker to flip. 'admin' is reserved for support
  -- tooling and grants nothing today.
  role         text not null default 'user' check (role in ('user','admin')),
  -- Hook point for paid tiers. Quotas read this (0018); billing will write it.
  plan         text not null default 'free' check (plan in ('free','pilot','dept')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- RLS: you may read and update only your own row.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- No INSERT policy and no DELETE policy: rows are created by the trigger below
-- (or claim_my_account in 0017) and removed by delete_my_account in 0020.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- The real defence is here, not in the policy: username/role/plan are absent
-- from the grant, so no client can write them under any policy. username moves
-- only through set_my_username() below, which validates and rate-limits nothing
-- but format; role/plan move only through migrations or support tooling.
grant update (display_name, institution) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Username helpers
-- ---------------------------------------------------------------------------

-- Free-form seed (an email local part, a Google display name) -> a username that
-- satisfies the CHECK above and is not taken. Used for OAuth sign-ups, which
-- never pass through a form where the user could pick one.
create or replace function public._unique_username(p_seed text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text;
  v_try  text;
  i      int := 0;
begin
  v_base := lower(regexp_replace(coalesce(p_seed, ''), '[^A-Za-z0-9_]', '', 'g'));
  if length(v_base) < 3 then v_base := 'user' || v_base; end if;
  v_base := left(v_base, 20);
  v_try  := v_base;
  while exists (select 1 from public.profiles p where lower(p.username) = v_try) loop
    i := i + 1;
    if i > 9999 then
      -- Give up on prettiness rather than loop: 8 random hex chars cannot clash
      -- in practice, and the user can rename on /account.
      v_try := left(v_base, 12) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_try := left(v_base, 24 - length(i::text)) || i::text;
  end loop;
  return v_try;
end;
$$;

-- Is this username free? Deliberately callable by anon: a registration form
-- cannot work without it, and "does this handle exist" is disclosed by any
-- sign-up flow anyway. It reveals nothing about the account behind the name —
-- crucially NOT the email address (see 0021).
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(trim(p_username), '') ~ '^[A-Za-z0-9_]{3,24}$'
     and not exists (
       select 1 from public.profiles p
       where lower(p.username) = lower(trim(p_username))
     );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Change your own username. An RPC rather than a column grant, so the format
-- check and the "not taken" check cannot be bypassed by a direct PostgREST
-- update.
create or replace function public.set_my_username(p_username text)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := trim(coalesce(p_username, ''));
  v_row  public.profiles;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if v_name !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'username must be 3-24 characters: letters, numbers, underscore';
  end if;
  if exists (select 1 from public.profiles p
               where lower(p.username) = lower(v_name) and p.id <> v_uid) then
    raise exception 'that username is taken';
  end if;

  update public.profiles
     set username = v_name, updated_at = now()
   where id = v_uid
  returning * into v_row;
  if not found then raise exception 'no profile for this account'; end if;
  return v_row;
end;
$$;

revoke all on function public.set_my_username(text) from public;
grant execute on function public.set_my_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up.
--
-- Anonymous users get NO profile row: a guest player is not an account. They
-- get one only if they later claim the account (0017), at which point the SAME
-- auth.users.id already owns their players rows — so their history carries over
-- with no migration.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wanted text;
  v_name   text;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  v_wanted := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  v_name   := trim(coalesce(
                new.raw_user_meta_data->>'display_name',
                new.raw_user_meta_data->>'full_name',
                new.raw_user_meta_data->>'name',
                ''));

  if v_wanted <> '' then
    -- The user picked a name on a registration form. If it is taken, fail loudly
    -- so signUp() reports it and they can choose another — never silently hand
    -- them a different handle than the one they typed.
    if v_wanted !~ '^[A-Za-z0-9_]{3,24}$' then
      raise exception 'username must be 3-24 characters: letters, numbers, underscore';
    end if;
    if exists (select 1 from public.profiles p where lower(p.username) = lower(v_wanted)) then
      raise exception 'that username is taken';
    end if;
  else
    -- OAuth sign-up: no form, so derive one. They can rename on /account.
    v_wanted := public._unique_username(coalesce(split_part(new.email, '@', 1), 'user'));
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_wanted, left(coalesce(nullif(v_name, ''), v_wanted), 80))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table public.profiles is
  'App-owned account record. role/plan/username have NO client update grant — '
  'never mirror them into user_metadata, which the user can write themself.';
