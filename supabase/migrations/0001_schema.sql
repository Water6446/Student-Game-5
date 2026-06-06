-- =============================================================================
-- 0001_schema.sql — tables for the investment-risk game.
-- Run order: 0001_schema -> 0002_rls -> 0003_functions.
-- =============================================================================

-- gen_random_uuid() is built in on PG13+ (Supabase). pgcrypto is also fine.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sessions: one per class run. host_id is a REAL (magic-link) auth user.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  join_code     text not null unique,
  host_id       uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'lobby'
                  check (status in ('lobby', 'active', 'finished')),
  current_round int  not null default 0,
  -- config keys: payoff_mode, num_rounds, starting_wealth, good_prob,
  -- market_mode, market_scope, show_full_leaderboard_to_students, allow_late_join
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players: one row per joined student (anonymous auth uid). current_wealth is
-- the single authoritative wealth value; only resolve_round() may change it.
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  auth_uid       uuid not null references auth.users (id) on delete cascade,
  display_name   text not null default 'Player',
  current_wealth numeric not null,
  is_active      boolean not null default true,
  joined_at      timestamptz not null default now(),
  unique (session_id, auth_uid)
);

create index if not exists players_session_idx on public.players (session_id);

-- ---------------------------------------------------------------------------
-- rounds: one per round number per session. market_outcome (shared scope) is
-- written ONLY at reveal time — never stored before the reveal.
-- ---------------------------------------------------------------------------
create table if not exists public.rounds (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  round_number   int not null,
  status         text not null default 'open'
                   check (status in ('open', 'locked', 'revealed')),
  market_outcome text null check (market_outcome in ('good', 'bad')),
  revealed_at    timestamptz null,
  unique (session_id, round_number)
);

create index if not exists rounds_session_idx on public.rounds (session_id);

-- ---------------------------------------------------------------------------
-- allocations: one per (round, player). Students upsert risky_amount/safe_amount
-- while the round is 'open'. resolve_round() overwrites safe_amount,
-- market_outcome (independent scope) and resulting_wealth authoritatively.
-- ---------------------------------------------------------------------------
create table if not exists public.allocations (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.rounds (id) on delete cascade,
  player_id       uuid not null references public.players (id) on delete cascade,
  risky_amount    numeric not null,
  safe_amount     numeric not null,
  market_outcome  text null check (market_outcome in ('good', 'bad')),
  resulting_wealth numeric null,
  submitted_at    timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists allocations_round_idx on public.allocations (round_id);
create index if not exists allocations_player_idx on public.allocations (player_id);
