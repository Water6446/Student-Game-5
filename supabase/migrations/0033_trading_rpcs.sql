-- =============================================================================
-- 0033_trading_rpcs.sql — the paper trading game's RPCs.
--
-- WHY: everything a client can do in a trading session, and everything it can
-- read, goes through these SECURITY DEFINER functions (0031 and 0032 give
-- clients no write grant and no read on market data at all). They enforce the
-- three secrecy rules of docs/PAPER_TRADING.md §9 in one place:
--   1. no price past the last REVEALED day leaves the server (the host's
--      included): every read is capped at _trading_last_revealed_day;
--   2. no real ticker, name or date before the session is finished: prices
--      are rescaled per session, instruments are fake, and dates leave as
--      game-relative labels — [game_day, year, month, day], where game_day
--      counts calendar days from Jan 1 of Year 1 and year is "Year N"
--      (no Year 0: the year before Year 1 is -1);
--   3. the host may see the real era and companies (get_trading_truth) behind
--      a host-only control; students only once the game is finished.
--
-- resolve_round is re-defined as 0029's body plus a trading branch first; the
-- branch calls _resolve_trading, which in THIS migration is a stub that reveals
-- the period (summary, headlines, wealth carried over) without filling orders.
-- The day-by-day engine replaces the stub in the next migration (Phase 3).
-- MIRRORED by lib/markets/clock.ts (periods, labels), lib/markets/trading/
-- config.ts (defaults, validation) and lib/markets/trading/orders.ts (buying
-- power). Change both sides together.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Defaults. MIRRORS TRADING_DEFAULTS in lib/markets/trading/config.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_config_defaults()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'game_type', 'trading',
    'num_rounds', 25,
    'period', 'quarter',
    'starting_wealth', 100000,
    'round_seconds', 90,
    'universe_size', 25,
    'allow_late_join', false,
    'show_full_leaderboard_to_students', true,
    'margin_enabled', true,
    'initial_margin', 0.5,
    'maint_long', 0.25,
    'maint_short', 0.30,
    'shorting_enabled', true,
    'borrow_fee', 0.003,
    'borrow_spread', 0.05,
    'spread', 0.001,
    'commission', 0,
    'headlines', true,
    'friction_profile', 'standard',
    'research_mode', false
  );
$$;

-- Years of real history shown before Year 1 (decided: 5).
create or replace function public._trading_history_years()
returns int language sql immutable set search_path = public, pg_temp as $$ select 5; $$;

-- ---------------------------------------------------------------------------
-- Periods. Round k covers calendar days [from_day, to_day] (inclusive), counted
-- from Jan 1 of the start year: 12/6/3/1 months, or 7 days for weekly rounds.
-- MIRRORS periodRange in lib/markets/clock.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_period_range(p_start_year int, p_period text, p_round int)
returns table (from_day int, to_day int)
language sql immutable set search_path = public, pg_temp as $$
  select public._mkt_day(x.f), public._mkt_day(x.t)
  from (
    select
      case when p_period = 'week'
           then make_date(p_start_year, 1, 1) + (p_round - 1) * 7
           else (make_date(p_start_year, 1, 1) + make_interval(months => (p_round - 1) * m.n))::date
      end as f,
      case when p_period = 'week'
           then make_date(p_start_year, 1, 1) + p_round * 7 - 1
           else (make_date(p_start_year, 1, 1) + make_interval(months => p_round * m.n))::date - 1
      end as t
    from (select case p_period when 'year' then 12 when 'half' then 6
                               when 'quarter' then 3 when 'month' then 1 else 0 end as n) m
  ) x;
$$;

-- [game_day, year, month, day] for a day key. MIRRORS gameLabel in clock.ts.
create or replace function public._trading_label(p_start_year int, p_day int)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_array(
    p_day - public._mkt_day(make_date(p_start_year, 1, 1)),
    extract(year from d)::int - p_start_year
      + case when extract(year from d)::int >= p_start_year then 1 else 0 end,
    extract(month from d)::int,
    extract(day from d)::int)
  from (select public._mkt_date(p_day) as d) x;
$$;

-- ---------------------------------------------------------------------------
-- Eligibility: the anchor's companies, in rank order, that have history from
-- Jan 1 of the first pre-window year (10-day holiday tolerance) and either data
-- through the window's end or a delisting inside it.
-- MIRRORS ineligibility / selectUniverse in lib/markets/data/universe.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_eligible(p_start_year int, p_window_end int, p_history_years int)
returns table (rank smallint, instrument_id int, sector text)
language sql stable security definer set search_path = public, pg_temp as $$
  with a as (
    select max(u.anchor_year) as anchor from public.market_universe u
     where u.anchor_year <= p_start_year
  )
  select u.rank, i.id, i.sector
    from public.market_universe u
    join a on u.anchor_year = a.anchor
    join public.market_instruments i on i.id = u.instrument_id
   where i.kind = 'equity'
     and i.first_day <= public._mkt_day(make_date(p_start_year - p_history_years, 1, 1)) + 10
     and ((i.delist_day is not null
           and i.delist_day between public._mkt_day(make_date(p_start_year, 1, 1)) and p_window_end)
          or i.last_day >= p_window_end - 10)
   order by u.rank;
$$;

-- The index fund history that covers a window, if any.
create or replace function public._trading_index_for(p_start_year int, p_window_end int, p_history_years int)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select i.id from public.market_instruments i
   where i.kind = 'index_fund'
     and i.first_day <= public._mkt_day(make_date(p_start_year - p_history_years, 1, 1)) + 10
     and i.last_day >= p_window_end - 10
   order by i.id limit 1;
$$;

-- An instrument's raw close on or before a day.
create or replace function public._instrument_close(p_instrument_id int, p_day int)
returns double precision language sql stable security definer set search_path = public, pg_temp as $$
  select u.c
    from public.market_bars b
   cross join lateral unnest(b.days, b.c) as u(off, c)
   where b.instrument_id = p_instrument_id
     and b.year between extract(year from public._mkt_date(p_day))::int - 1
                    and extract(year from public._mkt_date(p_day))::int
     and public._mkt_day(make_date(b.year, 1, 1)) + u.off <= p_day
   order by b.year desc, u.off desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- A session's bars, rescaled, between two day keys (all slots, or one).
-- The ONLY way bars leave market_bars; callers cap p_to themselves.
-- ---------------------------------------------------------------------------
create or replace function public._session_bars(p_session_id uuid, p_from int, p_to int, p_slot smallint default null)
returns table (slot smallint, day int, o double precision, h double precision,
               l double precision, c double precision, close_only boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.slot,
         (y.jan1 + u.off)::int,
         u.o * s.price_scale, u.h * s.price_scale, u.l * s.price_scale, u.c * s.price_scale,
         u.off = any (b.close_only)
    from public.session_instrument_secrets s
    join public.market_bars b
      on b.instrument_id = s.instrument_id
     and b.year between extract(year from public._mkt_date(p_from))::int
                    and extract(year from public._mkt_date(p_to))::int
   cross join lateral (select public._mkt_day(make_date(b.year, 1, 1)) as jan1) y
   cross join lateral unnest(b.days, b.o, b.h, b.l, b.c) as u(off, o, h, l, c)
   where s.session_id = p_session_id
     and (p_slot is null or s.slot = p_slot)
     and y.jan1 + u.off between p_from and p_to;
$$;

-- ---------------------------------------------------------------------------
-- The last day anyone may see: the end of the latest revealed period, or the
-- last trading day before Year 1 while nothing is revealed. Period results are
-- written in the same transaction that reveals the round, so they ARE the
-- record of what is revealed.
-- ---------------------------------------------------------------------------
create or replace function public._trading_last_revealed_day(p_session_id uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select public._mkt_day(make_date(ms.start_year, 1, 1)) + max(pr.last_game_day)
       from public.market_period_results pr
      where pr.session_id = p_session_id and pr.last_game_day is not null),
    (select max(c.day) from public.market_calendar c where c.day < ms.window_first_day))
  from public.market_session_secrets ms
  where ms.session_id = p_session_id;
$$;

-- Each slot's last close on or before a day (display units).
create or replace function public._trading_last_prices(p_session_id uuid, p_day int)
returns table (slot smallint, price numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (b.slot) b.slot, round(b.c::numeric, 4)
    from public._session_bars(p_session_id, p_day - 40, p_day) b
   order by b.slot, b.day desc;
$$;

-- A timestamp from client text, or null when it does not parse.
create or replace function public._try_timestamptz(p_text text)
returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
begin
  return p_text::timestamptz;
exception when others then
  return null;
end;
$$;

-- =============================================================================
-- create_trading_session — the host starts a paper trading session.
--   p_config      setup options (see _trading_config_defaults); server-owned keys
--                 (data_source, history_years …) are overwritten
--   p_start_year  null = a random eligible era; otherwise the host's pick. It is
--                 stored ONLY in market_session_secrets, never in config.
-- Returns the session, its join code, and how many companies it trades.
-- =============================================================================
create or replace function public.create_trading_session(p_config jsonb default '{}'::jsonb,
                                                         p_start_year int default null)
returns table (id uuid, join_code text, universe_size int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid       uuid := auth.uid();
  v_config    jsonb;
  v_hist      int := public._trading_history_years();
  v_rounds    int;
  v_period    text;
  v_n         int;
  v_cal_first int;
  v_cal_last  int;
  v_first_y   int;
  v_last_y    int;
  y           int;
  v_end       int;
  v_count     int;
  v_years     int[] := '{}';
  v_start     int;
  v_index     int;
  v_jan1      int;
  v_win_first int;
  v_win_last  int;
  v_hist_first int;
  v_base_day  int;
  v_code      text;
  v_alphabet  text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_id        uuid;
  v_slot      smallint := 0;
  v_used      text[] := '{}';
  v_name      text;
  v_ticker    text;
  v_about     text;
  v_close     double precision;
  v_scale     double precision;
  v_source    text;
  v_license   text;
  r           record;
  k           text;
  i           int;
begin
  if v_uid is null then
    raise exception 'must be signed in to create a session';
  end if;

  -- defaults, then the host's options, then the keys only the server sets
  v_config := public._trading_config_defaults() || coalesce(p_config, '{}'::jsonb);
  v_config := v_config - 'data_source' - 'data_license' - 'history_years' - 'start_year';
  v_config := v_config || jsonb_build_object('game_type', 'trading', 'history_years', v_hist);

  -- validation
  v_period := v_config->>'period';
  if v_period is null or v_period not in ('year', 'half', 'quarter', 'month', 'week') then
    raise exception 'period must be year, half, quarter, month or week'; end if;
  v_rounds := (v_config->>'num_rounds')::int;
  if v_rounds is null or v_rounds not between 1 and 100 then
    raise exception 'num_rounds must be 1..100'; end if;
  if (v_config->>'starting_wealth')::numeric not between 1000 and 10000000 then
    raise exception 'starting cash must be between $1,000 and $10,000,000'; end if;
  if (v_config->>'round_seconds')::int not between 30 and 600 then
    raise exception 'round_seconds must be 30..600'; end if;
  v_n := (v_config->>'universe_size')::int;
  if v_n is null or v_n not between 5 and 25 then
    raise exception 'universe_size must be 5..25'; end if;
  if (v_config->>'initial_margin')::numeric not between 0.25 and 1 then
    raise exception 'initial_margin must be 0.25..1'; end if;
  if (v_config->>'maint_long')::numeric not between 0.1 and (v_config->>'initial_margin')::numeric then
    raise exception 'maint_long must be 0.1..initial_margin'; end if;
  if (v_config->>'maint_short')::numeric not between 0.1 and 1 then
    raise exception 'maint_short must be 0.1..1'; end if;
  if (v_config->>'borrow_fee')::numeric not between 0 and 0.5 then
    raise exception 'borrow_fee must be 0..0.5'; end if;
  if (v_config->>'borrow_spread')::numeric not between 0 and 0.2 then
    raise exception 'borrow_spread must be 0..0.2'; end if;
  if (v_config->>'spread')::numeric not between 0 and 0.02 then
    raise exception 'spread must be 0..0.02'; end if;
  if (v_config->>'commission')::numeric not between 0 and 100 then
    raise exception 'commission must be 0..100'; end if;
  if (v_config->>'friction_profile') not in ('low', 'standard', 'high') then
    raise exception 'friction_profile must be low, standard or high'; end if;
  foreach k in array array['allow_late_join', 'show_full_leaderboard_to_students', 'margin_enabled',
                           'shorting_enabled', 'headlines', 'research_mode'] loop
    if jsonb_typeof(v_config->k) <> 'boolean' then
      raise exception '% must be true or false', k; end if;
  end loop;

  -- the data we hold
  select min(c.day), max(c.day) into v_cal_first, v_cal_last from public.market_calendar c;
  if v_cal_first is null then
    raise exception 'no market data is loaded';
  end if;
  v_first_y := extract(year from public._mkt_date(v_cal_first))::int + v_hist;
  -- a history starting on Jan 2 still counts as "from Jan 1"
  if v_cal_first > public._mkt_day(make_date(v_first_y - v_hist, 1, 1)) + 10 then
    v_first_y := v_first_y + 1;
  end if;
  v_last_y := extract(year from public._mkt_date(v_cal_last))::int;

  if p_start_year is not null then
    if p_start_year < v_first_y then
      raise exception 'the earliest start year is %', v_first_y; end if;
    select r2.to_day into v_end from public._trading_period_range(p_start_year, v_period, v_rounds) r2;
    if v_end > v_cal_last then
      raise exception 'not enough market data after % for % rounds of that length', p_start_year, v_rounds; end if;
    if public._trading_index_for(p_start_year, v_end, v_hist) is null then
      raise exception 'no index fund history covers that window'; end if;
    select count(*) into v_count from public._trading_eligible(p_start_year, v_end, v_hist);
    if v_count < 5 then
      raise exception 'only % companies have data for that window (5 needed)', v_count; end if;
    v_start := p_start_year;
    v_n := least(v_n, v_count);
  else
    for y in v_first_y .. v_last_y loop
      select r2.to_day into v_end from public._trading_period_range(y, v_period, v_rounds) r2;
      exit when v_end > v_cal_last;
      continue when public._trading_index_for(y, v_end, v_hist) is null;
      select count(*) into v_count from public._trading_eligible(y, v_end, v_hist);
      if v_count >= v_n then v_years := v_years || y; end if;
    end loop;
    if cardinality(v_years) = 0 then
      raise exception 'no era has enough market data for % companies over % rounds of that length', v_n, v_rounds;
    end if;
    v_start := v_years[1 + floor(random() * cardinality(v_years))::int];
  end if;

  select r2.to_day into v_end from public._trading_period_range(v_start, v_period, v_rounds) r2;
  v_jan1 := public._mkt_day(make_date(v_start, 1, 1));
  select min(c.day) into v_win_first from public.market_calendar c where c.day >= v_jan1;
  select max(c.day) into v_win_last  from public.market_calendar c where c.day <= v_end;
  select min(c.day) into v_hist_first from public.market_calendar c
   where c.day >= public._mkt_day(make_date(v_start - v_hist, 1, 1));
  select max(c.day) into v_base_day from public.market_calendar c where c.day < v_win_first;
  v_index := public._trading_index_for(v_start, v_end, v_hist);

  select string_agg(distinct i2.source, ', '), bool_or(i2.license = 'dev-only')::text
    into v_source, v_license
    from public.market_instruments i2
   where i2.id = v_index
      or i2.id in (select e.instrument_id from public._trading_eligible(v_start, v_end, v_hist) e limit v_n);
  v_license := case when v_license = 'true' then 'dev-only' else 'display-licensed' end;
  v_config := v_config || jsonb_build_object('universe_size', v_n, 'data_source', v_source,
                                             'data_license', v_license);

  -- unique, human-typeable join code (as create_session)
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions s where s.join_code = v_code);
  end loop;

  insert into public.sessions (join_code, host_id, status, current_round, config)
  values (v_code, v_uid, 'lobby', 0, v_config)
  returning sessions.id into v_id;

  insert into public.market_session_secrets (session_id, start_year, host_picked_year,
    history_first_day, window_first_day, window_last_day, data_source, data_license)
  values (v_id, v_start, p_start_year is not null, v_hist_first, v_win_first, v_win_last,
          v_source, v_license);

  -- Slot 0: the index fund, priced near $100 at the start of Year 1.
  v_close := public._instrument_close(v_index, v_base_day);
  v_scale := exp(ln(40) + random() * (ln(160) - ln(40))) / v_close;
  insert into public.session_instrument_secrets (session_id, slot, instrument_id, price_scale)
  values (v_id, 0, v_index, v_scale);
  select p.name, p.ticker, coalesce(p.about, 'Holds the whole market for a tiny yearly fee.')
    into v_name, v_ticker, v_about
    from public.market_name_pool p where p.kind = 'index_fund' order by random() limit 1;
  insert into public.session_instruments (session_id, slot, kind, name, ticker, sector, about)
  values (v_id, 0, 'index_fund', coalesce(v_name, 'Total Market Index Fund'),
          coalesce(v_ticker, 'TMIX'), 'Index fund', v_about);
  v_used := v_used || coalesce(v_ticker, 'TMIX');

  -- Slots 1..n: the companies in a RANDOM order, so the slot number cannot leak
  -- size rank; each start price drawn log-uniformly from $15 to $250, so neither
  -- a famous price level nor a few-cent adjusted price gives a company away.
  for r in
    select e.instrument_id, e.sector
      from (select * from public._trading_eligible(v_start, v_end, v_hist) limit v_n) e
     order by random()
  loop
    v_slot := v_slot + 1;
    v_close := public._instrument_close(r.instrument_id, v_base_day);
    if v_close is null or v_close <= 0 then
      raise exception 'instrument % has no price before the window', r.instrument_id;
    end if;
    v_scale := exp(ln(15) + random() * (ln(250) - ln(15))) / v_close;
    insert into public.session_instrument_secrets (session_id, slot, instrument_id, price_scale)
    values (v_id, v_slot, r.instrument_id, v_scale);

    -- a fake name from the same sector, never a ticker we hold real data for
    select p.name, p.ticker into v_name, v_ticker
      from public.market_name_pool p
     where p.kind = 'equity' and p.sector = r.sector and p.ticker <> all (v_used)
       and not exists (select 1 from public.market_instruments mi where upper(mi.real_ticker) = p.ticker)
     order by random() limit 1;
    if not found then
      select p.name, p.ticker into v_name, v_ticker
        from public.market_name_pool p
       where p.kind = 'equity' and p.ticker <> all (v_used)
         and not exists (select 1 from public.market_instruments mi where upper(mi.real_ticker) = p.ticker)
       order by random() limit 1;
      if not found then raise exception 'the fake-name pool is exhausted'; end if;
    end if;
    v_used := v_used || v_ticker;
    select ms.about into v_about from public.market_sectors ms where ms.sector = r.sector;
    insert into public.session_instruments (session_id, slot, kind, name, ticker, sector, about)
    values (v_id, v_slot, 'equity', v_name, v_ticker, r.sector,
            coalesce(v_about, 'A large company.'));
  end loop;

  return query select v_id, v_code, v_n;
end;
$$;

-- =============================================================================
-- extend_round — the host adds time to the open round (5..600 s at a go, never
-- more than an hour from now).
-- =============================================================================
create or replace function public.extend_round(p_session_id uuid, p_seconds int)
returns public.rounds
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id is distinct from auth.uid() then
    raise exception 'not authorized: host only';
  end if;
  if coalesce(v_session.config->>'game_type', '') <> 'trading' then
    raise exception 'only paper trading rounds have a timer';
  end if;
  if p_seconds is null or p_seconds not between 5 and 600 then
    raise exception 'extend by 5..600 seconds';
  end if;
  update public.rounds
     set closes_at = least(greatest(coalesce(closes_at, now()), now()) + make_interval(secs => p_seconds),
                           now() + interval '1 hour')
   where session_id = p_session_id and round_number = v_session.current_round and status = 'open'
  returning * into v_round;
  if not found then raise exception 'no open round to extend'; end if;
  return v_round;
end;
$$;

-- =============================================================================
-- place_order / cancel_order — the only way a student trades.
--
-- p_order: {slot, side, order_type, quantity | notional, limit_price?,
--           stop_price?, tif?, client_ref?, context?}
--   side        buy | sell | sell_short | buy_to_cover
--   order_type  market | limit | stop | stop_limit
--   notional    dollars, market orders only; converted to shares at the price
--               the order is expected to fill at
--   tif         round (this round only) | gtc; market orders are always round
--
-- Buying power (MIRRORS lib/markets/trading/orders.ts):
--   marks at the last revealed close p;   equity E = cash + LMV − SMV
--   im = initial_margin when margin is on, else 1 (fully cash-backed)
--   requirement IR = im × (LMV + SMV)
--   an order that ADDS exposure X = qty × ref price reserves
--     im × X + X × spread/2 + commission
--   and is accepted only if E − IR − (reserves of open orders) ≥ that.
--   Closing orders (sell a long, cover a short) reserve nothing and are always
--   accepted up to the shares held minus shares already in open closing orders.
-- The resolver re-checks every fill (Phase 3).
-- =============================================================================
create or replace function public.place_order(p_session_id uuid, p_order jsonb)
returns public.market_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid      uuid := auth.uid();
  v_session  public.sessions%rowtype;
  v_round    public.rounds%rowtype;
  v_player   public.players%rowtype;
  v_acct     public.market_accounts%rowtype;
  v_order    public.market_orders%rowtype;
  v_cfg      jsonb;
  v_slot     smallint;
  v_side     text;
  v_type     text;
  v_tif      text;
  v_qty      numeric;
  v_notional numeric;
  v_limit    numeric;
  v_stop     numeric;
  v_ref      text;
  v_ctx      jsonb;
  v_last_day int;
  v_delist   int;
  v_price    numeric;
  v_spread   numeric;
  v_comm     numeric;
  v_im       numeric;
  v_pos      numeric;
  v_closing  numeric;
  v_lmv      numeric;
  v_smv      numeric;
  v_equity   numeric;
  v_held     numeric;
  v_ref_px   numeric;
  v_reserve  numeric := 0;
  v_free     numeric;
begin
  if v_uid is null then raise exception 'must be signed in to trade'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found or coalesce(v_session.config->>'game_type', '') <> 'trading' then
    raise exception 'not a paper trading session';
  end if;
  v_cfg := v_session.config;
  if v_session.status <> 'active' then
    raise exception 'trading is closed: the game is not running';
  end if;

  select * into v_player from public.players
   where session_id = p_session_id and auth_uid = v_uid and is_active and not is_bot;
  if not found then raise exception 'you are not a player in this session'; end if;

  select * into v_round from public.rounds
   where session_id = p_session_id and round_number = v_session.current_round;
  if not found or v_round.status <> 'open' then
    raise exception 'trading is closed for this round';
  end if;
  if v_round.closes_at is not null and now() >= v_round.closes_at then
    raise exception 'time is up for this round';
  end if;

  -- One order at a time per player: everything below reads and reserves against
  -- this account, so a double-tap cannot spend the same buying power twice.
  select * into v_acct from public.market_accounts where player_id = v_player.id for update;
  if not found then raise exception 'you have no trading account in this session'; end if;

  -- An idempotent retry returns the order the first attempt created.
  v_ref := nullif(trim(p_order->>'client_ref'), '');
  if v_ref is not null then
    if char_length(v_ref) > 64 then raise exception 'client_ref is too long'; end if;
    select * into v_order from public.market_orders where player_id = v_player.id and client_ref = v_ref;
    if found then return v_order; end if;
  end if;

  -- ---- parse --------------------------------------------------------------
  v_side := p_order->>'side';
  if v_side is null or v_side not in ('buy', 'sell', 'sell_short', 'buy_to_cover') then
    raise exception 'side must be buy, sell, sell_short or buy_to_cover'; end if;
  v_type := coalesce(p_order->>'order_type', 'market');
  if v_type not in ('market', 'limit', 'stop', 'stop_limit') then
    raise exception 'order_type must be market, limit, stop or stop_limit'; end if;
  v_tif := coalesce(p_order->>'tif', 'round');
  if v_tif not in ('round', 'gtc') then raise exception 'tif must be round or gtc'; end if;
  if v_type = 'market' then v_tif := 'round'; end if;

  begin
    v_slot     := (p_order->>'slot')::smallint;
    v_qty      := nullif(p_order->>'quantity', '')::numeric;
    v_notional := nullif(p_order->>'notional', '')::numeric;
    v_limit    := nullif(p_order->>'limit_price', '')::numeric;
    v_stop     := nullif(p_order->>'stop_price', '')::numeric;
  exception when others then
    raise exception 'slot, quantity, notional and prices must be numbers';
  end;
  if (v_qty is null) = (v_notional is null) then
    raise exception 'give either a number of shares or a dollar amount'; end if;
  if v_notional is not null and v_type <> 'market' then
    raise exception 'dollar amounts are for market orders; enter shares for this order type'; end if;
  if v_qty is not null then
    v_qty := round(v_qty, 6);
    if v_qty <= 0 or v_qty > 1000000000 then raise exception 'shares must be more than 0'; end if;
  end if;
  if v_notional is not null and (v_notional < 1 or v_notional > 10000000000) then
    raise exception 'the dollar amount must be at least $1'; end if;
  if (v_type in ('limit', 'stop_limit')) <> (v_limit is not null) then
    raise exception 'a % order % a limit price', replace(v_type, '_', '-'),
      case when v_type in ('limit', 'stop_limit') then 'needs' else 'does not take' end; end if;
  if (v_type in ('stop', 'stop_limit')) <> (v_stop is not null) then
    raise exception 'a % order % a stop price', replace(v_type, '_', '-'),
      case when v_type in ('stop', 'stop_limit') then 'needs' else 'does not take' end; end if;
  if coalesce(v_limit, 1) <= 0 or coalesce(v_stop, 1) <= 0
     or coalesce(v_limit, 0) > 10000000 or coalesce(v_stop, 0) > 10000000 then
    raise exception 'prices must be above $0'; end if;
  v_limit := round(v_limit, 4);
  v_stop  := round(v_stop, 4);
  if v_side = 'sell_short' and not coalesce((v_cfg->>'shorting_enabled')::boolean, false) then
    raise exception 'short selling is off in this session'; end if;
  if not exists (select 1 from public.session_instruments si
                  where si.session_id = p_session_id and si.slot = v_slot) then
    raise exception 'unknown instrument'; end if;
  v_ctx := p_order->'context';
  if v_ctx is not null and (jsonb_typeof(v_ctx) <> 'object' or octet_length(v_ctx::text) > 2048) then
    v_ctx := null;
  end if;

  -- ---- caps -----------------------------------------------------------------
  if (select count(*) from public.market_orders o
       where o.player_id = v_player.id and o.status = 'open') >= 50 then
    raise exception 'you have 50 open orders; cancel some first'; end if;
  if (select count(*) from public.market_orders o
       where o.player_id = v_player.id and o.placed_round = v_session.current_round) >= 100 then
    raise exception 'you have placed 100 orders this round'; end if;

  -- ---- prices at the last revealed close ---------------------------------
  v_last_day := public._trading_last_revealed_day(p_session_id);
  select i.delist_day into v_delist
    from public.session_instrument_secrets s
    join public.market_instruments i on i.id = s.instrument_id
   where s.session_id = p_session_id and s.slot = v_slot;
  if v_delist is not null and v_delist <= v_last_day then
    raise exception 'that company no longer trades'; end if;
  select lp.price into v_price from public._trading_last_prices(p_session_id, v_last_day) lp
   where lp.slot = v_slot;
  if v_price is null or v_price <= 0 then raise exception 'no price yet for that instrument'; end if;

  v_spread := coalesce((v_cfg->>'spread')::numeric, 0.001);
  v_comm   := coalesce((v_cfg->>'commission')::numeric, 0);
  v_im     := case when coalesce((v_cfg->>'margin_enabled')::boolean, false)
                   then coalesce((v_cfg->>'initial_margin')::numeric, 0.5) else 1 end;

  -- dollars -> shares at the price a market order is expected to fill at
  if v_notional is not null then
    v_qty := round(v_notional / (v_price * (1 + case when v_side in ('buy', 'buy_to_cover')
                                                     then v_spread / 2 else -v_spread / 2 end)), 6);
    if v_qty <= 0 then raise exception 'that dollar amount buys no shares'; end if;
  end if;

  -- ---- the position this order acts on -------------------------------------
  select coalesce(mp.quantity, 0) into v_pos
    from (select 1) x left join public.market_positions mp
      on mp.player_id = v_player.id and mp.slot = v_slot;
  v_pos := coalesce(v_pos, 0);

  if v_side = 'buy' and v_pos < 0 then
    raise exception 'you are short this one: use buy to cover first'; end if;
  if v_side = 'sell_short' and v_pos > 0 then
    raise exception 'you own this one: sell it before selling short'; end if;
  if v_acct.frozen and v_side in ('buy', 'sell_short') then
    raise exception 'your account is frozen: you can only close positions'; end if;

  if v_side in ('sell', 'buy_to_cover') then
    -- shares already promised to other open closing orders on this slot
    select coalesce(sum(coalesce(o.quantity, o.notional / v_price)), 0) into v_closing
      from public.market_orders o
     where o.player_id = v_player.id and o.slot = v_slot and o.status = 'open' and o.side = v_side;
    v_held := case when v_side = 'sell' then greatest(v_pos, 0) else greatest(-v_pos, 0) end;
    if v_qty > v_held - v_closing + 0.0000005 then
      raise exception 'you can % at most % shares', replace(v_side, '_', ' '),
        round(greatest(v_held - v_closing, 0), 6); end if;
  else
    -- an order that adds exposure must fit in buying power
    select coalesce(sum(case when mp.quantity > 0 then mp.quantity * lp.price else 0 end), 0),
           coalesce(sum(case when mp.quantity < 0 then -mp.quantity * lp.price else 0 end), 0)
      into v_lmv, v_smv
      from public.market_positions mp
      join public._trading_last_prices(p_session_id, v_last_day) lp on lp.slot = mp.slot
     where mp.player_id = v_player.id;
    v_equity := v_acct.cash + v_lmv - v_smv;
    v_ref_px := case
      when v_side = 'buy' and v_type = 'market'     then v_price
      when v_side = 'buy' and v_type = 'limit'      then v_limit
      when v_side = 'buy' and v_type = 'stop'       then greatest(v_stop, v_price)
      when v_side = 'buy' and v_type = 'stop_limit' then v_limit
      when v_type in ('limit', 'stop_limit')        then greatest(v_limit, v_price)
      else v_price
    end;
    v_reserve := round(v_qty * v_ref_px * (v_im + v_spread / 2) + v_comm, 4);
    select v_equity - v_im * (v_lmv + v_smv) - coalesce(sum(o.reserved), 0) into v_free
      from public.market_orders o where o.player_id = v_player.id and o.status = 'open';
    if v_free + 0.005 < v_reserve then
      raise exception 'not enough buying power: this order needs $%, you have $% available',
        to_char(v_reserve, 'FM999,999,999,990.00'), to_char(greatest(v_free, 0), 'FM999,999,999,990.00');
    end if;
  end if;

  insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, notional,
    limit_price, stop_price, tif, reserved, placed_round, client_ref, context)
  values (p_session_id, v_player.id, v_slot, v_side, v_type,
          case when v_notional is null then v_qty end, v_notional,
          v_limit, v_stop, v_tif, v_reserve, v_session.current_round, v_ref, v_ctx)
  returning * into v_order;

  update public.market_accounts set last_order_at = now(), updated_at = now()
   where player_id = v_player.id;
  return v_order;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.market_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order   public.market_orders%rowtype;
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
begin
  select * into v_order from public.market_orders where id = p_order_id for update;
  if not found or not public.is_my_player(v_order.player_id) then
    raise exception 'order not found';
  end if;
  select * into v_session from public.sessions where id = v_order.session_id;
  select * into v_round from public.rounds
   where session_id = v_session.id and round_number = v_session.current_round;
  if v_session.status <> 'active' or not found or v_round.status <> 'open'
     or (v_round.closes_at is not null and now() >= v_round.closes_at) then
    raise exception 'orders can be cancelled only while the round is open';
  end if;
  if v_order.status <> 'open' then
    raise exception 'this order is already %', v_order.status;
  end if;
  update public.market_orders
     set status = 'canceled', reserved = 0, closed_at = now()
   where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

-- =============================================================================
-- Reads. All capped at the last revealed day; all return game-relative dates.
-- =============================================================================

-- The market board: each instrument's last price, its change over the last
-- revealed period (or the last year, before Year 1), 52-week range, trailing
-- dividend yield and a weekly sparkline of the last year.
create or replace function public.get_market_snapshot(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ms       public.market_session_secrets%rowtype;
  v_last     int;
  v_prev     int;
  v_jan1     int;
  v_revealed int;
  v_basis    text;
  v_out      jsonb;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'not a paper trading session'; end if;

  v_jan1 := public._mkt_day(make_date(v_ms.start_year, 1, 1));
  v_last := public._trading_last_revealed_day(p_session_id);
  select count(*) into v_revealed from public.market_period_results pr where pr.session_id = p_session_id;
  if v_revealed = 0 then
    v_prev := v_last - 365;
    v_basis := 'year';
  elsif v_revealed = 1 then
    select max(c.day) into v_prev from public.market_calendar c where c.day < v_ms.window_first_day;
    v_basis := 'period';
  else
    select v_jan1 + pr.last_game_day into v_prev from public.market_period_results pr
     where pr.session_id = p_session_id and pr.last_game_day is not null
     order by pr.round_number desc offset 1 limit 1;
    v_basis := 'period';
  end if;

  with b as (
    select * from public._session_bars(p_session_id, greatest(least(v_prev, v_last - 365) - 10,
                                                              v_ms.history_first_day), v_last)
  ),
  lst as (select distinct on (b.slot) b.slot, b.day, b.c from b order by b.slot, b.day desc),
  prv as (select distinct on (b.slot) b.slot, b.c from b where b.day <= v_prev order by b.slot, b.day desc),
  rng as (select b.slot, max(b.h) as hi, min(b.l) as lo from b where b.day > v_last - 365 group by b.slot),
  wk as (
    select distinct on (b.slot, date_trunc('week', public._mkt_date(b.day)))
           b.slot, date_trunc('week', public._mkt_date(b.day)) as w, b.c
      from b where b.day > v_last - 365
     order by b.slot, date_trunc('week', public._mkt_date(b.day)), b.day desc
  ),
  spark as (select wk.slot, jsonb_agg(round(wk.c::numeric, 4) order by wk.w) as s from wk group by wk.slot),
  divs as (
    select s.slot, sum(a.amount * s.price_scale) as d
      from public.session_instrument_secrets s
      join public.market_corporate_actions a
        on a.instrument_id = s.instrument_id and a.kind = 'dividend'
       and a.day > v_last - 365 and a.day <= v_last
     where s.session_id = p_session_id
     group by s.slot
  ),
  gone as (
    select s.slot, (i.delist_day is not null and i.delist_day <= v_last) as delisted
      from public.session_instrument_secrets s
      join public.market_instruments i on i.id = s.instrument_id
     where s.session_id = p_session_id
  )
  select jsonb_build_object(
    'as_of', public._trading_label(v_ms.start_year, v_last),
    'revealed_rounds', v_revealed,
    'change_basis', v_basis,
    'instruments', coalesce(jsonb_agg(jsonb_build_object(
        'slot', lst.slot,
        'last', round(lst.c::numeric, 4),
        'prev', round(prv.c::numeric, 4),
        'change', case when prv.c > 0 then round((lst.c / prv.c - 1)::numeric, 6) end,
        'high_52w', round(rng.hi::numeric, 4),
        'low_52w', round(rng.lo::numeric, 4),
        'dividend_yield', case when lst.c > 0 then round((coalesce(divs.d, 0) / lst.c)::numeric, 6) end,
        'spark', coalesce(spark.s, '[]'::jsonb),
        'delisted', coalesce(gone.delisted, false)
      ) order by lst.slot), '[]'::jsonb))
  into v_out
  from lst
  left join prv using (slot)
  left join rng using (slot)
  left join spark using (slot)
  left join divs using (slot)
  left join gone using (slot);
  return v_out;
end;
$$;

-- One instrument's history from the start of pre-window history to the last
-- revealed day. daily: [[game_day, year, month, day, o, h, l, c], …]
-- weekly: the week's last bar, [[game_day, year, month, day, c], …]
create or replace function public.get_price_history(p_session_id uuid, p_slot int,
                                                    p_resolution text default 'daily')
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ms   public.market_session_secrets%rowtype;
  v_last int;
  v_out  jsonb;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'not a paper trading session'; end if;
  if not exists (select 1 from public.session_instruments si
                  where si.session_id = p_session_id and si.slot = p_slot) then
    raise exception 'unknown instrument';
  end if;
  if p_resolution not in ('daily', 'weekly') then
    raise exception 'resolution must be daily or weekly';
  end if;
  v_last := public._trading_last_revealed_day(p_session_id);

  if p_resolution = 'daily' then
    select coalesce(jsonb_agg(public._trading_label(v_ms.start_year, b.day)
             || jsonb_build_array(round(b.o::numeric, 4), round(b.h::numeric, 4),
                                  round(b.l::numeric, 4), round(b.c::numeric, 4))
             order by b.day), '[]'::jsonb)
      into v_out
      from public._session_bars(p_session_id, v_ms.history_first_day, v_last, p_slot::smallint) b;
  else
    select coalesce(jsonb_agg(public._trading_label(v_ms.start_year, w.day)
             || jsonb_build_array(round(w.c::numeric, 4)) order by w.day), '[]'::jsonb)
      into v_out
      from (select distinct on (date_trunc('week', public._mkt_date(b.day))) b.day, b.c
              from public._session_bars(p_session_id, v_ms.history_first_day, v_last, p_slot::smallint) b
             order by date_trunc('week', public._mkt_date(b.day)), b.day desc) w;
  end if;
  return v_out;
end;
$$;

-- A revealed period's daily closes for every instrument, for the reveal replay:
-- {round, days: [[game_day, year, month, day] …], prev: {slot: close},
--  series: [{slot, c: [close per day]}]}
create or replace function public.get_period_replay(p_session_id uuid, p_round int)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ms    public.market_session_secrets%rowtype;
  v_pr    public.market_period_results%rowtype;
  v_jan1  int;
  v_from  int;
  v_to    int;
  v_prev  int;
  v_out   jsonb;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'not a paper trading session'; end if;
  select * into v_pr from public.market_period_results
   where session_id = p_session_id and round_number = p_round;
  if not found or not exists (select 1 from public.rounds r where r.session_id = p_session_id
                               and r.round_number = p_round and r.status = 'revealed') then
    raise exception 'that period has not been revealed';
  end if;
  if v_pr.first_game_day is null then
    return jsonb_build_object('round', p_round, 'days', '[]'::jsonb, 'prev', '{}'::jsonb,
                              'series', '[]'::jsonb);
  end if;
  v_jan1 := public._mkt_day(make_date(v_ms.start_year, 1, 1));
  v_from := v_jan1 + v_pr.first_game_day;
  v_to   := v_jan1 + v_pr.last_game_day;
  select max(c.day) into v_prev from public.market_calendar c where c.day < v_from;

  with b as (select * from public._session_bars(p_session_id, coalesce(v_prev, v_from) - 40, v_to)),
  days as (select distinct b.day from b where b.day between v_from and v_to),
  prv as (select distinct on (b.slot) b.slot, b.c from b where b.day < v_from order by b.slot, b.day desc),
  ser as (select b.slot, jsonb_agg(round(b.c::numeric, 4) order by b.day) as c
            from b where b.day between v_from and v_to group by b.slot)
  select jsonb_build_object(
    'round', p_round,
    'days', (select coalesce(jsonb_agg(public._trading_label(v_ms.start_year, d.day) order by d.day), '[]'::jsonb) from days d),
    'prev', (select coalesce(jsonb_object_agg(prv.slot::text, round(prv.c::numeric, 4)), '{}'::jsonb) from prv),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('slot', ser.slot, 'c', ser.c) order by ser.slot), '[]'::jsonb) from ser))
  into v_out;
  return v_out;
end;
$$;

-- Standings by account value, with Sharpe and drawdown. The host sees the
-- class; a student sees the class when the host shows the leaderboard, and
-- always their own row.
create or replace function public.get_trading_standings(p_session_id uuid)
returns table (player_id uuid, display_name text, nlv numeric, rank int,
               sharpe numeric, max_drawdown numeric, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_all boolean;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  v_all := public.is_session_host(p_session_id) or public.session_show_leaderboard(p_session_id);
  return query
    with ranked as (
      select p.id, p.display_name, a.nlv, (rank() over (order by a.nlv desc))::int as rk,
             a.sharpe, a.max_drawdown, coalesce(p.auth_uid = auth.uid(), false) as me
        from public.players p
        join public.market_accounts a on a.player_id = p.id
       where p.session_id = p_session_id and p.is_active and not p.is_bot
    )
    select r.id, r.display_name, r.nlv, r.rk, r.sharpe, r.max_drawdown, r.me
      from ranked r
     where v_all or r.me
     order by r.rk, r.display_name;
end;
$$;

-- What the class is doing this round, as aggregates only (no one's orders).
create or replace function public.get_class_activity(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_round int;
  v_out   jsonb;
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  select s.current_round into v_round from public.sessions s where s.id = p_session_id;
  select jsonb_build_object(
    'round', v_round,
    'players', (select count(*) from public.players p
                 where p.session_id = p_session_id and p.is_active and not p.is_bot),
    'players_with_orders', (select count(distinct o.player_id) from public.market_orders o
                             where o.session_id = p_session_id and o.placed_round = v_round),
    'orders', (select count(*) from public.market_orders o
                where o.session_id = p_session_id and o.placed_round = v_round),
    'most_bought', (select coalesce(jsonb_agg(jsonb_build_object('slot', t.slot, 'players', t.n)
                                              order by t.n desc, t.slot), '[]'::jsonb)
                      from (select o.slot, count(distinct o.player_id) as n
                              from public.market_orders o
                             where o.session_id = p_session_id and o.placed_round = v_round
                               and o.side = 'buy' and o.status <> 'rejected'
                             group by o.slot order by n desc, o.slot limit 5) t))
  into v_out;
  return v_out;
end;
$$;

-- The truth behind the session: the real era and companies. The host any time
-- (behind a host-only control, because the laptop is often mirrored);
-- students only once the session is finished.
create or replace function public.get_trading_truth(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ms     public.market_session_secrets%rowtype;
  v_status text;
begin
  select s.status into v_status from public.sessions s where s.id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if not (public.is_session_host(p_session_id)
          or (public.is_session_member(p_session_id) and v_status = 'finished')) then
    raise exception 'the real companies and dates are revealed when the game ends';
  end if;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'not a paper trading session'; end if;
  return jsonb_build_object(
    'start_year', v_ms.start_year,
    'host_picked_year', v_ms.host_picked_year,
    'history_first_date', public._mkt_date(v_ms.history_first_day),
    'window_first_date', public._mkt_date(v_ms.window_first_day),
    'window_last_date', public._mkt_date(v_ms.window_last_day),
    'data_source', v_ms.data_source,
    'data_license', v_ms.data_license,
    -- the name and ticker the company had in that era (the anchor list's), and today's
    'instruments', (select coalesce(jsonb_agg(jsonb_build_object(
                       'slot', s.slot,
                       'real_name', coalesce(u.real_name, i.real_name),
                       'real_ticker', coalesce(u.real_ticker, i.real_ticker),
                       'current_name', i.real_name, 'current_ticker', i.real_ticker,
                       'sector', i.sector, 'kind', i.kind) order by s.slot), '[]'::jsonb)
                      from public.session_instrument_secrets s
                      join public.market_instruments i on i.id = s.instrument_id
                      left join lateral (
                        select u2.real_name, u2.real_ticker from public.market_universe u2
                         where u2.instrument_id = i.id and u2.anchor_year <= v_ms.start_year
                         order by u2.anchor_year desc limit 1) u on true
                     where s.session_id = p_session_id));
end;
$$;

-- =============================================================================
-- log_behavior_events — the client's batched interaction log (section-level).
-- p_events: [{type, ts?, payload?}], at most 50 per call and 2 KB per payload;
-- per player at most 30 calls and 600 events a minute. Only the player's own
-- events, stamped with the server's time and the current round.
-- =============================================================================
create or replace function public.log_behavior_events(p_session_id uuid, p_events jsonb)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_player uuid;
  v_round  int;
  v_n      int;
  v_rate   public.behavior_rate%rowtype;
  e        jsonb;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  select p.id, s.current_round into v_player, v_round
    from public.players p join public.sessions s on s.id = p.session_id
   where p.session_id = p_session_id and p.auth_uid = v_uid and not p.is_bot;
  if v_player is null then raise exception 'you are not a player in this session'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'events must be an array'; end if;
  v_n := jsonb_array_length(p_events);
  if v_n = 0 then return 0; end if;
  if v_n > 50 then raise exception 'at most 50 events per call'; end if;

  for e in select * from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'type', '') !~ '^[a-z][a-z_]{0,39}$' then
      raise exception 'each event needs a type of lowercase letters and underscores';
    end if;
    if e ? 'payload' and jsonb_typeof(e->'payload') <> 'object' then
      raise exception 'an event payload must be an object';
    end if;
    if e ? 'payload' and octet_length((e->'payload')::text) > 2048 then
      raise exception 'an event payload must be at most 2 KB';
    end if;
  end loop;

  insert into public.behavior_rate as br (player_id, window_start, calls, events)
  values (v_player, now(), 1, v_n)
  on conflict (player_id) do update
    set window_start = case when br.window_start < now() - interval '1 minute' then now() else br.window_start end,
        calls  = case when br.window_start < now() - interval '1 minute' then 1 else br.calls + 1 end,
        events = case when br.window_start < now() - interval '1 minute' then v_n else br.events + v_n end
  returning * into v_rate;
  if v_rate.calls > 30 or v_rate.events > 600 then
    raise exception 'too many events: slow down';
  end if;

  insert into public.behavior_events (session_id, player_id, round_number, event_type, client_ts, payload)
  select p_session_id, v_player, v_round, x->>'type', public._try_timestamptz(x->>'ts'),
         coalesce(x->'payload', '{}'::jsonb)
    from jsonb_array_elements(p_events) x;
  return v_n;
end;
$$;

-- =============================================================================
-- _resolve_trading — PHASE 2 STUB. Reveals the period without trading: writes
-- the period summary (index return, movers, the period's curated headlines),
-- carries every account's value forward unchanged, records the round in
-- allocations and market_account_rounds, and sets the round 'revealed' LAST.
-- Orders are not filled here; the Phase 3 migration replaces this function
-- with the day-by-day engine.
-- =============================================================================
create or replace function public._resolve_trading(p_session_id uuid, p_round_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
  v_ms      public.market_session_secrets%rowtype;
  v_jan1    int;
  v_from    int;
  v_to      int;
  v_first   int;
  v_last    int;
  v_prev    int;
  v_idx_ret numeric;
  v_movers  jsonb := '[]'::jsonb;
  v_heads   jsonb := '[]'::jsonb;
begin
  select * into v_round from public.rounds where id = p_round_id;
  select * into v_session from public.sessions where id = p_session_id;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'trading session is missing its market window'; end if;

  v_jan1 := public._mkt_day(make_date(v_ms.start_year, 1, 1));
  select r.from_day, r.to_day into v_from, v_to
    from public._trading_period_range(v_ms.start_year, v_session.config->>'period', v_round.round_number) r;
  select min(c.day), max(c.day) into v_first, v_last
    from public.market_calendar c where c.day between v_from and v_to;
  v_prev := public._trading_last_revealed_day(p_session_id);

  if v_last is not null then
    with b as (select * from public._session_bars(p_session_id, v_prev - 40, v_last)),
    p0 as (select distinct on (b.slot) b.slot, b.c from b where b.day <= v_prev order by b.slot, b.day desc),
    p1 as (select distinct on (b.slot) b.slot, b.c from b order by b.slot, b.day desc),
    rets as (select p1.slot, (p1.c / p0.c - 1)::numeric as ret from p0 join p1 using (slot) where p0.c > 0),
    eq as (select rets.* from rets join public.session_instruments si
             on si.session_id = p_session_id and si.slot = rets.slot and si.kind = 'equity'),
    top as (select * from eq order by ret desc limit 3),
    bot as (select * from eq order by ret asc limit 3)
    select (select round(r.ret, 6) from rets r where r.slot = 0),
           coalesce((select jsonb_agg(jsonb_build_object('slot', m.slot, 'ret', round(m.ret, 6)) order by m.ret desc)
                       from (select * from top union select * from bot) m), '[]'::jsonb)
      into v_idx_ret, v_movers;

    if coalesce((v_session.config->>'headlines')::boolean, true) then
      select coalesce(jsonb_agg(jsonb_build_object(
               'y', (substr(h.month, 1, 4)::int - v_ms.start_year
                     + case when substr(h.month, 1, 4)::int >= v_ms.start_year then 1 else 0 end),
               'm', substr(h.month, 6, 2)::int, 'rank', h.rank, 'text', h.text)
             order by h.month, h.rank), '[]'::jsonb)
        into v_heads
        from public.market_headlines h
       where h.month between to_char(public._mkt_date(v_from), 'YYYY-MM')
                         and to_char(public._mkt_date(v_to), 'YYYY-MM');
    end if;
  end if;

  insert into public.market_period_results (session_id, round_number, first_game_day, last_game_day,
                                            index_return, movers, headlines)
  values (p_session_id, v_round.round_number, v_first - v_jan1, v_last - v_jan1,
          v_idx_ret, v_movers, v_heads)
  on conflict (session_id, round_number) do update
    set first_game_day = excluded.first_game_day, last_game_day = excluded.last_game_day,
        index_return = excluded.index_return, movers = excluded.movers, headlines = excluded.headlines;

  -- STUB: no trading yet, so every account's value carries forward.
  insert into public.allocations (round_id, player_id, risky_amount, safe_amount, resulting_wealth)
  select p_round_id, p.id, 0, p.current_wealth, p.current_wealth
    from public.players p
   where p.session_id = p_session_id and p.is_active and not p.is_bot
  on conflict (round_id, player_id) do update
    set risky_amount = 0, safe_amount = excluded.safe_amount, resulting_wealth = excluded.resulting_wealth;

  insert into public.market_account_rounds (player_id, session_id, round_number, nlv_start, nlv_end)
  select a.player_id, p_session_id, v_round.round_number, a.nlv, a.nlv
    from public.market_accounts a
    join public.players p on p.id = a.player_id and p.is_active
   where a.session_id = p_session_id
  on conflict (player_id, round_number) do nothing;

  -- LAST: every client keys its reveal off this write.
  update public.rounds
     set status = 'revealed', market_outcome = null, market_return = v_idx_ret, revealed_at = now()
   where id = p_round_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_round — 0029's body, copied verbatim, with ONE change: the trading
-- branch right after the game type is read (marked "0033"). It is the
-- definition from here on. The other three games are untouched; the game and
-- accounts self-test suites prove it.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_round(
  p_session_id uuid, p_round_number int,
  p_market_override text default null,
  p_market_overrides text[] default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session        public.sessions%rowtype;
  v_round          public.rounds%rowtype;
  v_game_type      text;
  v_payoff         text;
  v_market_mode    text;
  v_scope          text;
  v_good_prob      numeric;
  v_rf             numeric;
  v_corr           numeric;
  v_mix            numeric;  -- sqrt(ρ): P(an asset uses the common uniform)
  v_u_common       numeric;
  v_u              numeric;
  v_n              int;
  v_assets         jsonb;
  v_shared_outcome text;
  v_outcomes       text[];
  v_player_outs    text[];
  v_amounts        numeric[];
  v_asset_prob     numeric;
  v_asset_payoff   text;
  r                record;
  v_risky          numeric;
  v_safe           numeric;
  v_frac           numeric;
  v_outcome        text;
  v_mult           numeric;
  v_result         numeric;
  v_sum            numeric;
  i                int;
  -- manager game
  v_secret     jsonb;
  v_mgrs_pub   jsonb;
  v_market_ret numeric;
  v_mret       numeric[];
  v_prev       jsonb;
  v_prev_base  numeric;
  v_cash       numeric;
  v_borrowed   numeric;
  v_borrow_rt  numeric;
  v_gross      numeric;
  v_mgmt       numeric;
  v_perf       numeric;
  v_fees       numeric;
  v_breakdown  jsonb;
  v_lev_cap    numeric;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session not found'; end if;
  if v_session.host_id <> auth.uid() then
    raise exception 'not authorized: only the host may resolve a round';
  end if;
  -- 0029: hidden odds live in session_secrets, not config. Resolve with them.
  v_session.config := public._apply_odds(v_session.config,
    (select s.secret->'odds' from public.session_secrets s where s.session_id = p_session_id));

  -- 0029: FOR UPDATE, so a second reveal of this round waits for the first,
  -- then sees 'revealed' and stops instead of re-rolling the market.
  select * into v_round from public.rounds
    where session_id = p_session_id and round_number = p_round_number
    for update;
  if not found then raise exception 'round not found'; end if;
  if v_round.status <> 'locked' then
    raise exception 'round must be locked before resolving (status=%).', v_round.status;
  end if;

  v_game_type   := coalesce(v_session.config->>'game_type', 'basic');

  -- ===========================================================================
  -- PAPER TRADING (0033). Its own resolver writes everything — period results,
  -- accounts, allocations, players.current_wealth — and sets the round
  -- 'revealed' LAST, exactly like the branches below.
  -- ===========================================================================
  if v_game_type = 'trading' then
    perform public._resolve_trading(p_session_id, v_round.id);
    return;
  end if;
  v_payoff      := coalesce(v_session.config->>'payoff_mode', 'moderate');
  v_market_mode := coalesce(v_session.config->>'market_mode', 'auto');
  v_scope       := coalesce(v_session.config->>'market_scope', 'shared');
  v_good_prob   := coalesce((v_session.config->>'good_prob')::numeric, 0.6);

  -- ===========================================================================
  -- MANAGER GAME
  -- ===========================================================================
  if v_game_type = 'manager' then
    v_n         := coalesce((v_session.config->>'num_managers')::int, 5);
    v_rf        := coalesce((v_session.config->>'risk_free_rate')::numeric, 0.03);
    v_lev_cap   := coalesce((v_session.config->>'leverage_cap')::numeric, 2.0);
    v_borrow_rt := v_rf + coalesce((v_session.config->>'borrow_spread')::numeric, 0.05);
    v_mgrs_pub  := v_session.config->'managers';

    select secret into v_secret from public.session_secrets
      where session_id = p_session_id;
    if not found then raise exception 'manager session is missing its parameters'; end if;

    -- The year's draws: one market, then one INDEPENDENT eps per manager.
    v_market_ret := public._rand_normal(
      coalesce((v_session.config->>'market_mean')::numeric, 0.08),
      coalesce((v_session.config->>'market_sd')::numeric, 0.16));

    v_mret := array[]::numeric[];
    for i in 1..v_n loop
      v_mret := v_mret ||
        ( coalesce((v_secret->'managers'->(i-1)->>'beta')::numeric, 1) * v_market_ret
        + coalesce((v_secret->'managers'->(i-1)->>'alpha')::numeric, 0)
        + public._rand_normal(0, coalesce(
            (v_secret->'managers'->(i-1)->>'tracking_error')::numeric, 0)) );
    end loop;

    for r in
      select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
             a.id as alloc_id, a.risky_breakdown
      from public.players p
      left join public.allocations a
        on a.player_id = p.id and a.round_id = v_round.id
      where p.session_id = p_session_id and p.is_active = true
    loop
      v_amounts := array[]::numeric[];

      if r.is_bot then
        -- 'The Index' holds the market itself: no managers, no fees.
        for i in 1..v_n loop v_amounts := v_amounts || 0::numeric; end loop;
      elsif r.risky_breakdown is not null then
        for i in 1..v_n loop
          v_amounts := v_amounts ||
            greatest(coalesce((r.risky_breakdown->>(i-1))::numeric, 0), 0);
        end loop;
      else
        -- NON-SUBMITTERS CARRY FORWARD. This is the OPPOSITE of every other
        -- game, where a missing allocation defaults to all-safe. A portfolio you
        -- did not touch this year is a portfolio you still hold. The previous
        -- year's SHARES persist, rescaled to current wealth, so the allocation
        -- still means the same thing after the wealth moved.
        select al.risky_breakdown, al.risky_amount + al.safe_amount
          into v_prev, v_prev_base
        from public.allocations al
        join public.rounds ro on ro.id = al.round_id
        where al.player_id = r.player_id and ro.session_id = p_session_id
          and ro.round_number < p_round_number and al.risky_breakdown is not null
        order by ro.round_number desc
        limit 1;

        if v_prev is null or coalesce(v_prev_base, 0) <= 0 then
          -- never allocated at all → 100% risk-free
          for i in 1..v_n loop v_amounts := v_amounts || 0::numeric; end loop;
        else
          for i in 1..v_n loop
            v_amounts := v_amounts ||
              greatest(coalesce((v_prev->>(i-1))::numeric, 0), 0)
                * r.current_wealth / v_prev_base;
          end loop;
        end if;
      end if;

      -- clamp to the leverage cap; scale the whole book down if it is over
      v_sum := 0;
      for i in 1..v_n loop v_sum := v_sum + v_amounts[i]; end loop;
      if v_sum > v_lev_cap * r.current_wealth and v_sum > 0 then
        for i in 1..v_n loop
          v_amounts[i] := v_amounts[i] * v_lev_cap * r.current_wealth / v_sum;
        end loop;
        v_sum := v_lev_cap * r.current_wealth;
      end if;

      v_cash     := greatest(r.current_wealth - v_sum, 0);
      v_borrowed := greatest(v_sum - r.current_wealth, 0);
      v_safe     := r.current_wealth - v_sum;   -- NEGATIVE when levered

      -- Fees per manager, in this exact order: management always, even in a
      -- down year; performance only on a positive GROSS return. (Industry
      -- practice more often charges the performance fee on the return NET of
      -- the management fee — that is a one-token change here. No high-water
      -- mark in v1: a fund that loses 20% then gains 20% charges on the
      -- recovery, and the reveal screen says so.)
      v_result    := 0;
      v_fees      := 0;
      v_breakdown := '[]'::jsonb;
      for i in 1..v_n loop
        v_gross := v_amounts[i] * v_mret[i];
        v_mgmt  := v_amounts[i] * coalesce((v_mgrs_pub->(i-1)->>'mgmt_fee')::numeric, 0);
        v_perf  := coalesce((v_mgrs_pub->(i-1)->>'perf_fee')::numeric, 0)
                     * greatest(v_gross, 0);
        v_result := v_result + v_amounts[i] + v_gross - v_mgmt - v_perf;
        v_fees   := v_fees + v_mgmt + v_perf;
        v_breakdown := v_breakdown || jsonb_build_array(
          jsonb_build_object('mgmt', round(v_mgmt, 4), 'perf', round(v_perf, 4)));
      end loop;

      if r.is_bot and r.strategy = 'index' then
        -- the index itself: the market return, no fees, no leverage
        v_result := r.current_wealth * (1 + v_market_ret);
      else
        v_result := v_result
                  + v_cash * (1 + v_rf)
                  - v_borrowed * (1 + v_borrow_rt);
      end if;
      v_result := greatest(v_result, 0);   -- floor at zero — busted

      if r.alloc_id is null then
        insert into public.allocations (round_id, player_id, risky_amount,
          safe_amount, risky_breakdown, fees_paid, fee_breakdown, resulting_wealth)
        values (v_round.id, r.player_id, v_sum, v_safe, to_jsonb(v_amounts),
          round(v_fees, 4), v_breakdown, v_result);
      else
        update public.allocations
          set risky_amount     = v_sum,
              safe_amount      = v_safe,
              risky_breakdown  = to_jsonb(v_amounts),
              fees_paid        = round(v_fees, 4),
              fee_breakdown    = v_breakdown,
              resulting_wealth = v_result
          where id = r.alloc_id;
      end if;

      update public.players set current_wealth = v_result where id = r.player_id;
    end loop;

    update public.rounds
      set status          = 'revealed',
          market_outcome  = null,
          market_return   = round(v_market_ret, 6),
          manager_returns = to_jsonb(v_mret),
          revealed_at     = now()
      where id = v_round.id;
    return;
  end if;

  -- ===========================================================================
  -- PORTFOLIO GAME
  -- ===========================================================================
  if v_game_type = 'portfolio' then
    v_n      := coalesce((v_session.config->>'num_assets')::int, 4);
    v_rf     := coalesce((v_session.config->>'risk_free_rate')::numeric, 0);
    v_corr   := least(greatest(coalesce((v_session.config->>'correlation')::numeric, 0), 0), 1);
    v_mix    := sqrt(v_corr);
    v_assets := v_session.config->'assets';
    if v_assets is not null and jsonb_typeof(v_assets) <> 'array' then
      v_assets := null;
    end if;

    -- shared scope: one outcome per ASSET for the whole class
    if v_market_mode = 'manual' then
      if p_market_overrides is null or array_length(p_market_overrides, 1) <> v_n then
        raise exception 'manual portfolio market requires % outcomes', v_n;
      end if;
      v_scope := 'shared';
      v_outcomes := p_market_overrides;
      for i in 1..v_n loop
        if v_outcomes[i] not in ('good','bad') then
          raise exception 'outcomes must be good or bad';
        end if;
      end loop;
    elsif v_scope = 'shared' then
      v_outcomes := array[]::text[];
      v_u_common := random();  -- the round's common market factor
      for i in 1..v_n loop
        v_asset_prob := coalesce((v_assets->(i-1)->>'good_prob')::numeric, v_good_prob);
        v_u := case when random() < v_mix then v_u_common else random() end;
        v_outcomes := v_outcomes ||
          (case when v_u < v_asset_prob then 'good' else 'bad' end);
      end loop;
    end if;

    for r in
      select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
             a.id as alloc_id, a.risky_breakdown
      from public.players p
      left join public.allocations a
        on a.player_id = p.id and a.round_id = v_round.id
      where p.session_id = p_session_id and p.is_active = true
    loop
      -- per-asset amounts: bots play their fixed strategy; humans use their
      -- submission; non-submitters default to all-safe (zeros)
      v_amounts := array[]::numeric[];
      if r.is_bot then
        for i in 1..v_n loop
          v_amounts := v_amounts || (case r.strategy
            when 'concentrated'     then case when i = 1 then r.current_wealth else 0 end
            when 'diversified'      then r.current_wealth / v_n
            when 'half_diversified' then (r.current_wealth * 0.5) / v_n
            else 0::numeric  -- all_safe / unknown
          end);
        end loop;
      else
        for i in 1..v_n loop
          v_amounts := v_amounts ||
            greatest(coalesce((r.risky_breakdown->>(i-1))::numeric, 0), 0);
        end loop;
      end if;

      -- clamp: if the sum somehow exceeds wealth, scale the whole portfolio down
      v_sum := 0;
      for i in 1..v_n loop v_sum := v_sum + v_amounts[i]; end loop;
      if v_sum > r.current_wealth and v_sum > 0 then
        for i in 1..v_n loop
          v_amounts[i] := v_amounts[i] * r.current_wealth / v_sum;
        end loop;
        v_sum := r.current_wealth;
      end if;
      v_safe := r.current_wealth - v_sum;

      -- outcomes this player faces: the class-wide draw, or their own draws
      -- (independent scope correlates each player's assets with each other,
      -- never across players)
      if v_scope = 'independent' then
        v_player_outs := array[]::text[];
        v_u_common := random();  -- this player's common market factor
        for i in 1..v_n loop
          v_asset_prob := coalesce((v_assets->(i-1)->>'good_prob')::numeric, v_good_prob);
          v_u := case when random() < v_mix then v_u_common else random() end;
          v_player_outs := v_player_outs ||
            (case when v_u < v_asset_prob then 'good' else 'bad' end);
        end loop;
      else
        v_player_outs := v_outcomes;
      end if;

      -- resulting wealth = safe·(1+rf) + Σ amount_i · multiplier_i
      v_result := v_safe * (1 + v_rf);
      for i in 1..v_n loop
        v_asset_payoff := coalesce(v_assets->(i-1)->>'payoff_mode', v_payoff);
        v_mult := case
          when v_asset_payoff = 'extreme' and v_player_outs[i] = 'good' then 2
          when v_asset_payoff = 'extreme'                              then 0
          when v_player_outs[i] = 'good' then 1.1
          else 0.9
        end;
        v_result := v_result + v_amounts[i] * v_mult;
      end loop;

      if r.alloc_id is null then
        insert into public.allocations (round_id, player_id, risky_amount,
          safe_amount, risky_breakdown, asset_outcomes, resulting_wealth)
        values (v_round.id, r.player_id, v_sum, v_safe, to_jsonb(v_amounts),
          case when v_scope = 'independent' then to_jsonb(v_player_outs) else null end,
          v_result);
      else
        update public.allocations
          set risky_amount    = v_sum,
              safe_amount     = v_safe,
              risky_breakdown = to_jsonb(v_amounts),
              asset_outcomes  = case when v_scope = 'independent'
                                     then to_jsonb(v_player_outs) else null end,
              resulting_wealth = v_result
          where id = r.alloc_id;
      end if;

      update public.players set current_wealth = v_result where id = r.player_id;
    end loop;

    update public.rounds
      set status = 'revealed',
          market_outcome = null,
          market_outcomes = case when v_scope = 'independent'
                                 then null else to_jsonb(v_outcomes) end,
          revealed_at = now()
      where id = v_round.id;
    return;
  end if;

  -- ===========================================================================
  -- BASIC GAME (unchanged from 0010, incl. bot auto-allocation)
  -- ===========================================================================
  if v_market_mode = 'manual' then
    if p_market_override is null or p_market_override not in ('good','bad') then
      raise exception 'manual market requires p_market_override of good or bad';
    end if;
    v_scope := 'shared';
    v_shared_outcome := p_market_override;
  elsif v_scope = 'shared' then
    v_shared_outcome := case when random() < v_good_prob then 'good' else 'bad' end;
  end if;

  for r in
    select p.id as player_id, p.current_wealth, p.is_bot, p.strategy,
           a.id as alloc_id, a.risky_amount
    from public.players p
    left join public.allocations a
      on a.player_id = p.id and a.round_id = v_round.id
    where p.session_id = p_session_id and p.is_active = true
  loop
    -- bots auto-play their fixed strategy; humans use their submission
    if r.is_bot then
      v_frac := case r.strategy
        when 'all_safe'    then 0
        when 'fifty_fifty' then 0.5
        when 'all_risky'   then 1
        when 'edge'        then least(greatest(2 * v_good_prob - 1, 0), 1)
        else 0
      end;
      v_risky := v_frac * r.current_wealth;
    else
      v_risky := coalesce(r.risky_amount, 0);
    end if;
    -- clamp 0 <= risky <= wealth for everyone (non-submitters default to all-safe)
    if v_risky < 0 then v_risky := 0; end if;
    if v_risky > r.current_wealth then v_risky := r.current_wealth; end if;
    v_safe := r.current_wealth - v_risky;

    if v_scope = 'independent' then
      v_outcome := case when random() < v_good_prob then 'good' else 'bad' end;
    else
      v_outcome := v_shared_outcome;
    end if;

    v_mult := case
      when v_payoff = 'extreme' and v_outcome = 'good' then 2
      when v_payoff = 'extreme' and v_outcome = 'bad'  then 0
      when v_outcome = 'good' then 1.1
      else 0.9
    end;
    v_result := v_safe + v_risky * v_mult;

    if r.alloc_id is null then
      insert into public.allocations (round_id, player_id, risky_amount,
        safe_amount, market_outcome, resulting_wealth)
      values (v_round.id, r.player_id, v_risky, v_safe,
        case when v_scope = 'independent' then v_outcome else null end, v_result);
    else
      update public.allocations
        set risky_amount = v_risky,
            safe_amount = v_safe,
            market_outcome = case when v_scope = 'independent' then v_outcome else null end,
            resulting_wealth = v_result
        where id = r.alloc_id;
    end if;

    update public.players set current_wealth = v_result where id = r.player_id;
  end loop;

  update public.rounds
    set status = 'revealed',
        market_outcome = case when v_scope = 'independent' then null else v_shared_outcome end,
        revealed_at = now()
    where id = v_round.id;
end;
$$;

revoke all on function public.resolve_round(uuid, int, text, text[]) from public, anon;
grant execute on function public.resolve_round(uuid, int, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. Client RPCs: signed-in users only (accounts_selftest.sql pins the
-- exact list). Internal helpers: their SECURITY DEFINER callers only.
-- ---------------------------------------------------------------------------
revoke all on function public._trading_config_defaults()                    from public, anon, authenticated;
revoke all on function public._trading_history_years()                      from public, anon, authenticated;
revoke all on function public._trading_period_range(int, text, int)         from public, anon, authenticated;
revoke all on function public._trading_label(int, int)                      from public, anon, authenticated;
revoke all on function public._trading_eligible(int, int, int)              from public, anon, authenticated;
revoke all on function public._trading_index_for(int, int, int)             from public, anon, authenticated;
revoke all on function public._instrument_close(int, int)                   from public, anon, authenticated;
revoke all on function public._session_bars(uuid, int, int, smallint)       from public, anon, authenticated;
revoke all on function public._trading_last_revealed_day(uuid)              from public, anon, authenticated;
revoke all on function public._trading_last_prices(uuid, int)               from public, anon, authenticated;
revoke all on function public._try_timestamptz(text)                        from public, anon, authenticated;
revoke all on function public._resolve_trading(uuid, uuid)                  from public, anon, authenticated;

revoke all on function public.create_trading_session(jsonb, int) from public, anon;
revoke all on function public.extend_round(uuid, int)            from public, anon;
revoke all on function public.place_order(uuid, jsonb)           from public, anon;
revoke all on function public.cancel_order(uuid)                 from public, anon;
revoke all on function public.get_market_snapshot(uuid)          from public, anon;
revoke all on function public.get_price_history(uuid, int, text) from public, anon;
revoke all on function public.get_period_replay(uuid, int)       from public, anon;
revoke all on function public.get_trading_standings(uuid)        from public, anon;
revoke all on function public.get_class_activity(uuid)           from public, anon;
revoke all on function public.get_trading_truth(uuid)            from public, anon;
revoke all on function public.log_behavior_events(uuid, jsonb)   from public, anon;

grant execute on function public.create_trading_session(jsonb, int) to authenticated;
grant execute on function public.extend_round(uuid, int)            to authenticated;
grant execute on function public.place_order(uuid, jsonb)           to authenticated;
grant execute on function public.cancel_order(uuid)                 to authenticated;
grant execute on function public.get_market_snapshot(uuid)          to authenticated;
grant execute on function public.get_price_history(uuid, int, text) to authenticated;
grant execute on function public.get_period_replay(uuid, int)       to authenticated;
grant execute on function public.get_trading_standings(uuid)        to authenticated;
grant execute on function public.get_class_activity(uuid)           to authenticated;
grant execute on function public.get_trading_truth(uuid)            to authenticated;
grant execute on function public.log_behavior_events(uuid, jsonb)   to authenticated;
