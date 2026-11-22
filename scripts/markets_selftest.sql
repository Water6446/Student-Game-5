-- =============================================================================
-- markets_selftest.sql — the paper trading game's security model, proved
-- against EVERY migration (0031-0033 and everything before them).
--
-- Run: npm run test:db -- markets   (scripts/db-selftest.mjs; a fresh PGlite)
--
-- What it proves (docs/PAPER_TRADING.md §9, §11):
--   * no client role reads any reference or secret table, and nothing writes
--     a trading table directly;
--   * every new RPC refuses outsiders, the wrong role, the wrong state;
--   * FUTURE DATA: no RPC returns a single bar past the last revealed day;
--   * IDENTITY: no real ticker, name or year reaches a student before the
--     session is finished; the host can see them through get_trading_truth;
--   * place_order's buying power, reservation and closing-order rules;
--   * the trading branch of resolve_round reveals the period (Phase 2 stub);
--   * RESEARCH (0035): friction settings checked then fixed, balanced
--     per-player arms the student never sees, the cooldown in place_order,
--     nothing kept without consent in research mode, a pseudonymous export.
--
-- All market data here is synthetic: deterministic prices on every weekday of
-- 1984-1991, with "real" tickers RLAA..RLGG and names "Realcorp …" that the
-- identity test looks for.
-- =============================================================================
\set ON_ERROR_STOP on

-- ---- assertion helpers (temp: gone with the throwaway database) -------------
create function pg_temp.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Runs p_sql as the current role and passes only if it raises.
create function pg_temp.denied(p_sql text, p_msg text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS: % (%)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'SECURITY FAIL: %', p_msg;
end $$;

-- ---- identities ---------------------------------------------------------------
insert into auth.users(id, email, is_anonymous) values
  ('d0000000-0000-0000-0000-000000000001', 'trader-host@example.edu', false),
  ('e0000000-0000-0000-0000-000000000001', null, true),   -- Alice
  ('e0000000-0000-0000-0000-000000000002', null, true),   -- Bob
  ('f0000000-0000-0000-0000-000000000003', null, true)    -- outsider
on conflict do nothing;

\set host_jwt     '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}'
\set alice_jwt    '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}'
\set bob_jwt      '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}'
\set outsider_jwt '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}'

-- =============================================================================
-- THE SIMULATED MARKET (0037), as the migration left it
-- =============================================================================
select pg_temp.ok((select count(*) from public.market_instruments where source = 'simulated') = 31
                  and (select count(*) from public.market_instruments
                        where source = 'simulated' and kind = 'index_fund') = 1
                  and not exists (select 1 from public.market_instruments
                                   where source = 'simulated' and license <> 'display-licensed'),
                  'a simulated market of 30 companies and an index fund, ours to show');
select pg_temp.ok(not exists (select 1 from public.market_calendar
                               where day >= public._mkt_day('2100-01-01')
                                 and (extract(isodow from public._mkt_date(day)) > 5
                                      or to_char(public._mkt_date(day), 'MM-DD') in ('01-01', '12-25')))
                  and (select min(day) from public.market_calendar) >= public._mkt_day('2100-01-01'),
                  'it trades on weekdays from 2100 on, apart from real history');
select pg_temp.ok(not exists (
                    select 1 from public.market_bars b
                      join public.market_instruments i on i.id = b.instrument_id and i.source = 'simulated'
                     cross join lateral unnest(b.o, b.h, b.l, b.c) as u(o, h, l, c)
                     where not (u.l <= least(u.o, u.c) and u.h >= greatest(u.o, u.c) and u.l > 0)),
                  'every simulated bar is a sane OHLC bar with positive prices');
select pg_temp.ok((select count(*) from public.market_instruments
                    where source = 'simulated' and delist_type is not null) = 2
                  and (select count(distinct anchor_year) from public.market_universe where anchor_year >= 2100) = 7
                  and (select count(*) from public.market_corporate_actions ca
                         join public.market_instruments i on i.id = ca.instrument_id and i.source = 'simulated') > 100
                  and (select count(*) from public.market_headlines where month >= '2100-01') = 35 * 12
                  and (select count(*) from public.market_rates where day >= public._mkt_day('2100-01-01')) > 9000,
                  'with delistings, a universe every 5 years, dividends, monthly headlines and T-bill rates');
select pg_temp.ok((select count(*) from public.market_name_pool) > 200
                   and (select count(*) from public.market_sectors) = 11,
                  'the fake-name pool came with it');

-- the suite brings its own small pool
delete from public.market_name_pool;
delete from public.market_sectors;

-- =============================================================================
-- SYNTHETIC REFERENCE DATA (as the superuser, like the loader)
-- =============================================================================
insert into public.market_sectors (sector, about) values
  ('Technology', 'Makes computers.'), ('Energy', 'Pumps oil.'), ('Industrials', 'Builds machines.');

insert into public.market_name_pool (ticker, name, kind, sector, about) values
  ('FKAA', 'Fakeco Alpha', 'equity', 'Technology', null),
  ('FKAB', 'Fakeco Beta', 'equity', 'Technology', null),
  ('FKAC', 'Fakeco Gamma', 'equity', 'Technology', null),
  ('FKBA', 'Fakeco Delta', 'equity', 'Energy', null),
  ('FKBB', 'Fakeco Epsilon', 'equity', 'Energy', null),
  ('FKBC', 'Fakeco Zeta', 'equity', 'Energy', null),
  ('FKCA', 'Fakeco Eta', 'equity', 'Industrials', null),
  ('FKCB', 'Fakeco Theta', 'equity', 'Industrials', null),
  ('FKCC', 'Fakeco Iota', 'equity', 'Industrials', null),
  ('FKIX', 'Fakeco Index Fund', 'index_fund', null, 'Holds everything.');

-- 1-6 eligible for a 1990 window; 6 is delisted (bankrupt) inside it; 7 starts
-- too late (1988) to have five years of history; 100 is the index fund.
insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license,
                                       first_day, last_day, delist_type, delist_day, delist_value) values
  (1, 'RLAA', 'equity', 'RLAA', 'Realcorp Alpha', 'Technology', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null),
  (2, 'RLBB', 'equity', 'RLBB', 'Realcorp Bravo', 'Technology', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null),
  (3, 'RLCC', 'equity', 'RLCC', 'Realcorp Charlie', 'Energy', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null),
  (4, 'RLDD', 'equity', 'RLDD', 'Realcorp Delta', 'Energy', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null),
  (5, 'RLEE', 'equity', 'RLEE', 'Realcorp Echo', 'Industrials', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null),
  (6, 'RLFF', 'equity', 'RLFF', 'Realcorp Foxtrot', 'Industrials', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1990-02-15'), 'bankruptcy', public._mkt_day('1990-02-15'), 0),
  (7, 'RLGG', 'equity', 'RLGG', 'Realcorp Golf', 'Technology', 'fixture', 'display-licensed',
     public._mkt_day('1988-01-04'), public._mkt_day('1991-12-31'), null, null, null),
  (100, 'RLIX', 'index_fund', 'RLIX', 'Realcorp Total Market', 'Financials', 'fixture', 'display-licensed',
     public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31'), null, null, null);

-- Every weekday is a trading day here.
insert into public.market_calendar (day)
select public._mkt_day(d::date) from generate_series(date '1984-01-02', date '1991-12-31', interval '1 day') d
 where extract(isodow from d) < 6;

-- Deterministic prices: a gentle trend plus a wave, different per instrument.
insert into public.market_bars (instrument_id, year, days, o, h, l, c)
select i.id, extract(year from x.d)::smallint,
       array_agg((x.d - make_date(extract(year from x.d)::int, 1, 1))::smallint order by x.d),
       array_agg((x.px * 0.995)::real order by x.d),
       array_agg((x.px * 1.010)::real order by x.d),
       array_agg((x.px * 0.990)::real order by x.d),
       array_agg(x.px::real order by x.d)
  from public.market_instruments i
 cross join lateral (
   select g::date as d,
          (4 + i.id % 13) * exp(0.0002 * (g::date - date '1984-01-02')) * (1 + 0.03 * sin((g::date - date '1984-01-02') / 9.0 + i.id)) as px
     from generate_series(public._mkt_date(i.first_day), public._mkt_date(i.last_day), interval '1 day') g
    where extract(isodow from g) < 6
 ) x
 where i.source = 'fixture'
 group by i.id, extract(year from x.d);

insert into public.market_corporate_actions (instrument_id, day, kind, amount) values
  (1, public._mkt_day('1989-02-01'), 'dividend', 0.05),
  (1, public._mkt_day('1989-05-01'), 'dividend', 0.05),
  (1, public._mkt_day('1989-08-01'), 'dividend', 0.05),
  (1, public._mkt_day('1989-11-01'), 'dividend', 0.05);

insert into public.market_rates (day, tbill) values (public._mkt_day('1984-01-02'), 0.08);

insert into public.market_universe (anchor_year, rank, real_name, sector, instrument_id) values
  (1985, 1, 'Realcorp Alpha', 'Technology', 1), (1985, 2, 'Realcorp Bravo', 'Technology', 2),
  (1985, 3, 'Realcorp Charlie', 'Energy', 3), (1985, 4, 'Realcorp Delta', 'Energy', 4),
  (1985, 5, 'Realcorp Echo', 'Industrials', 5), (1985, 6, 'Realcorp Foxtrot', 'Industrials', 6),
  (1990, 1, 'Realcorp Golf', 'Technology', 7), (1990, 2, 'Realcorp Alpha', 'Technology', 1),
  (1990, 3, 'Gone Without History Corp', 'Energy', null), (1990, 4, 'Realcorp Bravo', 'Technology', 2),
  (1990, 5, 'Realcorp Charlie', 'Energy', 3), (1990, 6, 'Realcorp Delta', 'Energy', 4),
  (1990, 7, 'Realcorp Echo', 'Industrials', 5), (1990, 8, 'Realcorp Foxtrot', 'Industrials', 6);

insert into public.market_headlines (month, rank, text) values
  ('1990-01', 1, 'The central bank raises rates to cool inflation'),
  ('1990-03', 1, 'Stocks rally broadly');

-- =============================================================================
-- CREATION
-- =============================================================================
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.denied($$select public.create_trading_session('{}'::jsonb, 1990)$$,
                      'a signed-out caller cannot create a trading session');
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied($$select public.create_trading_session('{"period":"decade"}'::jsonb, 1990)$$,
                      'an unknown period is refused');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":5}'::jsonb, 1950)$$,
                      'a start year before the data is refused');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":60,"period":"year","universe_size":5}'::jsonb, 1990)$$,
                      'a window past the end of the data is refused');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":4}'::jsonb, 1990)$$,
                      'universe_size below 5 is refused');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":5,"spread":0.5}'::jsonb, 1990)$$,
                      'an absurd spread is refused');

select id as sid, join_code, universe_size
  from public.create_trading_session(
    '{"num_rounds":3,"period":"month","universe_size":5,"round_seconds":90,"label":"Trading test",
      "data_source":"spoofed","start_year":1999,"history_years":1}'::jsonb, 1990) \gset
select id as sid_random from public.create_trading_session(
    '{"num_rounds":2,"period":"quarter","universe_size":5}'::jsonb) \gset
select id as sid_cash, join_code as cash_code from public.create_trading_session(
    '{"num_rounds":2,"period":"month","universe_size":5,"margin_enabled":false,"shorting_enabled":false}'::jsonb, 1990) \gset
reset role;
select set_config('app.sid', :'sid', false);
select set_config('app.sid_random', :'sid_random', false);
select set_config('app.sid_cash', :'sid_cash', false);

select pg_temp.ok(:universe_size = 5, 'the host gets the 5 companies asked for');
select pg_temp.ok((select count(*) from public.session_instruments where session_id = :'sid') = 6,
                  'the session trades 5 companies plus the index fund');
select pg_temp.ok((select kind from public.session_instruments where session_id = :'sid' and slot = 0) = 'index_fund',
                  'slot 0 is the index fund');
select pg_temp.ok(not exists (
    select 1 from public.session_instrument_secrets s join public.market_instruments i on i.id = s.instrument_id
     where s.session_id = :'sid' and i.key = 'RLGG'),
  'a company without five years of history is not tradable');
select pg_temp.ok(exists (
    select 1 from public.session_instrument_secrets s join public.market_instruments i on i.id = s.instrument_id
     where s.session_id = :'sid' and i.key = 'RLAA'),
  'the anchor list is walked past the company without data');
select pg_temp.ok(not exists (
    select 1 from public.session_instruments si
     where si.session_id = :'sid'
       and (si.ticker in (select real_ticker from public.market_instruments)
            or si.name in (select real_name from public.market_instruments))),
  'no fake name or ticker is a real one');
select pg_temp.ok(
  (select config->>'game_type' = 'trading' and config->>'data_source' = 'fixture'
          and config->>'data_license' = 'display-licensed' and (config->>'history_years')::int = 5
          and not (config ? 'start_year')
     from public.sessions where id = :'sid'),
  'config is the server''s: game type, data source and history length set, no start year, spoofed keys gone');
select pg_temp.ok((select start_year = 1990 and host_picked_year from public.market_session_secrets where session_id = :'sid'),
                  'the host''s start year is kept only in the secrets table');
select pg_temp.ok((select not host_picked_year and start_year between 1989 and 1991
                     from public.market_session_secrets where session_id = :'sid_random'),
                  'a random era is drawn from the years with enough data');
select pg_temp.ok((
    select bool_and(case when s.slot = 0 then px between 40 and 160 else px between 15 and 250 end)
      from (select s.slot, public._instrument_close(s.instrument_id, public._mkt_day('1989-12-29')) * s.price_scale as px
              from public.session_instrument_secrets s where s.session_id = :'sid') s),
  'every price is rescaled into a believable range at the start of Year 1');

-- =============================================================================
-- JOINING: accounts on join, no bots
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as alice from public.join_session(:'join_code', 'Alice') \gset
select id as alice_cash from public.join_session(:'cash_code', 'Alice') \gset
reset role;
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select id as bob from public.join_session(:'join_code', 'Bob') \gset
reset role;
select set_config('app.alice', :'alice', false);
select set_config('app.bob', :'bob', false);

select pg_temp.ok((select count(*) = 2 and bool_and(cash = 100000 and nlv = 100000)
                     from public.market_accounts where session_id = :'sid'),
                  'each player gets an account with the starting cash on join');

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.add_benchmark_bots(%L)', :'sid'),
                      'benchmark bots are refused in a trading session');
reset role;
select pg_temp.denied(format($$insert into public.players (session_id, display_name, current_wealth, is_bot, strategy)
                               values (%L, 'Bot', 100, true, 'all_safe')$$, :'sid'),
                      'no path can add a bot player to a trading session');

-- =============================================================================
-- NO DIRECT READS of reference or secret data; NO DIRECT WRITES anywhere
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
do $$
declare t text;
begin
  foreach t in array array['market_instruments', 'market_bars', 'market_corporate_actions',
      'market_calendar', 'market_rates', 'market_universe', 'market_headlines', 'market_sectors',
      'market_name_pool', 'market_session_secrets', 'session_instrument_secrets',
      'behavior_events', 'behavior_rate'] loop
    perform pg_temp.denied(format('select 1 from public.%I limit 1', t), 'a student cannot read ' || t);
  end loop;
end $$;
select pg_temp.denied(format($$insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, tif, placed_round)
                               values (%L, %L, 1, 'buy', 'market', 1, 'round', 1)$$, :'sid', :'alice'),
                      'a student cannot insert an order directly');
select pg_temp.denied(format('update public.market_accounts set cash = 1e9 where player_id = %L', :'alice'),
                      'a student cannot change their cash');
select pg_temp.denied(format($$insert into public.market_positions (player_id, session_id, slot, quantity, cost_basis)
                               values (%L, %L, 1, 1000, 0)$$, :'alice', :'sid'),
                      'a student cannot create a position');
select pg_temp.denied(format('delete from public.market_ledger where player_id = %L', :'alice'),
                      'a student cannot delete ledger rows');
select pg_temp.denied(format($$insert into public.session_instruments values (%L, 9, 'equity', 'X', 'XXXX', 'Energy', 'x')$$, :'sid'),
                      'a student cannot add an instrument');
select pg_temp.denied(format($$insert into public.market_period_results (session_id, round_number) values (%L, 9)$$, :'sid'),
                      'a student cannot write a period result');
select pg_temp.ok((select count(*) from public.market_accounts where session_id = current_setting('app.sid')::uuid) = 1
                  and (select bool_and(player_id in (current_setting('app.alice')::uuid,
                                                     (select id from public.players where session_id = current_setting('app.sid_cash')::uuid
                                                         and display_name = 'Alice')))
                         from public.market_accounts),
                  'a student sees only their own accounts');
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
do $$
declare t text;
begin
  foreach t in array array['market_bars', 'market_instruments', 'market_session_secrets',
                           'session_instrument_secrets', 'behavior_events'] loop
    perform pg_temp.denied(format('select 1 from public.%I limit 1', t), 'the host cannot read ' || t);
  end loop;
end $$;
select pg_temp.ok((select count(*) from public.market_accounts where session_id = current_setting('app.sid')::uuid) = 2,
                  'the host sees the class''s accounts');
reset role;

select set_config('request.jwt.claims', :'outsider_jwt', false);
set role authenticated;
select pg_temp.ok((select count(*) from public.session_instruments) = 0
                  and (select count(*) from public.market_accounts) = 0,
                  'an outsider sees no instruments and no accounts');
select pg_temp.denied(format('select public.get_market_snapshot(%L)', :'sid'), 'an outsider cannot read the market board');
select pg_temp.denied(format('select public.get_price_history(%L, 1)', :'sid'), 'an outsider cannot read price history');
select pg_temp.denied(format('select * from public.get_trading_standings(%L)', :'sid'), 'an outsider cannot read the standings');
select pg_temp.denied(format('select public.get_class_activity(%L)', :'sid'), 'an outsider cannot read class activity');
select pg_temp.denied(format('select public.get_trading_truth(%L)', :'sid'), 'an outsider cannot read the truth');
select pg_temp.denied(format($$select public.log_behavior_events(%L, '[{"type":"screen_view"}]')$$, :'sid'),
                      'an outsider cannot log events into a session');
reset role;

-- =============================================================================
-- THE LOBBY: students browse pre-window history only
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.get_market_snapshot(:'sid')::text as snap0 \gset
select pg_temp.ok((public.get_market_snapshot(current_setting('app.sid')::uuid)->'as_of'->>1)::int = -1
                  and (public.get_market_snapshot(current_setting('app.sid')::uuid)->>'change_basis') = 'year',
                  'in the lobby the board stands at the end of Year -1');
select pg_temp.ok(
  (select max((p->>0)::int) < 0 and min((p->>1)::int) = -5
     from jsonb_array_elements(public.get_price_history(current_setting('app.sid')::uuid, 1)) p),
  'lobby history is five pre-window years and nothing from Year 1');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1}')$$, :'sid'),
                      'no orders before the game starts');
reset role;

-- =============================================================================
-- ROUND 1 OPENS: the round clock
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select round_number as r1 from public.start_round(:'sid') \gset
reset role;
select pg_temp.ok((select closes_at between now() + interval '80 seconds' and now() + interval '100 seconds'
                     from public.rounds where session_id = :'sid' and round_number = 1),
                  'a trading round closes 90 seconds after it opens');

-- =============================================================================
-- ORDERS
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as o1, reserved as o1_reserved
  from public.place_order(:'sid', '{"slot":1,"side":"buy","order_type":"market","quantity":10,
                                    "client_ref":"tap-1","context":{"seen_price":1}}') \gset
select set_config('app.o1', :'o1', false);
select pg_temp.ok(
  (select abs(o.reserved - round(10 * (s->>'last')::numeric * (0.5 + 0.001 / 2), 4)) < 0.0001
     from public.market_orders o,
          jsonb_array_elements(public.get_market_snapshot(current_setting('app.sid')::uuid)->'instruments') s
    where o.id = current_setting('app.o1')::uuid and (s->>'slot')::int = 1),
  'a market buy reserves shares x last close x (initial margin + half the spread)');
select pg_temp.ok(
  (select id from public.place_order(current_setting('app.sid')::uuid,
     '{"slot":1,"side":"buy","order_type":"market","quantity":10,"client_ref":"tap-1"}')) = current_setting('app.o1')::uuid
  and (select count(*) from public.market_orders) = 1,
  'a double-tapped submit (same client_ref) returns the first order');
select pg_temp.ok((select context->>'seen_price' = '1' from public.market_orders where id = current_setting('app.o1')::uuid),
                  'the order keeps what the student saw');

-- buying power: margin on, so $100k buys up to ~$200k of stock, minus reserves
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":2,"side":"buy","notional":250000}')$$, :'sid'),
                      'an order beyond buying power is refused');
-- size the next order to leave exactly $50 of buying power (prices are rescaled at random per session)
select round((100000 - reserved - 50) * (1 + 0.001 / 2) / (0.5 + 0.001 / 2), 2) as big_notional
  from public.market_orders where id = :'o1' \gset
select (public.place_order(:'sid', jsonb_build_object('slot', 2, 'side', 'buy',
                                                      'notional', :'big_notional'::numeric))).status as big_status \gset
select pg_temp.ok(:'big_status' = 'open', 'an order inside buying power is accepted');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":3,"side":"buy","notional":1000}')$$, :'sid'),
                      'open orders hold their buying power, so the next one cannot spend it again');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"sell","quantity":1}')$$, :'sid'),
                      'you cannot sell what you do not own');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy_to_cover","quantity":1}')$$, :'sid'),
                      'you cannot cover a short you do not have');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","order_type":"limit","quantity":1}')$$, :'sid'),
                      'a limit order needs a limit price');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","order_type":"stop","quantity":1,"limit_price":5}')$$, :'sid'),
                      'a stop order takes a stop price, not a limit');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","order_type":"limit","notional":100,"limit_price":5}')$$, :'sid'),
                      'dollar amounts are for market orders only');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1,"notional":5}')$$, :'sid'),
                      'shares or dollars, not both');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"hold","quantity":1}')$$, :'sid'),
                      'an unknown side is refused');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":99,"side":"buy","quantity":1}')$$, :'sid'),
                      'an unknown instrument is refused');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":-3}')$$, :'sid'),
                      'a negative quantity is refused');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":"one","side":"buy","quantity":1}')$$, :'sid'),
                      'non-numeric input is refused');
-- a GTC limit buy far below the market reserves at its limit price
select id as o_gtc from public.place_order(:'sid',
  '{"slot":4,"side":"buy","order_type":"limit","quantity":1,"limit_price":1,"tif":"gtc"}') \gset
select pg_temp.ok((select tif = 'gtc' and reserved = round(1 * 1 * (0.5 + 0.0005), 4)
                     from public.market_orders where id = :'o_gtc'),
                  'a limit buy reserves at its limit price and keeps its time in force');
reset role;

-- Bob shorts; the outsider and the host cannot trade
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select pg_temp.ok((public.place_order(current_setting('app.sid')::uuid,
                     '{"slot":2,"side":"sell_short","quantity":5}')).status = 'open',
                  'a short sale is accepted when shorting is on');
select pg_temp.denied(format('select public.cancel_order(%L)', :'o1'), 'nobody can cancel another player''s order');
reset role;
select set_config('request.jwt.claims', :'outsider_jwt', false);
set role authenticated;
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1}')$$, :'sid'),
                      'an outsider cannot trade in a session');
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1}')$$, :'sid'),
                      'the host is not a player and cannot trade');
reset role;

-- cancel releases the reservation
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.ok((select status = 'canceled' and reserved = 0 from public.cancel_order(current_setting('app.o1')::uuid)),
                  'cancelling an order releases its buying power');
select pg_temp.denied(format('select public.cancel_order(%L)', :'o1'), 'an order cannot be cancelled twice');
reset role;

-- the deadline
update public.rounds set closes_at = now() - interval '1 second' where session_id = :'sid' and round_number = 1;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1}')$$, :'sid'),
                      'no orders once time is up');
select pg_temp.denied(format('select public.cancel_order(%L)', :'o_gtc'), 'no cancels once time is up');
select pg_temp.denied(format('select public.extend_round(%L, 30)', :'sid'), 'a student cannot extend the round');
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.ok((public.extend_round(current_setting('app.sid')::uuid, 30)).closes_at > now(),
                  'the host can add time');
select pg_temp.denied(format('select public.extend_round(%L, 5000)', :'sid'), 'an extension is capped');
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.ok((public.place_order(current_setting('app.sid')::uuid,
                     '{"slot":5,"side":"buy","quantity":1}')).status = 'open',
                  'trading resumes after the extension');
-- allocations are not how this game trades
select id as r1_id from public.rounds where session_id = :'sid' and round_number = 1 \gset
select pg_temp.denied(format('select public.submit_allocation(%L, 50)', :'r1_id'),
                      'submit_allocation is refused in a trading session');
reset role;

-- =============================================================================
-- THE BEHAVIOUR LOG
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.ok(public.log_behavior_events(current_setting('app.sid')::uuid,
  '[{"type":"screen_view","ts":"2026-01-01T10:00:00Z","payload":{"screen":"market"}},
    {"type":"instrument_view","payload":{"slot":1}},
    {"type":"ticket_open","ts":"not a time"}]'::jsonb) = 3, 'a batch of events is accepted');
select pg_temp.denied(format($$select public.log_behavior_events(%L, (select jsonb_agg(jsonb_build_object('type','tap')) from generate_series(1,51)))$$, :'sid'),
                      'more than 50 events in one call is refused');
select pg_temp.denied(format($$select public.log_behavior_events(%L, '[{"type":"Bad-Type"}]')$$, :'sid'),
                      'a malformed event type is refused');
select pg_temp.denied(format($$select public.log_behavior_events(%L, '[{"type":"tap","payload":[1,2]}]')$$, :'sid'),
                      'a non-object payload is refused');
select pg_temp.denied(format($$select public.log_behavior_events(%L, jsonb_build_array(jsonb_build_object('type','tap','payload',jsonb_build_object('x', repeat('a', 2100)))))$$, :'sid'),
                      'a payload over 2 KB is refused');
select pg_temp.denied(format($$select public.log_behavior_events(%L, '{"type":"tap"}')$$, :'sid'),
                      'events must come as an array');
do $$
declare i int;
begin
  for i in 1..29 loop  -- 1 call above + 29 = the 30 allowed this minute
    perform public.log_behavior_events(current_setting('app.sid')::uuid, '[{"type":"tap"}]'::jsonb);
  end loop;
end $$;
select pg_temp.denied(format($$select public.log_behavior_events(%L, '[{"type":"tap"}]')$$, :'sid'),
                      'a player is rate-limited past 30 calls a minute');
reset role;
select pg_temp.ok((select count(*) = 32 and bool_and(round_number = 1 and server_ts is not null)
                     and count(client_ts) = 1
                     from public.behavior_events where player_id = :'alice'),
                  'events are stored with the round and the server''s time; a bad client time is dropped');
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied(format($$select public.log_behavior_events(%L, '[{"type":"tap"}]')$$, :'sid'),
                      'the host is not a player and logs no research events');
reset role;

-- =============================================================================
-- ROUND 1 RESOLVES (Phase 2 stub: the period is revealed, nothing fills)
-- =============================================================================
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.resolve_round(%L, 1)', :'sid'), 'a student cannot resolve a round');
select pg_temp.denied(format('select public.get_trading_truth(%L)', :'sid'), 'a student cannot see the truth mid-game');
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'sid', 1)).status as locked \gset
select public.resolve_round(:'sid', 1);
select public.get_trading_truth(:'sid')::text as truth \gset
reset role;
select pg_temp.ok(:'truth'::jsonb->>'start_year' = '1990'
                  and :'truth'::jsonb->'instruments' @> '[{"real_ticker":"RLAA"}]',
                  'the host can see the real era and companies behind the control');

select pg_temp.ok((select status = 'revealed' and market_return is not null
                     from public.rounds where session_id = :'sid' and round_number = 1),
                  'the round is revealed with the index''s return');
select pg_temp.ok((select first_game_day = 0 and last_game_day = 30
                          and headlines @> '[{"y":1,"m":1,"text":"The central bank raises rates to cool inflation"}]'
                          and jsonb_array_length(movers) between 1 and 6
                     from public.market_period_results where session_id = :'sid' and round_number = 1),
                  'period 1 is January of Year 1, with its curated headline in game time');
select pg_temp.ok((select count(*) = 2 and bool_and(a.resulting_wealth = p.current_wealth and p.current_wealth = ma.nlv)
                     from public.allocations a join public.rounds r on r.id = a.round_id
                     join public.players p on p.id = a.player_id
                     join public.market_accounts ma on ma.player_id = p.id
                    where r.session_id = :'sid' and r.round_number = 1),
                  'every player has a per-round wealth record, equal to the account''s value and current_wealth');
select pg_temp.ok((select count(*) filter (where status = 'filled') = 2
                          and count(*) filter (where status = 'canceled') = 1
                          and count(*) filter (where status = 'open' and tif = 'gtc') = 1
                          and count(*) filter (where status = 'open') = 1
                     from public.market_orders where player_id = :'alice'),
                  'round 1 filled Alice''s market orders and kept her good-till-cancelled limit open');
select pg_temp.ok((select reserved > 0 from public.market_orders where id = :'o_gtc')
                  and (select bool_and(reserved = 0) from public.market_orders
                        where player_id = :'alice' and status <> 'open'),
                  'filled and cancelled orders release their buying power; open ones keep it');
select pg_temp.ok((select quantity = -5 from public.market_positions where player_id = :'bob' and slot = 2),
                  'Bob''s short sale filled into a short position');
select pg_temp.ok((select count(*) = 3 from public.market_fills where session_id = :'sid' and round_number = 1)
                  and (select count(*) = 3 from public.market_ledger
                        where session_id = :'sid' and round_number = 1 and kind = 'trade'),
                  'every fill has a ledger row');
select pg_temp.ok((select bool_and(abs(a.nlv - (a.cash + coalesce((
                       select sum(mp.quantity * lp.price) from public.market_positions mp
                         join public._trading_last_prices(:'sid', public._trading_last_revealed_day(:'sid')) lp on lp.slot = mp.slot
                        where mp.player_id = a.player_id), 0))) < 0.01)
                     from public.market_accounts a where a.session_id = :'sid'),
                  'account value = cash + positions at the last revealed close');

-- ---- FUTURE DATA: nothing past the revealed day, from any read -------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.ok((public.get_market_snapshot(current_setting('app.sid')::uuid)->'as_of') = '[30, 1, 1, 31]'::jsonb,
                  'after round 1 the board stands at Year 1 · Jan 31');
do $$
declare v_slot int; v_max int;
begin
  for v_slot in 0..5 loop
    select max((p->>0)::int) into v_max
      from jsonb_array_elements(public.get_price_history(current_setting('app.sid')::uuid, v_slot, 'daily')) p;
    if v_max > 30 then raise exception 'SECURITY FAIL: slot % daily history reaches game day %', v_slot, v_max; end if;
    select max((p->>0)::int) into v_max
      from jsonb_array_elements(public.get_price_history(current_setting('app.sid')::uuid, v_slot, 'weekly')) p;
    if v_max > 30 then raise exception 'SECURITY FAIL: slot % weekly history reaches game day %', v_slot, v_max; end if;
  end loop;
  raise notice 'PASS: no price history reaches past the last revealed day';
end $$;
select pg_temp.ok((select jsonb_array_length(public.get_period_replay(current_setting('app.sid')::uuid, 1)->'days')) = 23,
                  'the revealed period replays all 23 of its trading days');
select pg_temp.denied(format('select public.get_period_replay(%L, 2)', :'sid'), 'an unrevealed period cannot be replayed');
select pg_temp.ok((select count(*) = 2 and bool_and(t.nlv = p.current_wealth)
                     from public.get_trading_standings(current_setting('app.sid')::uuid) t
                     join public.players p on p.id = t.player_id),
                  'the standings list the class by account value');
select pg_temp.ok((public.get_class_activity(current_setting('app.sid')::uuid)->>'players')::int = 2,
                  'class activity is aggregates only');

-- ---- IDENTITY: no real ticker, name or year reaches a student -------------
select concat_ws(' ',
    (select jsonb_agg(to_jsonb(s))::text from public.sessions s),
    (select jsonb_agg(to_jsonb(i))::text from public.session_instruments i),
    (select jsonb_agg(to_jsonb(r))::text from public.rounds r),
    (select jsonb_agg(to_jsonb(p))::text from public.market_period_results p),
    (select jsonb_agg(to_jsonb(o))::text from public.market_orders o),
    (select jsonb_agg(to_jsonb(a))::text from public.market_accounts a),
    (select jsonb_agg(to_jsonb(f))::text from public.market_fills f),
    (select jsonb_agg(to_jsonb(x))::text from public.market_positions x),
    (select jsonb_agg(to_jsonb(l))::text from public.market_ledger l),
    (select jsonb_agg(to_jsonb(ar))::text from public.market_account_rounds ar),
    public.get_market_snapshot(current_setting('app.sid')::uuid)::text,
    (select string_agg(public.get_price_history(current_setting('app.sid')::uuid, g, 'daily')::text, ' ')
       from generate_series(0, 5) g),
    public.get_period_replay(current_setting('app.sid')::uuid, 1)::text,
    (select jsonb_agg(to_jsonb(t))::text from public.get_trading_standings(current_setting('app.sid')::uuid) t),
    public.get_class_activity(current_setting('app.sid')::uuid)::text) as seen \gset
reset role;
select set_config('app.seen', :'seen', false);
do $$
declare
  v_seen text := regexp_replace(current_setting('app.seen'),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '', 'g');
  v_hit text;
begin
  select string_agg(x, ', ') into v_hit
    from (select real_ticker as x from public.market_instruments
          union select real_name from public.market_instruments
          union select 'Realcorp') w
   where position(x in v_seen) > 0;
  if v_hit is not null then raise exception 'SECURITY FAIL: a student can see %', v_hit; end if;
  -- a real year would leak as a date ("1990-01-31") or a whole JSON number
  -- ("y": 1990); a price's decimals ("21.1989") are neither
  if v_seen ~ '(198[4-9]|199[01])-[01][0-9]' or v_seen ~ '(^|[\[,:\s])(198[4-9]|199[01])($|[\],}\s])' then
    raise exception 'SECURITY FAIL: a real year reaches a student: %',
      substring(v_seen from '.{0,40}(?:(?:198[4-9]|199[01])-[01][0-9]|[\[,:\s](?:198[4-9]|199[01])[\],}\s]).{0,40}');
  end if;
  -- and the check itself must be able to fail
  if not ('{"y": 1990}' ~ '(^|[\[,:\s])(198[4-9]|199[01])($|[\],}\s])'
          and '"1990-01-31"' ~ '(198[4-9]|199[01])-[01][0-9]'
          and '[21.1989, 199000]' !~ '(^|[\[,:\s])(198[4-9]|199[01])($|[\],}\s])') then
    raise exception 'FAIL: the year detector is broken';
  end if;
  raise notice 'PASS: no real ticker, name or year reaches a student before the end';
end $$;

-- =============================================================================
-- A CASH ACCOUNT: margin and shorting off
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.start_round(:'sid_cash')).round_number as rc1 \gset
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"sell_short","quantity":1}')$$, :'sid_cash'),
                      'short selling is refused when the host turned it off');
select reserved as cash_reserved from public.place_order(:'sid_cash', '{"slot":1,"side":"buy","notional":99000}') \gset
select pg_temp.ok(:cash_reserved between 98999 and 99001, 'without margin a dollar buy reserves its full cost');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":2,"side":"buy","notional":2000}')$$, :'sid_cash'),
                      'without margin the cash runs out at the account''s value');
reset role;

-- =============================================================================
-- TO THE END: rounds 2-3, GTC orders persist, then the finish
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.next_round(:'sid')).round_number as r2 \gset
select (public.lock_round(:'sid', 2)).status as l2 \gset
select public.resolve_round(:'sid', 2);
select (public.next_round(:'sid')).round_number as r3 \gset
select (public.lock_round(:'sid', 3)).status as l3 \gset
select public.resolve_round(:'sid', 3);
reset role;
select pg_temp.ok((select status = 'open' from public.market_orders where id = :'o_gtc'),
                  'a good-till-cancelled order survives into later rounds');
select pg_temp.ok((select last_game_day from public.market_period_results where session_id = :'sid' and round_number = 3)
                  = (select max(day) from public.market_calendar where day <= public._mkt_day('1990-03-31'))
                    - public._mkt_day('1990-01-01'),
                  'the last period ends on the last trading day of March');

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.get_trading_truth(%L)', :'sid'), 'the truth stays hidden until the finish');
select pg_temp.denied(format('select public.get_trading_reveal(%L)', :'sid'), 'a student cannot open the reveal mid-game');
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.get_trading_reveal(%L)', :'sid'), 'nor can the host: the reveal is the finale');
select (public.finish_session(:'sid')).status as fin \gset
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.ok(public.get_trading_truth(current_setting('app.sid')::uuid)->>'start_year' = '1990',
                  'students see the real era once the game is finished');
select pg_temp.denied(format($$select public.place_order(%L, '{"slot":1,"side":"buy","quantity":1}')$$, :'sid'),
                      'no orders after the finish');
do $$
declare v_max int;
begin
  select max((p->>0)::int) into v_max
    from jsonb_array_elements(public.get_price_history(current_setting('app.sid')::uuid, 1)) p;
  if v_max > (select last_game_day from public.market_period_results
               where session_id = current_setting('app.sid')::uuid and round_number = 3) then
    raise exception 'SECURITY FAIL: history after the finish runs past the last period';
  end if;
  raise notice 'PASS: even after the finish, history stops at the last played day';
end $$;
reset role;

-- =============================================================================
-- THE REVEAL (0036): finished only; own fills; an anonymous class for students
-- =============================================================================
select set_config('request.jwt.claims', :'outsider_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.get_trading_reveal(%L)', :'sid'), 'an outsider cannot open the reveal');
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.get_trading_reveal(:'sid')::text as rev_a \gset
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.get_trading_reveal(:'sid')::text as rev_h \gset
reset role;
select id as alice_pid from public.players
 where session_id = :'sid' and auth_uid = 'e0000000-0000-0000-0000-000000000001' \gset

select pg_temp.ok((:'rev_a'::jsonb)->>'start_year' = '1990'
                  and (:'rev_a'::jsonb)->>'window_first_date' like '1990-01-%',
                  'the reveal names the real era');
select pg_temp.ok(jsonb_array_length((:'rev_a'::jsonb)->'instruments')
                    = (select count(*) from public.session_instruments where session_id = :'sid')
                  and not exists (select 1 from jsonb_array_elements((:'rev_a'::jsonb)->'instruments') i
                                   where i->>'real_name' is null or i->>'name' is null),
                  'every fake name is shown beside its real company');
select pg_temp.ok(jsonb_array_length((:'rev_a'::jsonb)->'periods') = 3
                  and (:'rev_a'::jsonb)->'periods'->0->>'first_date' like '1990-01-%'
                  and (:'rev_a'::jsonb)->'periods'->2->>'last_date' like '1990-03-%'
                  and (:'rev_a'::jsonb)->>'played_last_date' = (:'rev_a'::jsonb)->'periods'->2->>'last_date',
                  'each played period carries its real dates');
select pg_temp.ok(jsonb_array_length((:'rev_a'::jsonb)->'my_fills')
                    = (select count(*) from public.market_fills where player_id = :'alice_pid')
                  and jsonb_array_length((:'rev_a'::jsonb)->'my_fills') > 0,
                  'a student gets every one of their own fills');
select pg_temp.ok(not exists (
                    select 1 from jsonb_array_elements((:'rev_a'::jsonb)->'my_fills') f
                     where (f->>'date')::date <> date '1990-01-01'
                             + (select g.game_day from public.market_fills g
                                 where g.player_id = :'alice_pid' and g.round_number = (f->>'round')::int
                                   and g.slot = (f->>'slot')::int and g.price = (f->>'price')::numeric
                                 limit 1)
                        or (f->>'date')::date > ((:'rev_a'::jsonb)->>'played_last_date')::date),
                  'each fill is dated on the real calendar, inside the played window');
select pg_temp.ok((select count(*) from jsonb_array_elements((:'rev_a'::jsonb)->'class') c
                    where (c->>'is_me')::boolean) = 1
                  and not exists (select 1 from jsonb_array_elements((:'rev_a'::jsonb)->'class') c
                                   where c->>'player_id' is not null
                                      or (c->>'name' is not null and not (c->>'is_me')::boolean)),
                  'a student sees the class without names or ids, their own row marked');
select pg_temp.ok(jsonb_array_length((:'rev_h'::jsonb)->'my_fills') = 0
                  and not exists (select 1 from jsonb_array_elements((:'rev_h'::jsonb)->'class') c
                                   where c->>'player_id' is null or c->>'name' is null),
                  'the host sees every name in the class and has no fills of their own');
-- turnover: half the dollars traded over the rounds' average starting value, per year
select pg_temp.ok(abs(((select c->>'turnover' from jsonb_array_elements((:'rev_h'::jsonb)->'class') c
                         where c->>'player_id' = :'alice_pid'))::numeric
                      - (select sum(traded) / 2 / avg(nlv_start)
                                / (count(*) / (select case config->>'period' when 'year' then 1 when 'half' then 2
                                                when 'quarter' then 4 when 'month' then 12 else 52 end::numeric
                                                from public.sessions where id = :'sid'))
                           from public.market_account_rounds where player_id = :'alice_pid')) < 1e-5,
                  'turnover is half the traded dollars over the average value, per year');
select pg_temp.ok(abs(((:'rev_h'::jsonb)->>'index_return')::numeric
                      - (select exp(sum(ln(1 + index_return))) - 1 from public.market_period_results
                          where session_id = :'sid')) < 1e-5,
                  'the index fund''s buy-and-hold return compounds the periods');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements((:'rev_h'::jsonb)->'instruments') i
                               where i->>'price_change' is not null
                                 and abs((i->>'price_change')::numeric) > 5),
                  'each company''s price change over the game is a sane ratio');

-- =============================================================================
-- THE SIMULATED MARKET IN PLAY (0037): the host's choice of data
-- =============================================================================
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.denied('select public.get_market_data_options()', 'anon cannot ask which data is loaded');
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.ok(public.get_market_data_options() = '{"historical": true, "simulated": true}'::jsonb,
                  'the setup form learns both markets are loaded');
select pg_temp.ok((select config->>'market_data' from public.sessions where id = :'sid') = 'historical',
                  'with real history loaded, a game that does not say plays it');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":5,"market_data":"simulated"}'::jsonb, 2110)$$,
                      'a simulated market has no era to pick');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":5,"market_data":"crypto"}'::jsonb)$$,
                      'market_data must be historical or simulated');
select pg_temp.denied($$select public.create_trading_session('{"num_rounds":3,"period":"month","universe_size":5,"market_data":"historical"}'::jsonb, 2110)$$,
                      'a real-history game cannot start in the simulated years');
select id as sim_sid, join_code as sim_code, universe_size as sim_n from public.create_trading_session(
    '{"num_rounds":2,"period":"quarter","universe_size":8,"market_data":"simulated"}'::jsonb) \gset
reset role;
select pg_temp.ok(:sim_n = 8
                  and (select config->>'market_data' = 'simulated' and config->>'data_source' = 'simulated'
                              and config->>'data_license' = 'display-licensed'
                         from public.sessions where id = :'sim_sid')
                  and (select start_year >= 2105 and data_source = 'simulated'
                         from public.market_session_secrets where session_id = :'sim_sid')
                  and not exists (select 1 from public.session_instrument_secrets s
                                    join public.market_instruments i on i.id = s.instrument_id
                                   where s.session_id = :'sim_sid' and i.source <> 'simulated'),
                  'a simulated game trades simulated companies in a simulated era, no dev banner');
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as sim_alice from public.join_session(:'sim_code', 'Alice') \gset
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.start_round(:'sim_sid')).round_number as sim_r1 \gset
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select (public.place_order(:'sim_sid', '{"slot":0,"side":"buy","order_type":"market","notional":50000}'::jsonb)).status as sim_ord \gset
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'sim_sid', 1)).status as sim_locked \gset
select public.resolve_round(:'sim_sid', 1);
reset role;
select pg_temp.ok((select status from public.rounds where session_id = :'sim_sid' and round_number = 1) = 'revealed'
                  and (select index_return is not null and jsonb_array_length(headlines) = 3
                         from public.market_period_results where session_id = :'sim_sid' and round_number = 1)
                  and (select count(*) from public.market_fills f
                         join public.players p on p.id = f.player_id
                        where p.session_id = :'sim_sid') = 1
                  and (select abs(nlv - 100000) < 30000 from public.market_accounts a
                         join public.players p on p.id = a.player_id
                        where p.session_id = :'sim_sid'),
                  'a simulated quarter resolves: the order fills, the index moves, three monthly headlines');

-- =============================================================================
-- DELETE cascades through every trading table
-- =============================================================================
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select public.delete_session(:'sid');
reset role;
select pg_temp.ok(
  (select count(*) from public.session_instruments where session_id = :'sid') = 0
  and (select count(*) from public.session_instrument_secrets where session_id = :'sid') = 0
  and (select count(*) from public.market_session_secrets where session_id = :'sid') = 0
  and (select count(*) from public.market_orders where session_id = :'sid') = 0
  and (select count(*) from public.market_accounts where session_id = :'sid') = 0
  and (select count(*) from public.behavior_events where session_id = :'sid') = 0
  and (select count(*) from public.market_period_results where session_id = :'sid') = 0,
  'deleting a session removes all of its trading rows');
select pg_temp.ok((select count(*) from public.market_bars) > 0, 'reference data survives a session delete');

-- =============================================================================
-- THE GOLDEN SCENARIO — the same session, orders and numbers as
-- lib/markets/trading/__fixtures__/golden.ts and engine.test.ts. If a rule
-- changes, both sides change together.
-- Two instruments at price scale 1; spread 0.2%, $1 commission, 1%/yr borrow
-- fee, margin loans at T-bill (8%) + 5%; Jan and Feb 1990 as rounds 1 and 2.
-- Orders are inserted directly (this block tests the engine, not place_order).
-- Carol rides along to hold a company that goes bankrupt on 1990-02-15.
-- =============================================================================
insert into auth.users(id, email, is_anonymous) values
  ('e0000000-0000-0000-0000-000000000003', null, true) on conflict do nothing;
\set carol_jwt '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}'

insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license, first_day, last_day) values
  (201, 'GLD1', 'equity', 'GLDA', 'Golden One', 'Technology', 'fixture', 'display-licensed',
     public._mkt_day('1989-12-29'), public._mkt_day('1990-02-20')),
  (202, 'GLD2', 'equity', 'GLDB', 'Golden Two', 'Energy', 'fixture', 'display-licensed',
     public._mkt_day('1989-12-29'), public._mkt_day('1990-01-25'));
insert into public.market_bars (instrument_id, year, days, o, h, l, c)
select v.inst, extract(year from v.d)::smallint,
       array_agg((v.d - make_date(extract(year from v.d)::int, 1, 1))::smallint order by v.d),
       array_agg(v.o::real order by v.d), array_agg(v.h::real order by v.d),
       array_agg(v.l::real order by v.d), array_agg(v.c::real order by v.d)
  from (values
    (201, date '1989-12-29', 50, 50, 50, 50),
    (201, date '1990-01-02', 50.2, 50.6, 49.9, 50.4),
    (201, date '1990-01-03', 50.9, 51.8, 50.7, 51.6),
    (201, date '1990-01-10', 51, 51.2, 50.5, 50.9),
    (201, date '1990-01-15', 47, 47.5, 46.5, 47.2),
    (201, date '1990-02-05', 46, 46.5, 45, 45.5),
    (201, date '1990-02-12', 35, 36, 33, 34),
    (201, date '1990-02-20', 19, 19.5, 17.5, 18),
    (202, date '1989-12-29', 20, 20, 20, 20),
    (202, date '1990-01-02', 20.1, 20.3, 19.9, 20.2),
    (202, date '1990-01-22', 20.5, 20.6, 20.4, 20.5),
    (202, date '1990-01-25', 21, 22, 20.8, 21.5)
  ) v(inst, d, o, h, l, c)
 group by v.inst, extract(year from v.d);
insert into public.market_corporate_actions (instrument_id, day, kind, amount) values
  (201, public._mkt_day('1990-01-10'), 'dividend', 0.5),
  (202, public._mkt_day('1990-01-22'), 'dividend', 0.1);

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as gold, join_code as gold_code from public.create_trading_session(
  '{"num_rounds":2,"period":"month","universe_size":5,"spread":0.002,"commission":1,
    "borrow_fee":0.01,"borrow_spread":0.05}'::jsonb, 1990) \gset
reset role;
update public.session_instrument_secrets set instrument_id = 201, price_scale = 1 where session_id = :'gold' and slot = 1;
update public.session_instrument_secrets set instrument_id = 202, price_scale = 1 where session_id = :'gold' and slot = 2;
update public.session_instrument_secrets set instrument_id = 6,   price_scale = 1 where session_id = :'gold' and slot = 3;

select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as ga from public.join_session(:'gold_code', 'Alice') \gset
reset role;
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select id as gb from public.join_session(:'gold_code', 'Bob') \gset
reset role;
select set_config('request.jwt.claims', :'carol_jwt', false);
set role authenticated;
select id as gc from public.join_session(:'gold_code', 'Carol') \gset
reset role;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.start_round(:'gold')).round_number as g1 \gset
reset role;
insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, limit_price, stop_price,
                                  tif, placed_round, placed_at, client_ref)
values
  (:'gold', :'ga', 1, 'buy',          'market',     100, null, null, 'round', 1, now() - interval '60 seconds', 'a1'),
  (:'gold', :'ga', 2, 'sell_short',   'market',      50, null, null, 'round', 1, now() - interval '59 seconds', 'a2'),
  (:'gold', :'ga', 1, 'sell',         'stop',       100, null,   48, 'gtc',   1, now() - interval '58 seconds', 'a3'),
  (:'gold', :'ga', 2, 'buy_to_cover', 'limit',       50,   19, null, 'round', 1, now() - interval '57 seconds', 'a4'),
  (:'gold', :'ga', 1, 'buy',          'limit',       10,   40, null, 'round', 1, now() - interval '56 seconds', 'a5'),
  (:'gold', :'ga', 1, 'buy',          'stop_limit',  20, 51.5,   51, 'round', 1, now() - interval '55 seconds', 'a6'),
  (:'gold', :'gc', 3, 'buy',          'market',      10, null, null, 'round', 1, now() - interval '54 seconds', 'c1'),
  (:'gold', :'gc', 3, 'sell',         'limit',       10, 1000, null, 'gtc',   1, now() - interval '53 seconds', 'c2');

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'gold', 1)).status as gl1 \gset
select public.resolve_round(:'gold', 1);
reset role;

select set_config('app.gold', :'gold', false);
select set_config('app.ga', :'ga', false);
select set_config('app.gb', :'gb', false);
select set_config('app.gc', :'gc', false);
create function pg_temp.near(p_got numeric, p_want numeric, p_tol numeric default 0.001) returns boolean
language sql as $$ select p_got is not null and abs(p_got - p_want) <= p_tol $$;
create function pg_temp.ledger_sum(p_player uuid, p_round int, p_kind text) returns numeric
language sql as $$ select coalesce(sum(amount), 0) from public.market_ledger
                    where player_id = p_player and round_number = p_round and kind = p_kind $$;

select pg_temp.ok((select string_agg(client_ref || ':' || status, ',' order by placed_at)
                     from public.market_orders where player_id = :'ga')
                  = 'a1:filled,a2:filled,a3:filled,a4:expired,a5:expired,a6:filled',
                  'GOLDEN r1: market, gapped stop and stop-limit fill; the unreached limits expire');
select pg_temp.ok((select count(*) from public.market_fills f join public.market_orders o on o.id = f.order_id
                    where f.player_id = :'ga' and (o.client_ref, f.side, f.quantity, f.price) in (
                      ('a1', 'buy', 100, 50.05), ('a2', 'sell_short', 50, 19.98),
                      ('a6', 'buy', 20, 51), ('a3', 'sell', 100, 46.953))) = 4,
                  'GOLDEN r1: fill prices (a gap through the stop fills at the open less half the spread)');
select pg_temp.ok((select triggered from public.market_orders where player_id = :'ga' and client_ref = 'a6'),
                  'GOLDEN r1: the stop-limit is recorded as triggered');
select pg_temp.ok(pg_temp.ledger_sum(:'ga', 1, 'dividend') = 55 and pg_temp.ledger_sum(:'ga', 1, 'commission') = -4
                  and pg_temp.near(pg_temp.ledger_sum(:'ga', 1, 'interest'), 702.579313)
                  and pg_temp.near(pg_temp.ledger_sum(:'ga', 1, 'borrow_fee'), -0.926847),
                  'GOLDEN r1: dividends (+60 long, -5 short), commissions, interest and the borrow fee');
select pg_temp.ok((select pg_temp.near(cash, 100421.952466) and pg_temp.near(nlv, 100290.952466)
                     from public.market_accounts where player_id = :'ga'),
                  'GOLDEN r1: Alice''s cash and account value');
select pg_temp.ok((select quantity = 20 and pg_temp.near(cost_basis, 1004.166667) and pg_temp.near(realized_pnl, -325.533333)
                     from public.market_positions where player_id = :'ga' and slot = 1)
                  and (select quantity = -50 and cost_basis = -999 from public.market_positions where player_id = :'ga' and slot = 2),
                  'GOLDEN r1: positions at average cost, with the realized loss on the stop');
select pg_temp.ok((select a.risky_amount = 6000 from public.allocations a join public.rounds r on r.id = a.round_id
                    where a.player_id = :'ga' and r.round_number = 1)
                  and (select pg_temp.near(traded, 11719.3) and cardinality(daily_nlv) = 23
                         from public.market_account_rounds where player_id = :'ga' and round_number = 1),
                  'GOLDEN r1: exposure after the market orders, dollars traded, a value for each of 23 days');
select pg_temp.ok((select pg_temp.near(nlv, 100725.757346) from public.market_accounts where player_id = :'gb')
                  and (select pg_temp.near(rf_return, 0.0072575735, 0.0000000001)
                         from public.market_period_results where session_id = :'gold' and round_number = 1),
                  'GOLDEN r1: an all-cash account earns the T-bill, compounded daily');

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.next_round(:'gold')).round_number as g2 \gset
reset role;
insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, tif, placed_round,
                                  placed_at, client_ref)
values
  (:'gold', :'ga', 2, 'buy_to_cover', 'market',   50, 'round', 2, now() - interval '30 seconds', 'b1'),
  (:'gold', :'ga', 1, 'buy',          'market', 3000, 'round', 2, now() - interval '29 seconds', 'b2');
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'gold', 2)).status as gl2 \gset
select public.resolve_round(:'gold', 2);
reset role;

select pg_temp.ok((select count(*) from public.market_fills f left join public.market_orders o on o.id = f.order_id
                    where f.player_id = :'ga' and f.round_number = 2 and (coalesce(o.client_ref, f.reason), f.side, f.quantity, f.price) in (
                      ('b1', 'buy_to_cover', 50, 21.5215), ('b2', 'buy', 3000, 47.2472),
                      ('margin_call', 'sell', 3020, 17.982))) = 3,
                  'GOLDEN r2: cover, a 2x levered buy, and a margin call that sells everything at the close');
select pg_temp.ok(pg_temp.near(pg_temp.ledger_sum(:'ga', 2, 'margin_interest'), -302.986531)
                  and pg_temp.near(pg_temp.ledger_sum(:'ga', 2, 'interest'), 20.360559)
                  and pg_temp.near(pg_temp.ledger_sum(:'ga', 2, 'forced_liquidation'), 54305.64),
                  'GOLDEN r2: margin interest on the loan and the forced sale''s proceeds');
select pg_temp.ok((select pg_temp.near(nlv, 11624.291494) and pg_temp.near(max_drawdown, 0.884444, 0.000001)
                          and not frozen and pg_temp.near(sharpe, -3.498106, 0.0001)
                     from public.market_accounts where player_id = :'ga')
                  and (select current_wealth = (select nlv from public.market_accounts where player_id = :'ga')
                         from public.players where id = :'ga'),
                  'GOLDEN r2: account value, drawdown and annualized Sharpe; current_wealth agrees');
select pg_temp.ok((select pg_temp.near(nlv, 101345.684085) and sharpe is null
                     from public.market_accounts where player_id = :'gb'),
                  'GOLDEN r2: the all-cash account has no Sharpe (it took no risk)');

-- ---- a bankruptcy: Carol's company stops trading on 1990-02-15 --------------
select pg_temp.ok((select count(*) = 1 from public.market_fills
                    where player_id = :'gc' and reason = 'delisting' and price = 0 and quantity = 10 and slot = 3),
                  'a bankruptcy settles the position at its recovery value (0)');
select pg_temp.ok((select status = 'canceled' and reject_reason = 'the company stopped trading' and reserved = 0
                     from public.market_orders where player_id = :'gc' and client_ref = 'c2'),
                  'open orders on a delisted company are cancelled');
select pg_temp.ok((select quantity = 0 and realized_pnl < 0 from public.market_positions where player_id = :'gc' and slot = 3),
                  'the write-off is a realized loss');
select set_config('request.jwt.claims', :'carol_jwt', false);
set role authenticated;
select pg_temp.ok((select bool_or(i->>'delisted' = 'true' and (i->>'slot')::int = 3)
                     from jsonb_array_elements(public.get_market_snapshot(current_setting('app.gold')::uuid)->'instruments') i),
                  'the market board marks the company as no longer trading');
reset role;

-- =============================================================================
-- RESEARCH (0035): friction settings and per-player arms, the cooldown,
-- consent, and the host's export
-- =============================================================================
-- Passes only if p_sql raises an error whose message is LIKE p_like.
create function pg_temp.refused_with(p_sql text, p_like text, p_msg text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then
      raise notice 'PASS: % (%)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % (refused for the wrong reason: %)', p_msg, sqlerrm;
  end;
  raise exception 'SECURITY FAIL: %', p_msg;
end $$;

insert into auth.users(id, email, is_anonymous) values
  ('e0000000-0000-0000-0000-000000000004', null, true) on conflict do nothing;
\set dave_jwt '{"sub":"e0000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":true}'

-- ---- the presets: the same literal lib/research/friction.test.ts asserts ----
select pg_temp.ok(public._friction_preset('high') =
  '{"one_tap_buy": false, "amount_chips": false, "review_step": true, "typed_confirmation": true,
    "cooldown_seconds": 30, "risk_disclosure": true, "celebrate_fills": false, "show_movers": false,
    "show_class_popular": false}'::jsonb,
  'the high-friction preset matches the TypeScript one');
select pg_temp.ok(public._friction_preset('nonsense') = public._friction_preset('standard'),
                  'an unknown profile reads as standard');

-- ---- the friction settings are checked when a session is made -------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_overrides":{"pop_up":true}}'::jsonb, 1990)$$,
  'unknown friction knob: pop_up', 'an unknown friction knob is refused');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_overrides":{"cooldown_seconds":301}}'::jsonb, 1990)$$,
  'cooldown_seconds must be a whole number%', 'a cooldown over 300 s is refused');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_overrides":{"cooldown_seconds":2.5}}'::jsonb, 1990)$$,
  'cooldown_seconds must be a whole number%', 'a fractional cooldown is refused');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_overrides":{"review_step":"yes"}}'::jsonb, 1990)$$,
  'friction knob review_step must be true or false', 'a knob of the wrong type is refused');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_assignment":"per_player","friction_arms":["low"]}'::jsonb, 1990)$$,
  'friction_arms must list%', 'a per-player session needs two or three arms');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_arms":["low","low"]}'::jsonb, 1990)$$,
  'friction_arms must list%', 'the same arm twice is refused');
select pg_temp.refused_with($$select public.create_trading_session('{"num_rounds":2,"period":"month","universe_size":5,"friction_assignment":"per_class"}'::jsonb, 1990)$$,
  'friction_assignment must be session or per_player', 'an unknown assignment is refused');

select id as rx, join_code as rx_code from public.create_trading_session(
  '{"num_rounds":2,"period":"month","universe_size":5,"research_mode":true,"label":"Study A",
    "friction_assignment":"per_player","friction_arms":["low","high"],
    "friction_overrides":{"celebrate_fills":false}}'::jsonb, 1990) \gset
select public.set_session_label(:'rx', 'Study A, section 2');
reset role;
select set_config('app.rx', :'rx', false);
select pg_temp.ok((select config->'friction_overrides' = '{"celebrate_fills": false}'::jsonb
                          and config->>'friction_assignment' = 'per_player'
                          and config->'friction_arms' = '["low", "high"]'::jsonb
                          and config->>'label' = 'Study A, section 2'
                     from public.sessions where id = :'rx'),
                  'the friction setup is stored with the session, and the label can still change');
select pg_temp.refused_with(format($$update public.sessions set config = config || '{"friction_profile":"low"}' where id = %L$$, :'rx'),
  'friction and research settings are fixed%', 'the friction profile cannot change once the session exists');
select pg_temp.refused_with(format($$update public.sessions set config = config || '{"research_mode":false}' where id = %L$$, :'rx'),
  'friction and research settings are fixed%', 'research mode cannot be switched off mid-study');
select pg_temp.refused_with(format($$update public.sessions set config = config - 'friction_overrides' where id = %L$$, :'rx'),
  'friction and research settings are fixed%', 'the overrides cannot be dropped mid-study');

-- ---- four students join: balanced across the two arms ----------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select id as rx_a from public.join_session(:'rx_code', 'Alice') \gset
select id as rx_a2 from public.join_session(:'rx_code', 'Alice again') \gset
reset role;
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select id as rx_b from public.join_session(:'rx_code', 'Bob') \gset
reset role;
select set_config('request.jwt.claims', :'carol_jwt', false);
set role authenticated;
select id as rx_c from public.join_session(:'rx_code', 'Carol') \gset
reset role;
select set_config('request.jwt.claims', :'dave_jwt', false);
set role authenticated;
select id as rx_d from public.join_session(:'rx_code', 'Dave') \gset
reset role;
select pg_temp.ok(:'rx_a' = :'rx_a2', 'joining again is the same player');
select pg_temp.ok((select count(*) = 4 and count(*) filter (where arm = 'low') = 2
                          and count(*) filter (where arm = 'high') = 2
                     from public.player_conditions where session_id = :'rx'),
                  'per-player assignment balances the arms: two low, two high');
select pg_temp.ok((select count(*) = 0 from public.player_conditions where session_id = :'sid_cash'),
                  'a one-profile session assigns no arms');

-- ---- what a student sees, and does not ------------------------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.denied('select * from public.player_conditions', 'a student cannot read the friction assignments');
select pg_temp.denied('select * from public.research_consents', 'a student cannot read consent records');
select pg_temp.denied(format('select public.get_session_conditions(%L)', :'rx'), 'a student cannot see the arms');
select pg_temp.denied(format('select public.export_research_data(%L)', :'rx'), 'a student cannot export research data');
select public.get_my_conditions(:'rx')::text as a_cond \gset
reset role;
select pg_temp.ok(strpos(:'a_cond', '"low"') = 0 and strpos(:'a_cond', '"high"') = 0 and not (:'a_cond'::jsonb ? 'arm'),
                  'get_my_conditions gives the knobs, never the arm''s name');
select pg_temp.ok((:'a_cond'::jsonb->'knobs') = public._friction_preset(
                     (select arm from public.player_conditions where player_id = :'rx_a')) || '{"celebrate_fills": false}'::jsonb,
                  'a student''s knobs are their arm''s preset with the session''s overrides on top');
select pg_temp.ok((:'a_cond'::jsonb->>'research_mode') = 'true' and (:'a_cond'::jsonb->'consent') = 'null'::jsonb,
                  'research mode is on and Alice has not answered yet');
select set_config('request.jwt.claims', :'outsider_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.get_my_conditions(%L)', :'rx'), 'an outsider has no conditions');
select pg_temp.denied(format('select public.record_consent(%L, true, %L)', :'rx', 'v1'), 'an outsider cannot consent');
reset role;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select pg_temp.denied(format('select public.get_my_conditions(%L)', :'rx'), 'the host is not a player and has no conditions');
select pg_temp.denied(format('select public.record_consent(%L, true, %L)', :'rx', 'v1'), 'the host cannot consent for anyone');
select public.get_session_conditions(:'rx')::text as rx_cond \gset
reset role;
select pg_temp.ok((select bool_and((c->>'players')::int = 2) and count(*) = 2
                     from jsonb_array_elements(:'rx_cond'::jsonb->'arm_counts') c)
                  and jsonb_array_length(:'rx_cond'::jsonb->'players') = 4
                  and (:'rx_cond'::jsonb #>> '{consent,undecided}')::int = 4,
                  'the host sees two students in each arm, and four who have not answered');

-- ---- consent ------------------------------------------------------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select pg_temp.refused_with(format('select public.record_consent(%L, true, %L)', :'sid_cash', 'v1'),
  'this session is not part of a research study', 'consent is only asked in research mode');
select pg_temp.denied(format('select public.record_consent(%L, null, %L)', :'rx', 'v1'), 'consent needs a yes or a no');
select pg_temp.denied(format('select public.record_consent(%L, true, %L)', :'rx', ''), 'consent needs the text''s version');
select pg_temp.denied(format('select public.record_consent(%L, true, %L)', :'rx', repeat('x', 41)), 'a consent version is at most 40 characters');
select (public.record_consent(:'rx', true, 'draft-1'))->>'consented' as a_yes \gset
reset role;
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select (public.record_consent(:'rx', false, 'draft-1'))->>'consented' as b_no \gset
reset role;
select set_config('request.jwt.claims', :'carol_jwt', false);
set role authenticated;
select (public.record_consent(:'rx', true, 'draft-1'))->>'consented' as c_yes \gset
reset role;
select pg_temp.ok(:'a_yes' = 'true' and :'b_no' = 'false' and :'c_yes' = 'true', 'each answer is recorded');

-- ---- nothing is kept without consent ---------------------------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.start_round(:'rx')).round_number as rx1 \gset
reset role;
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.log_behavior_events(:'rx', '[{"type":"screen_view"},{"type":"tap"}]'::jsonb) as a_logged \gset
reset role;
select set_config('request.jwt.claims', :'bob_jwt', false);
set role authenticated;
select public.log_behavior_events(:'rx', '[{"type":"screen_view"}]'::jsonb) as b_logged \gset
reset role;
select set_config('request.jwt.claims', :'dave_jwt', false);
set role authenticated;
select public.log_behavior_events(:'rx', '[{"type":"screen_view"}]'::jsonb) as d_logged \gset
select (public.place_order(:'rx', '{"slot":2,"side":"buy","order_type":"market","notional":500,
                                    "client_ref":"d-ctx","context":{"from":"market"}}'::jsonb)).id as d_order \gset
reset role;
select pg_temp.ok(:a_logged = 2 and :b_logged = 0 and :d_logged = 0
                  and (select count(*) = 2 and bool_and(player_id = :'rx_a') from public.behavior_events where session_id = :'rx'),
                  'only the student who agreed is logged; a no and a not-yet are accepted and dropped');
select pg_temp.ok((select context is null from public.market_orders where id = :'d_order'),
                  'an undecided student''s order keeps no decision context');

-- ---- the cooldown: a rule in place_order, per arm ---------------------------
select '{"sub":"' || p.auth_uid || '","role":"authenticated","is_anonymous":true}' as hi_jwt, p.id as hi_player
  from public.players p join public.player_conditions pc on pc.player_id = p.id
 where pc.session_id = :'rx' and pc.arm = 'high' and p.id <> :'rx_d' order by p.joined_at limit 1 \gset
select '{"sub":"' || p.auth_uid || '","role":"authenticated","is_anonymous":true}' as lo_jwt, p.id as lo_player
  from public.players p join public.player_conditions pc on pc.player_id = p.id
 where pc.session_id = :'rx' and pc.arm = 'low' and p.id <> :'rx_d' order by p.joined_at limit 1 \gset
select set_config('request.jwt.claims', :'hi_jwt', false);
set role authenticated;
select (public.place_order(:'rx', '{"slot":1,"side":"buy","order_type":"market","notional":1000,
                                    "client_ref":"cool-1","context":{"from":"stock"}}'::jsonb)).id as hi_o1 \gset
select pg_temp.refused_with(format($$select public.place_order(%L, '{"slot":1,"side":"buy","order_type":"market","notional":1000}')$$, :'rx'),
  'wait % more seconds before your next order', 'a high-friction student waits 30 s between orders');
select pg_temp.ok((public.place_order(:'rx', '{"slot":1,"side":"buy","order_type":"market","notional":1000,
                                              "client_ref":"cool-1"}'::jsonb)).id = :'hi_o1',
                  'a retried order is not a new one, so the cooldown never refuses it');
reset role;
update public.market_accounts set last_order_at = now() - interval '31 seconds' where player_id = :'hi_player';
select set_config('request.jwt.claims', :'hi_jwt', false);
set role authenticated;
select pg_temp.ok((public.place_order(:'rx', '{"slot":2,"side":"buy","order_type":"market","notional":1000}'::jsonb)).status = 'open',
                  'the next order goes through once the wait is over');
reset role;
select set_config('request.jwt.claims', :'lo_jwt', false);
set role authenticated;
select pg_temp.ok((public.place_order(:'rx', '{"slot":1,"side":"buy","order_type":"market","notional":1000,"context":{"from":"quick_buy"}}'::jsonb)).status = 'open'
                  and (public.place_order(:'rx', '{"slot":2,"side":"buy","order_type":"market","notional":1000}'::jsonb)).status = 'open',
                  'a low-friction student can place orders back to back');
reset role;

-- ---- the export -------------------------------------------------------------
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'rx', 1)).status as rx_l1 \gset
select public.resolve_round(:'rx', 1);
select public.export_research_data(:'rx')::text as rx_x \gset
select public.export_research_data(:'rx', 'events')::text as rx_e \gset
select public.export_research_data(:'gold')::text as gold_x \gset
select pg_temp.denied(format('select public.export_research_data(%L, %L)', :'rx', 'everything'), 'the export has two parts, tables and events');
reset role;
select pg_temp.ok((:'rx_x'::jsonb #>> '{session,players_total}')::int = 4
                  and (:'rx_x'::jsonb #>> '{session,players_included}')::int = 2
                  and jsonb_array_length(:'rx_x'::jsonb->'players') = 2
                  and (select bool_and((p->>'consented')::boolean) from jsonb_array_elements(:'rx_x'::jsonb->'players') p),
                  'in research mode the export holds only the two students who agreed');
select pg_temp.ok(strpos(:'rx_x', 'Alice') = 0 and strpos(:'rx_x', 'Carol') = 0 and strpos(:'rx_x', 'Study A') = 0
                  and strpos(:'rx_x', :'rx_a') = 0 and strpos(:'rx_x', :'rx_c') = 0
                  and strpos(:'rx_x', 'e0000000-0000-0000-0000-000000000001') = 0
                  and strpos(:'rx_e', 'Alice') = 0 and strpos(:'rx_e', :'rx_a') = 0,
                  'the export is pseudonymous: no names, no label, no player or account ids');
select pg_temp.ok((select bool_and(p->>'pid' ~ '^P[0-9A-F]{8}$') from jsonb_array_elements(:'rx_x'::jsonb->'players') p),
                  'each student appears as a stable pseudonym');
select pg_temp.ok(jsonb_array_length(:'rx_e'::jsonb->'events') = 2 and (:'rx_e'::jsonb->'next') = 'null'::jsonb
                  and (select count(distinct e->>'pid') = 1 from jsonb_array_elements(:'rx_e'::jsonb->'events') e),
                  'the events page holds the consenting student''s events and says there are no more');
select pg_temp.ok((select count(*) from jsonb_array_elements(:'rx_x'::jsonb->'orders')) =
                    (select count(*) from public.market_orders o join public.research_consents rc on rc.player_id = o.player_id
                      where o.session_id = :'rx' and rc.consented),
                  'orders are exported only for students who agreed');
select pg_temp.ok((select (r->>'opened_at') is not null and (r->>'closes_at') is not null
                          and (r->>'locked_at') is not null and (r->>'revealed_at') is not null
                     from jsonb_array_elements(:'rx_x'::jsonb->'rounds') r where (r->>'round')::int = 1),
                  'each round carries its phase timestamps: opened, closes, locked, revealed');
select pg_temp.ok((select count(*) = 6 from jsonb_array_elements(:'rx_x'::jsonb->'period_closes') c where (c->>'round')::int = 1),
                  'the export has every instrument''s close at the end of each revealed period');
select pg_temp.ok(not ((:'rx_x'::jsonb #> '{session,config}') ? 'label'), 'the host''s label stays out of the export');
select pg_temp.ok((:'gold_x'::jsonb #>> '{session,players_included}')::int = 3
                  and (select bool_and(p->'consented' = 'null'::jsonb) from jsonb_array_elements(:'gold_x'::jsonb->'players') p),
                  'outside research mode every student is exported, with no consent recorded');

-- ---- saying no later deletes what was kept ----------------------------------
select set_config('request.jwt.claims', :'alice_jwt', false);
set role authenticated;
select public.record_consent(:'rx', false, 'draft-1');
reset role;
select pg_temp.ok((select count(*) = 0 from public.behavior_events where player_id = :'rx_a')
                  and (select count(*) = 0 from public.market_orders where player_id = :'rx_a' and context is not null),
                  'withdrawing consent deletes the student''s behaviour log and order context');
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.export_research_data(:'rx') #>> '{session,players_included}')::int as rx_after \gset
select public.delete_session(:'rx');
reset role;
select pg_temp.ok(:rx_after = 1, 'a withdrawn student leaves the export');
select pg_temp.ok((select count(*) from public.player_conditions where session_id = :'rx') = 0
                  and (select count(*) from public.research_consents where session_id = :'rx') = 0,
                  'deleting a session removes its assignments and consent records');

-- =============================================================================
-- TIMING: one year, 60 players, 25 companies + the index, ~6 orders each.
-- resolve_round runs under Supabase's 8 s statement_timeout for `authenticated`.
-- =============================================================================
insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license, first_day, last_day)
select 300 + g, 'TIM' || g, 'equity', 'TM' || chr(65 + g / 26) || chr(65 + g % 26), 'Timing Corp ' || g,
       (array['Technology', 'Energy', 'Industrials'])[1 + g % 3], 'fixture', 'display-licensed',
       public._mkt_day('1984-01-02'), public._mkt_day('1991-12-31')
  from generate_series(0, 24) g;
insert into public.market_bars (instrument_id, year, days, o, h, l, c)
select i.id, extract(year from x.d)::smallint,
       array_agg((x.d - make_date(extract(year from x.d)::int, 1, 1))::smallint order by x.d),
       array_agg((x.px * 0.995)::real order by x.d), array_agg((x.px * 1.012)::real order by x.d),
       array_agg((x.px * 0.988)::real order by x.d), array_agg(x.px::real order by x.d)
  from public.market_instruments i
 cross join lateral (
   select g::date as d,
          (5 + i.id % 17) * exp(0.0003 * (g::date - date '1984-01-02'))
            * (1 + 0.08 * sin((g::date - date '1984-01-02') / (5.0 + i.id % 7) + i.id)) as px
     from generate_series(public._mkt_date(i.first_day), public._mkt_date(i.last_day), interval '1 day') g
    where extract(isodow from g) < 6
 ) x
 where i.id >= 300
 group by i.id, extract(year from x.d);
insert into public.market_universe (anchor_year, rank, real_name, sector, instrument_id)
select 1990, 20 + g, 'Timing Corp ' || g, (array['Technology', 'Energy', 'Industrials'])[1 + g % 3], 300 + g
  from generate_series(0, 24) g;
insert into public.market_name_pool (ticker, name, kind, sector)
select 'TQ' || chr(65 + g / 26) || chr(65 + g % 26), 'Timefake ' || g, 'equity',
       (array['Technology', 'Energy', 'Industrials'])[1 + g % 3]
  from generate_series(0, 44) g;
insert into auth.users (id, is_anonymous)
select ('99000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, true from generate_series(1, 60) g;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select id as tim, universe_size as tim_n from public.create_trading_session(
  '{"num_rounds":1,"period":"year","universe_size":25}'::jsonb, 1990) \gset
reset role;
select pg_temp.ok(:tim_n = 25, 'a full-size session draws 25 companies');
insert into public.players (session_id, auth_uid, display_name, current_wealth)
select :'tim', ('99000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Timer ' || g, 100000
  from generate_series(1, 60) g;
select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.start_round(:'tim')).round_number as t1 \gset
reset role;
-- per player: three dollar buys, a short, a GTC limit buy 10% under and a GTC stop 10% under
insert into public.market_orders (session_id, player_id, slot, side, order_type, quantity, notional, limit_price,
                                  stop_price, tif, placed_round, placed_at)
select :'tim', p.id, o.slot, o.side, o.otype, o.qty, o.notional,
       case when o.otype = 'limit' then round(lp.price * 0.9, 4) end,
       case when o.otype = 'stop' then round(lp.price * 0.9, 4) end,
       o.tif, 1, now() - make_interval(secs => 1000 - o.seq)
  from (select id, row_number() over (order by id) as n from public.players where session_id = :'tim') p
 cross join lateral (values
   (1, (p.n * 7) % 25 + 1,  'buy',        'market', null::numeric, 20000::numeric, 'round'),
   (2, (p.n * 11) % 25 + 1, 'buy',        'market', null, 20000, 'round'),
   (3, (p.n * 13) % 25 + 1, 'buy',        'market', null, 20000, 'round'),
   (4, (p.n * 3) % 25 + 1,  'sell_short', 'market', 20, null, 'round'),
   (5, (p.n * 5) % 25 + 1,  'buy',        'limit',  10, null, 'gtc'),
   (6, (p.n * 7) % 25 + 1,  'sell',       'stop',   10, null, 'gtc')
 ) o(seq, slot, side, otype, qty, notional, tif)
  join public._trading_last_prices(:'tim', public._trading_last_revealed_day(:'tim')) lp on lp.slot = o.slot;

select set_config('request.jwt.claims', :'host_jwt', false);
set role authenticated;
select (public.lock_round(:'tim', 1)).status as tl1 \gset
select clock_timestamp()::text as t0 \gset
select public.resolve_round(:'tim', 1);
select round(extract(epoch from clock_timestamp() - :'t0'::timestamptz) * 1000) as resolve_ms \gset
reset role;
select set_config('app.resolve_ms', :'resolve_ms', false);
do $$
begin
  if current_setting('app.resolve_ms')::numeric > 8000 then
    raise exception 'FAIL: a one-year, 60-player period took % ms, over the 8 s statement_timeout',
      current_setting('app.resolve_ms');
  end if;
  raise notice 'PASS: a one-year period for 60 players and 26 instruments resolved in % ms (PGlite; 8,000 ms limit, aim under 3,000)',
    current_setting('app.resolve_ms');
end $$;
select pg_temp.ok(
  (select count(*) from public.market_account_rounds where session_id = :'tim') = 60
  and (select bool_and(cardinality(daily_nlv) = 261) from public.market_account_rounds where session_id = :'tim')
  and (select count(*) from public.market_orders where session_id = :'tim' and order_type = 'market' and status = 'open') = 0
  and (select count(*) from public.market_fills where session_id = :'tim') >= 180
  and (select bool_and(nlv = p.current_wealth) from public.market_accounts a join public.players p on p.id = a.player_id
        where a.session_id = :'tim'),
  'the full-size period resolves every account, every market order and every trading day');

select '*** ALL MARKETS SELF-TESTS PASSED ***' as result;
