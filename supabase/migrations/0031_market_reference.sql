-- =============================================================================
-- 0031_market_reference.sql — reference market data for the Markets section.
--
-- WHY: the paper trading game (docs/PAPER_TRADING.md) trades real historical
-- US stocks with the names and dates hidden until the end. The prices, the
-- real identities and the calendar are loaded here by an offline loader
-- (scripts/market-data/load.ts), not by a migration: migrations are schema.
--
-- EVERYTHING HERE IS SERVER-ONLY. Real tickers, real names and future prices
-- must never reach a student before the game ends, so every table has RLS on,
-- no policies and no grants: deny-all for every client role, the host
-- included. Clients see market data only through the SECURITY DEFINER RPCs in
-- 0033, which rescale prices, swap in fake names and stop at the last revealed
-- day. Same pattern as session_secrets (0014).
--
-- Conventions (lib/markets/data/normalize.ts is the TS side):
--   * a DAY KEY is whole calendar days since 1962-01-01 (an int; 0 = that day)
--   * prices are split-adjusted and NOT dividend-adjusted; dividends and other
--     cash distributions are separate corporate actions
--   * market_bars holds one row per instrument per calendar year with parallel
--     arrays (layout "B" in docs/PAPER_TRADING_DATA.md §4): about 21 bytes a
--     bar, and a period resolve reads at most two rows per instrument
--   * `kind` columns are text + CHECK so a later migration can widen them
--     (event_contract, sports_bet …) without an enum rewrite
--
-- Dev data (Yahoo, FRED, Ken French) is loaded ONLY into the separate dev
-- project; the loader refuses the production project. See
-- docs/PAPER_TRADING_DATA.md §1.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Day-key helpers. Pure; internal.
-- ---------------------------------------------------------------------------
create or replace function public._mkt_day(p_date date)
returns int language sql immutable set search_path = public, pg_temp as $$
  select (p_date - date '1962-01-01')::int;
$$;

create or replace function public._mkt_date(p_day int)
returns date language sql immutable set search_path = public, pg_temp as $$
  select date '1962-01-01' + p_day;
$$;

-- ---------------------------------------------------------------------------
-- Instruments: one row per price history we hold.
-- ---------------------------------------------------------------------------
create table if not exists public.market_instruments (
  id            int primary key,
  -- our stable key for the history ("IBM", "INDEX"); ids stay fixed across reloads
  key           text not null unique,
  kind          text not null check (kind in ('equity', 'index_fund')),
  real_ticker   text not null,
  real_name     text not null,
  sector        text not null,
  -- which vendor it came from, and what that vendor's licence allows
  source        text not null,
  license       text not null check (license in ('dev-only', 'display-licensed')),
  first_day     int not null,
  last_day      int not null check (last_day >= first_day),
  delist_type   text null check (delist_type in ('bankruptcy', 'cash_acquisition', 'stock_merger')),
  delist_day    int null,
  -- per split-adjusted share: recovery (bankruptcy), deal price (cash), final price (merger)
  delist_value  double precision null check (delist_value >= 0),
  loaded_at     timestamptz not null default now(),
  check ((delist_type is null) = (delist_day is null) and (delist_type is null) = (delist_value is null))
);

-- ---------------------------------------------------------------------------
-- Bars: one row per instrument per calendar year, parallel arrays.
--   days[i]       offset of bar i from Jan 1 of `year` (0..365)
--   o/h/l/c[i]    split-adjusted prices (4-byte floats; rescaled per session)
--   close_only    offsets of bars the vendor had only a close for
-- ---------------------------------------------------------------------------
create table if not exists public.market_bars (
  instrument_id int not null references public.market_instruments (id) on delete cascade,
  year          smallint not null,
  days          smallint[] not null,
  o             real[] not null,
  h             real[] not null,
  l             real[] not null,
  c             real[] not null,
  close_only    smallint[] not null default '{}',
  primary key (instrument_id, year),
  check (cardinality(days) = cardinality(c) and cardinality(o) = cardinality(c)
         and cardinality(h) = cardinality(c) and cardinality(l) = cardinality(c))
);

-- ---------------------------------------------------------------------------
-- Corporate actions. Delistings live on market_instruments (one per history).
--   dividend      cash per split-adjusted share, paid to holders on the ex-date
--   distribution  cash value per split-adjusted share of anything else paid out
--                 (a spin-off's shares, a special dividend), paid the same way
--   split         new shares per old share (informational: bars are adjusted)
-- ---------------------------------------------------------------------------
create table if not exists public.market_corporate_actions (
  instrument_id int not null references public.market_instruments (id) on delete cascade,
  day           int not null,
  kind          text not null check (kind in ('dividend', 'distribution', 'split')),
  amount        double precision not null check (amount > 0),
  note          text null,
  primary key (instrument_id, day, kind)
);

-- Every day any loaded instrument traded. The resolver steps through it.
create table if not exists public.market_calendar (
  day int primary key
);

-- Short rate (3-month T-bill, annual decimal, as published). Lookups carry the
-- last value forward over missing days.
create table if not exists public.market_rates (
  day   int primary key,
  tbill double precision not null check (tbill > -0.05 and tbill < 0.5)
);

-- The curated top-by-size list (data/universe/top_by_year.csv). instrument_id
-- is null for a company we hold no history for.
create table if not exists public.market_universe (
  anchor_year   smallint not null,
  rank          smallint not null check (rank >= 1),
  -- the name and ticker AT THE TIME (the finale reveals the era's names)
  real_name     text not null,
  real_ticker   text null,
  sector        text not null,
  instrument_id int null references public.market_instruments (id) on delete set null,
  primary key (anchor_year, rank)
);

-- Curated headlines (data/headlines/market_headlines.json). month = 'YYYY-MM'.
create table if not exists public.market_headlines (
  month    text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rank     smallint not null check (rank >= 1),
  text     text not null check (char_length(text) between 1 and 140),
  reviewed boolean not null default false,
  primary key (month, rank)
);

-- Sector labels and their generic "About" line (data/names/name_pool.json).
create table if not exists public.market_sectors (
  sector text primary key,
  about  text not null
);

-- Fake names and tickers, drawn per session (data/names/name_pool.json).
create table if not exists public.market_name_pool (
  ticker text primary key check (ticker ~ '^[A-Z]{3,5}$'),
  name   text not null unique,
  kind   text not null check (kind in ('equity', 'index_fund')),
  sector text null references public.market_sectors (sector) on delete cascade,
  about  text null,
  check ((kind = 'equity') = (sector is not null))
);

create index if not exists market_universe_instrument_idx on public.market_universe (instrument_id);
create index if not exists market_name_pool_sector_idx on public.market_name_pool (sector);

-- ---------------------------------------------------------------------------
-- Deny-all. Supabase's default privileges grant every new table to anon and
-- authenticated; take that back, and enable RLS with no policies.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['market_instruments', 'market_bars', 'market_corporate_actions',
                           'market_calendar', 'market_rates', 'market_universe',
                           'market_headlines', 'market_sectors', 'market_name_pool'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

revoke all on function public._mkt_day(date) from public, anon, authenticated;
revoke all on function public._mkt_date(int) from public, anon, authenticated;
