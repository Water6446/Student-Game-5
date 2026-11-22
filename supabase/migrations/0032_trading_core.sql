-- =============================================================================
-- 0032_trading_core.sql — per-session state for the paper trading game.
--
-- WHY: game_type 'trading' reuses sessions, players, rounds, join codes and the
-- round loop of the other three games, and adds what trading needs: a fake
-- identity per instrument, accounts, positions, orders, fills, a cash ledger,
-- per-round results and the behaviour log the research depends on.
--
-- The rules this file keeps (CLAUDE.md, docs/PAPER_TRADING.md §9):
--   * Clients write NOTHING directly. Orders go through place_order /
--     cancel_order (0033); everything else is written by resolve_round, the
--     only writer of players.current_wealth.
--   * Students read only their own account rows; the host reads the class.
--   * What would identify the era or the companies (the real instrument behind
--     each slot, its price scale, the real window) is server-only:
--     market_session_secrets and session_instrument_secrets have RLS on, no
--     policies and no grants. Deliberately NOT session_secrets, whose whole row
--     get_manager_truth returns.
--   * Names are generic (accounts, orders, fills, "instrument slot") so event
--     contracts and sports bets can reuse them later (spec §10).
--
-- Also here, because each existing piece would otherwise treat 'trading' as a
-- basic game: hidden odds skip it, submit_allocation refuses it, bots are
-- refused in it, and new rounds get a trading deadline (rounds.closes_at).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Is this a paper trading session? Internal helper for triggers and RPCs.
-- ---------------------------------------------------------------------------
create or replace function public._is_trading_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.config->>'game_type' = 'trading'
  );
$$;

-- ---------------------------------------------------------------------------
-- Server-only session secrets.
-- ---------------------------------------------------------------------------
create table if not exists public.market_session_secrets (
  session_id        uuid primary key references public.sessions (id) on delete cascade,
  -- calendar year of Year 1 (the window starts on its first trading day)
  start_year        smallint not null,
  -- true when the host picked the year (it is still hidden from students)
  host_picked_year  boolean not null default false,
  -- day keys: first day of pre-window history, first and last trading day of the window
  history_first_day int not null,
  window_first_day  int not null,
  window_last_day   int not null check (window_last_day >= window_first_day),
  data_source       text not null,
  data_license      text not null,
  created_at        timestamptz not null default now()
);

create table if not exists public.session_instrument_secrets (
  session_id    uuid not null references public.sessions (id) on delete cascade,
  slot          smallint not null,
  -- restrict: a reload must never delete history a session still trades
  instrument_id int not null references public.market_instruments (id) on delete restrict,
  -- display price = vendor price × price_scale (dividends scaled the same way)
  price_scale   double precision not null check (price_scale > 0),
  primary key (session_id, slot),
  unique (session_id, instrument_id)
);

-- ---------------------------------------------------------------------------
-- Public to session members.
-- ---------------------------------------------------------------------------
create table if not exists public.session_instruments (
  session_id uuid not null references public.sessions (id) on delete cascade,
  slot       smallint not null check (slot >= 0),
  kind       text not null check (kind in ('equity', 'index_fund')),
  name       text not null,
  ticker     text not null,
  sector     text not null,
  about      text not null,
  primary key (session_id, slot),
  unique (session_id, ticker)
);

-- One row per revealed period, written by the resolver in the same transaction
-- that reveals the round. Game days are calendar days from Jan 1 of Year 1.
create table if not exists public.market_period_results (
  session_id     uuid not null references public.sessions (id) on delete cascade,
  round_number   int not null,
  first_game_day int null,
  last_game_day  int null,
  index_return   numeric null,
  -- [{slot, ret}] biggest gainers and losers among the companies
  movers         jsonb not null default '[]'::jsonb,
  -- [{y, m, rank, text}] curated headlines for the period, game-relative months
  headlines      jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  primary key (session_id, round_number)
);

-- ---------------------------------------------------------------------------
-- Accounts and their history: the player's own rows, plus the host.
-- ---------------------------------------------------------------------------
create table if not exists public.market_accounts (
  player_id     uuid primary key references public.players (id) on delete cascade,
  session_id    uuid not null references public.sessions (id) on delete cascade,
  -- one signed balance: negative is a margin loan; short-sale proceeds sit here
  cash          numeric not null,
  -- net liquidation value at the last revealed close: the score
  nlv           numeric not null,
  peak_nlv      numeric not null,
  -- largest peak-to-trough fall so far, as a fraction (0.25 = 25%)
  max_drawdown  numeric not null default 0,
  sharpe        numeric null,
  -- NLV at or below zero: closing orders only
  frozen        boolean not null default false,
  last_order_at timestamptz null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.market_positions (
  player_id    uuid not null references public.players (id) on delete cascade,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  slot         smallint not null,
  -- signed: negative is a short position; fractional shares allowed
  quantity     numeric not null,
  -- signed total cost of the open quantity (average cost = cost_basis / quantity)
  cost_basis   numeric not null,
  realized_pnl numeric not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (player_id, slot)
);

create table if not exists public.market_orders (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  player_id     uuid not null references public.players (id) on delete cascade,
  slot          smallint not null,
  side          text not null check (side in ('buy', 'sell', 'sell_short', 'buy_to_cover')),
  order_type    text not null check (order_type in ('market', 'limit', 'stop', 'stop_limit')),
  -- exactly one of: shares, or dollars (market orders only)
  quantity      numeric null check (quantity > 0),
  notional      numeric null check (notional > 0),
  limit_price   numeric null check (limit_price > 0),
  stop_price    numeric null check (stop_price > 0),
  tif           text not null check (tif in ('round', 'gtc')),
  status        text not null default 'open'
                  check (status in ('open', 'filled', 'canceled', 'rejected', 'expired')),
  reject_reason text null,
  -- buying power held while the order is open (released when it closes)
  reserved      numeric not null default 0 check (reserved >= 0),
  placed_round  int not null,
  placed_at     timestamptz not null default now(),
  closed_at     timestamptz null,
  -- the client's idempotency key: a double-tapped submit returns the first order
  client_ref    text null check (char_length(client_ref) <= 64),
  -- what the student saw when they placed it (research, spec §8 / Q14)
  context       jsonb null check (context is null or octet_length(context::text) <= 2048),
  check ((quantity is null) <> (notional is null)),
  check (notional is null or order_type = 'market'),
  check ((order_type in ('limit', 'stop_limit')) = (limit_price is not null)),
  check ((order_type in ('stop', 'stop_limit')) = (stop_price is not null))
);

create table if not exists public.market_fills (
  id           uuid primary key default gen_random_uuid(),
  -- null for a forced liquidation or a delisting settlement
  order_id     uuid null references public.market_orders (id) on delete cascade,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  round_number int not null,
  game_day     int not null,
  slot         smallint not null,
  side         text not null check (side in ('buy', 'sell', 'sell_short', 'buy_to_cover')),
  quantity     numeric not null check (quantity > 0),
  price        numeric not null check (price >= 0),
  notional     numeric not null,
  commission   numeric not null default 0,
  reason       text not null default 'order' check (reason in ('order', 'margin_call', 'delisting')),
  created_at   timestamptz not null default now()
);

-- Every cash movement, signed (+ in, − out).
create table if not exists public.market_ledger (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  round_number int not null,
  game_day     int not null,
  kind         text not null check (kind in ('trade', 'commission', 'dividend', 'distribution',
                 'interest', 'margin_interest', 'borrow_fee', 'forced_liquidation', 'delisting')),
  amount       numeric not null,
  slot         smallint null,
  fill_id      uuid null references public.market_fills (id) on delete cascade,
  note         text null,
  created_at   timestamptz not null default now()
);

create table if not exists public.market_account_rounds (
  player_id    uuid not null references public.players (id) on delete cascade,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  round_number int not null,
  nlv_start    numeric not null,
  nlv_end      numeric not null,
  -- the account's value at each trading day's close, for the student's chart
  daily_nlv    real[] not null default '{}',
  -- traded dollars this period (both sides), for turnover
  traded       numeric not null default 0,
  primary key (player_id, round_number)
);

create index if not exists market_orders_session_idx  on public.market_orders (session_id, status);
create index if not exists market_orders_player_idx   on public.market_orders (player_id, status);
create unique index if not exists market_orders_client_ref_idx
  on public.market_orders (player_id, client_ref) where client_ref is not null;
create index if not exists market_fills_player_idx    on public.market_fills (player_id, round_number);
create index if not exists market_fills_session_idx   on public.market_fills (session_id, round_number);
create index if not exists market_ledger_player_idx   on public.market_ledger (player_id, round_number);
create index if not exists market_positions_session_idx on public.market_positions (session_id);
create index if not exists market_accounts_session_idx  on public.market_accounts (session_id);

-- ---------------------------------------------------------------------------
-- The behaviour log (section-level: every Markets game writes it). Only
-- log_behavior_events (0033) inserts; nobody reads it directly.
-- ---------------------------------------------------------------------------
create table if not exists public.behavior_events (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  round_number int null,
  event_type   text not null check (event_type ~ '^[a-z][a-z_]{0,39}$'),
  client_ts    timestamptz null,
  server_ts    timestamptz not null default now(),
  payload      jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 4096)
);
create index if not exists behavior_events_session_idx on public.behavior_events (session_id, server_ts);
create index if not exists behavior_events_player_idx  on public.behavior_events (player_id, server_ts);

-- A fixed-window rate counter per player for log_behavior_events.
create table if not exists public.behavior_rate (
  player_id    uuid primary key references public.players (id) on delete cascade,
  window_start timestamptz not null,
  calls        int not null default 0,
  events       int not null default 0
);

-- ---------------------------------------------------------------------------
-- RLS and grants.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['market_session_secrets', 'session_instrument_secrets',
                           'session_instruments', 'market_period_results', 'market_accounts',
                           'market_positions', 'market_orders', 'market_fills', 'market_ledger',
                           'market_account_rounds', 'behavior_events', 'behavior_rate'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Session members: the fake identities and the revealed period summaries.
drop policy if exists session_instruments_select on public.session_instruments;
create policy session_instruments_select on public.session_instruments
  for select to authenticated using (public.is_session_member(session_id));

drop policy if exists market_period_results_select on public.market_period_results;
create policy market_period_results_select on public.market_period_results
  for select to authenticated using (public.is_session_member(session_id));

-- The player's own rows, and the host's view of the class.
do $$
declare t text;
begin
  foreach t in array array['market_accounts', 'market_positions', 'market_orders',
                           'market_fills', 'market_ledger', 'market_account_rounds'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public.is_my_player(player_id) or public.is_session_host(session_id))',
      t || '_select', t);
  end loop;
end $$;

grant select on public.session_instruments   to authenticated;
grant select on public.market_period_results to authenticated;
grant select on public.market_accounts       to authenticated;
grant select on public.market_positions      to authenticated;
grant select on public.market_orders         to authenticated;
grant select on public.market_fills          to authenticated;
grant select on public.market_ledger         to authenticated;
grant select on public.market_account_rounds to authenticated;

-- Realtime: what a trading screen reacts to. RLS still gates every row.
do $$
declare t text;
begin
  foreach t in array array['market_accounts', 'market_positions', 'market_orders',
                           'market_fills', 'market_period_results'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The round clock (section-level): a trading round closes at a deadline.
-- Set when the round is inserted, so start_round / next_round / _open_next_round
-- stay untouched; extend_round (0033) moves it; place_order refuses after it.
-- Other games leave it null.
-- ---------------------------------------------------------------------------
alter table public.rounds add column if not exists closes_at timestamptz null;

create or replace function public.rounds_trading_deadline()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secs int;
begin
  if public._is_trading_session(new.session_id) then
    select coalesce((s.config->>'round_seconds')::int, 90) into v_secs
      from public.sessions s where s.id = new.session_id;
    new.closes_at := now() + make_interval(secs => v_secs);
  end if;
  return new;
end;
$$;

drop trigger if exists rounds_trading_deadline on public.rounds;
create trigger rounds_trading_deadline
  before insert on public.rounds
  for each row execute function public.rounds_trading_deadline();

-- ---------------------------------------------------------------------------
-- Players in a trading session: an account on join (late joiners included,
-- with the starting cash join_session gave them), and no bots in v1. Dropping
-- players_trading_no_bots is all it takes to allow bot players later.
-- ---------------------------------------------------------------------------
create or replace function public.players_trading_no_bots()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_bot and public._is_trading_session(new.session_id) then
    raise exception 'paper trading sessions have no bots' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists players_trading_no_bots on public.players;
create trigger players_trading_no_bots
  before insert on public.players
  for each row execute function public.players_trading_no_bots();

create or replace function public.players_trading_account()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not new.is_bot and public._is_trading_session(new.session_id) then
    insert into public.market_accounts (player_id, session_id, cash, nlv, peak_nlv)
    values (new.id, new.session_id, new.current_wealth, new.current_wealth, new.current_wealth)
    on conflict (player_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists players_trading_account on public.players;
create trigger players_trading_account
  after insert on public.players
  for each row execute function public.players_trading_account();

-- ---------------------------------------------------------------------------
-- Hidden odds (0029) apply to good/bad markets only. Trading has none, so it is
-- excluded explicitly rather than by the accident of having no good_prob.
-- MIRRORS oddsHidden in lib/game/hidden-odds.ts.
-- ---------------------------------------------------------------------------
create or replace function public._odds_hidden(p_config jsonb, p_status text)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_config->>'game_type', 'basic') not in ('manager', 'trading')
     and coalesce(p_status, 'lobby') <> 'finished'
     and coalesce(p_config->>'show_odds_to_students', '') <> 'true';
$$;

-- ---------------------------------------------------------------------------
-- submit_allocation (0005) never checked the game type. A trading session
-- trades through orders; an allocation row there is written only by the
-- resolver. 0005's body with one added refusal, marked "0032".
-- ---------------------------------------------------------------------------
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
  -- 0032: paper trading sessions trade through place_order, never allocations
  if public._is_trading_session(v_round.session_id) then
    raise exception 'this session trades through orders, not allocations';
  end if;
  if v_round.status <> 'open' then
    raise exception 'this round is not open for submissions';
  end if;

  select * into v_player from public.players
    where session_id = v_round.session_id and auth_uid = v_uid and is_active = true;
  if not found then
    raise exception 'you are not an active player in this session';
  end if;

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

revoke all on function public.submit_allocation(uuid, numeric) from public, anon;
grant execute on function public.submit_allocation(uuid, numeric) to authenticated;

revoke all on function public._is_trading_session(uuid)  from public, anon, authenticated;
revoke all on function public.rounds_trading_deadline()  from public, anon, authenticated;
revoke all on function public.players_trading_no_bots()  from public, anon, authenticated;
revoke all on function public.players_trading_account()  from public, anon, authenticated;
revoke all on function public._odds_hidden(jsonb, text)  from public, anon, authenticated;
