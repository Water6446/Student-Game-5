-- =============================================================================
-- 0037_simulated_market.sql — a simulated stock market, until real data is licensed.
--
-- Why: the paper trading game needs daily prices, and the only real histories
-- we hold (Yahoo, FRED, Ken French) are development-only: they may not be
-- stored in the production project. This migration generates a market of our
-- own, so the game can run on sharpesim.com now, and lets the host choose it.
--
-- What it adds:
--   1. A simulated market in the calendar years 2100–2134 (_market_sim_year), so
--      it never overlaps real history and the two can sit in one database:
--      30 companies across the name pool's sectors and an index fund; weekday
--      trading days; a market factor with calm and stressed spells (booms and
--      crashes); each company's beta, own volatility, drift and occasional
--      earnings jumps; quarterly dividends for half of them; one cash
--      acquisition and one bankruptcy; a drifting T-bill rate; one generated
--      headline a month from the index's move (the wording of
--      generatedHeadline in lib/markets/data/headlines.ts); a universe anchor
--      every 5 years ranked by size. Rows carry source = 'simulated' and
--      license = 'display-licensed' (we made them; nothing to license).
--   2. The fake-name pool and sectors (data/names/name_pool.json), which the
--      loader also writes, so a database with no loaded data can still name
--      the companies. Inserted only where missing.
--   3. config.market_data ('historical' | 'simulated') in create_trading_session:
--      absent means real history when any is loaded, else simulated. The
--      resolved choice is written into config, so every screen knows it. A
--      simulated game has no era to pick.
--   4. get_market_data_options(): which of the two the database holds, for
--      the setup form.
-- Generated once: if simulated rows already exist the generator does nothing.
-- Every draw comes from md5(seed, what, where) rather than random(), so every
-- database that runs this, whatever its query plans, holds the same market.
-- The seed was picked for a plausible long run: the index averages about 9.6%
-- a year (sd 16%), with one crash of about -38% and 9 down years in 34.
-- =============================================================================

create or replace function public._market_sim_year()
returns int language sql immutable set search_path = public, pg_temp as $$
  select 2100;
$$;

-- the i-th of four uniforms in (0, 1) held by an md5 hash (this connection only)
create function pg_temp.sim_u(h text, i int)
returns double precision language sql immutable as $$
  select ((('x' || substr(h, i * 8 - 7, 8))::bit(32)::int)::double precision + 2147483648.5) / 4294967296.0;
$$;

do $$
declare
  v_seed    text := 'sharpesim-137';
  v_y0      int := public._market_sim_year();
  v_years   int := 35;
  v_first   int;
  v_last    int;
  v_stress  boolean := false;
  v_rate    double precision := 0.04;
  v_k       int := 0;
  v_mu      double precision;
  v_sd      double precision;
  v_z       double precision;
  v_z2      double precision;
  v_h       text;
  d         record;
  v_sectors text[] := array['Technology', 'Communications', 'Consumer Discretionary', 'Consumer Staples',
                            'Energy', 'Financials', 'Health Care', 'Industrials', 'Materials', 'Utilities',
                            'Real Estate'];
begin
  if exists (select 1 from public.market_instruments where source = 'simulated') then
    return;
  end if;

  -- trading days: weekdays, closed Jan 1 and Dec 25
  insert into public.market_calendar (day)
  select public._mkt_day(g::date)
    from generate_series(make_date(v_y0, 1, 1), make_date(v_y0 + v_years - 1, 12, 31), interval '1 day') g
   where extract(isodow from g) < 6
     and to_char(g, 'MM-DD') not in ('01-01', '12-25')
  on conflict do nothing;
  select min(day), max(day) into v_first, v_last from public.market_calendar
   where day >= public._mkt_day(make_date(v_y0, 1, 1));

  -- the market factor (a daily log return) and the T-bill rate, day by day:
  -- calm spells (11% drift, 13% vol) and stressed ones (−45% drift, 35% vol),
  -- a stressed spell starting about once every 3 years and lasting ~33 days;
  -- about 9% a year compounded, roughly the long-run US market
  create temp table _sim_mkt (k int primary key, day int not null, m double precision not null,
                              rate double precision not null, qdiv boolean not null) on commit drop;
  for d in
    select c.day,
           coalesce(lag(extract(month from public._mkt_date(c.day))) over (order by c.day), 0)
             <> extract(month from public._mkt_date(c.day))
             and extract(month from public._mkt_date(c.day)) in (2, 5, 8, 11) as qdiv
      from public.market_calendar c where c.day between v_first and v_last order by c.day
  loop
    v_k := v_k + 1;
    v_h := md5(v_seed || ':m:' || v_k);
    if v_stress then
      if pg_temp.sim_u(v_h, 3) < 0.03 then v_stress := false; end if;
    elsif pg_temp.sim_u(v_h, 3) < 0.0012 then
      v_stress := true;
    end if;
    v_mu := case when v_stress then -0.45 else 0.11 end / 252.0;
    v_sd := case when v_stress then 0.35 else 0.13 end / sqrt(252.0);
    v_z  := sqrt(-2 * ln(pg_temp.sim_u(v_h, 1))) * cos(2 * pi() * pg_temp.sim_u(v_h, 2));
    v_z2 := sqrt(-2 * ln(pg_temp.sim_u(v_h, 1))) * sin(2 * pi() * pg_temp.sim_u(v_h, 2));
    v_rate := least(0.12, greatest(0.001, v_rate + 0.002 * (0.045 - v_rate) + 0.0006 * v_z2));
    insert into _sim_mkt values (v_k, d.day, v_mu - v_sd * v_sd / 2 + v_sd * v_z, v_rate, d.qdiv);
  end loop;

  insert into public.market_rates (day, tbill)
  select s.day, round(s.rate::numeric, 5)::double precision from _sim_mkt s
  on conflict (day) do update set tbill = excluded.tbill;

  -- the companies: ids −2 .. −31 (negative, so they never meet a loaded id)
  create temp table _sim_co on commit drop as
  select -(1 + n) as id, n,
         v_sectors[1 + (n - 1) % array_length(v_sectors, 1)] as sector,
         0.6 + pg_temp.sim_u(h.h1, 1) * 0.8 as beta,
         0.15 + pg_temp.sim_u(h.h1, 2) * 0.20 as idio,
         -0.02 + pg_temp.sim_u(h.h1, 3) * 0.05 as alpha,
         10 + pg_temp.sim_u(h.h1, 4) * 90 as p0,
         exp(pg_temp.sim_u(h.h2, 1) * 3) as shares,
         case when n % 2 = 0 then 0.015 + pg_temp.sim_u(h.h2, 2) * 0.025 else 0 end as yield,
         case n when 29 then 'cash_acquisition' when 30 then 'bankruptcy' end as delist_type,
         case n when 29 then (select s.day from _sim_mkt s where s.k = 252 * 17 + 90)
                when 30 then (select s.day from _sim_mkt s where s.k = 252 * 26 + 140) end as delist_day
    from generate_series(1, 30) n
   cross join lateral (select md5(v_seed || ':c:' || n) as h1, md5(v_seed || ':c2:' || n) as h2) h;

  insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license,
                                         first_day, last_day)
  values (-1, 'SIM:INDEX', 'index_fund', 'SIMIX', 'Simulated market index', 'Index fund', 'simulated',
          'display-licensed', v_first, v_last);
  insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license,
                                         first_day, last_day)
  select co.id, 'SIM:' || lpad(co.n::text, 2, '0'), 'equity', 'SIM' || lpad(co.n::text, 2, '0'),
         'Simulated company ' || co.n, co.sector, 'simulated', 'display-licensed',
         v_first, coalesce(co.delist_day, v_last)
    from _sim_co co;

  -- daily paths: r = alpha + beta × market + own noise (+ an earnings jump about
  -- once a quarter; a slide into the bankruptcy; the dividend off the price on
  -- its ex-day), compounded from the start price
  create temp table _sim_path on commit drop as
  with draws as (
    select co.id, s.k, s.day, s.m, s.qdiv, co.p0, co.idio, co.yield, co.alpha, co.beta,
           co.delist_type, co.delist_day,
           md5(v_seed || ':p:' || co.id || ':' || s.k) as h1, md5(v_seed || ':q:' || co.id || ':' || s.k) as h2
      from _sim_co co
      join _sim_mkt s on s.day <= coalesce(co.delist_day, v_last)
  ), base as (
    select dr.id, dr.k, dr.day, dr.p0, dr.idio, dr.yield,
           dr.alpha / 252.0 + dr.beta * dr.m - dr.idio * dr.idio / 504.0
             + dr.idio / sqrt(252.0) * sqrt(-2 * ln(pg_temp.sim_u(dr.h1, 1))) * cos(2 * pi() * pg_temp.sim_u(dr.h1, 2))
             + case when pg_temp.sim_u(dr.h1, 3) < 1.0 / 63
                    then 0.05 * sqrt(-2 * ln(pg_temp.sim_u(dr.h1, 1))) * sin(2 * pi() * pg_temp.sim_u(dr.h1, 2)) else 0 end
             + case when dr.delist_type = 'bankruptcy' and dr.day > dr.delist_day - 365 then -0.008 else 0 end
             + case when dr.qdiv and dr.yield > 0 then ln(1 - dr.yield / 4) else 0 end as r,
           dr.qdiv,
           0.004 * sqrt(-2 * ln(pg_temp.sim_u(dr.h2, 1))) * cos(2 * pi() * pg_temp.sim_u(dr.h2, 2)) as gap,
           pg_temp.sim_u(dr.h1, 4) as uh, pg_temp.sim_u(dr.h2, 3) as ul
      from draws dr
    union all
    select -1, s.k, s.day, 100.0, 0.10, 0, s.m, false,
           0.002 * sqrt(-2 * ln(pg_temp.sim_u(h.h2, 1))) * cos(2 * pi() * pg_temp.sim_u(h.h2, 2)),
           pg_temp.sim_u(h.h2, 3), pg_temp.sim_u(h.h2, 4)
      from _sim_mkt s
     cross join lateral (select md5(v_seed || ':q:-1:' || s.k) as h2) h
  ), px as (
    select b.*, b.p0 * exp(sum(b.r) over (partition by b.id order by b.k)) as c from base b
  ), ohlc as (
    select px.*, coalesce(lag(px.c) over (partition by px.id order by px.k) * exp(px.gap), px.c) as o from px
  )
  select id, k, day, qdiv, yield, o, c,
         greatest(o, c) * (1 + uh * idio / sqrt(252.0) * 0.8) as h,
         least(o, c) * (1 - ul * idio / sqrt(252.0) * 0.8) as l
    from ohlc;
  create index on _sim_path (id, day);

  insert into public.market_bars (instrument_id, year, days, o, h, l, c)
  select p.id, extract(year from public._mkt_date(p.day))::smallint,
         array_agg((p.day - public._mkt_day(make_date(extract(year from public._mkt_date(p.day))::int, 1, 1)))::smallint
                   order by p.day),
         array_agg(p.o::real order by p.day), array_agg(p.h::real order by p.day),
         array_agg(p.l::real order by p.day), array_agg(p.c::real order by p.day)
    from _sim_path p
   group by p.id, extract(year from public._mkt_date(p.day));

  -- dividends: a quarter of the yield on the first trading day of Feb, May, Aug, Nov
  insert into public.market_corporate_actions (instrument_id, day, kind, amount)
  select p.id, p.day, 'dividend', round((p.c * p.yield / 4)::numeric, 4)::double precision
    from _sim_path p
   where p.qdiv and p.yield > 0 and p.c * p.yield / 4 >= 0.0001;

  -- the delistings: a cash takeover at a 25% premium; a bankruptcy worth nothing
  update public.market_instruments mi
     set delist_type = co.delist_type, delist_day = co.delist_day,
         delist_value = case co.delist_type
                          when 'cash_acquisition' then
                            round(((select p.c from _sim_path p where p.id = co.id and p.day = co.delist_day) * 1.25)::numeric, 4)::double precision
                          else 0 end
    from _sim_co co
   where mi.id = co.id and co.delist_type is not null;

  -- the universe: every 5 years, the companies alive then, biggest first
  insert into public.market_universe (anchor_year, rank, real_name, real_ticker, sector, instrument_id)
  select a.y, row_number() over (partition by a.y order by p.c * co.shares desc)::smallint,
         'Simulated company ' || co.n, 'SIM' || lpad(co.n::text, 2, '0'), co.sector, co.id
    from generate_series(v_y0, v_y0 + v_years - 5, 5) a(y)
    join _sim_co co on co.delist_day is null or co.delist_day > public._mkt_day(make_date(a.y, 1, 1))
    join lateral (select p.c from _sim_path p where p.id = co.id
                   and p.day >= public._mkt_day(make_date(a.y, 1, 1)) order by p.day limit 1) p on true;

  -- one generated headline a month, from the index's move that month
  insert into public.market_headlines (month, rank, text, reviewed)
  select m.month, 1,
         (case
            when m.ret < -0.10 then array['Stocks plunge as selling sweeps the market', 'A steep sell-off erases months of gains']
            when m.ret < -0.05 then array['Stocks fall sharply in a broad sell-off', 'Investors dump shares as prices slide']
            when m.ret < -0.02 then array['Stocks slip as investors turn cautious', 'Shares drift lower on thin enthusiasm']
            when m.ret <  0.02 then array['Stocks drift in a quiet month', 'A calm month leaves prices little changed']
            when m.ret <  0.05 then array['Stocks edge higher in steady trading', 'Shares climb as buyers return']
            when m.ret <  0.10 then array['Stocks rally broadly', 'A strong month lifts most shares']
            else array['Stocks surge in one of the strongest months in years', 'A powerful rally sends prices soaring']
          end)[1 + (substr(m.month, 6, 2)::int % 2)],
         true
    from (select to_char(public._mkt_date(s.day), 'YYYY-MM') as month, exp(sum(s.m)) - 1 as ret
            from _sim_mkt s group by 1) m
  on conflict (month, rank) do nothing;
end $$;

drop function pg_temp.sim_u(text, int);

-- =============================================================================
-- The fake-name pool and sectors (data/names/name_pool.json; the loader writes
-- the same rows). Only where missing, so a loaded pool is left alone.
-- =============================================================================
insert into public.market_sectors (sector, about) values
  ('Technology', 'Makes computers, chips and software for businesses and households.'),
  ('Communications', 'Runs telephone, broadcast and media businesses.'),
  ('Consumer Discretionary', 'Sells cars, clothing, meals and other things people buy more of when times are good.'),
  ('Consumer Staples', 'Makes and sells food, drinks and household goods people buy in any economy.'),
  ('Energy', 'Finds, pumps and refines oil and gas.'),
  ('Financials', 'Takes deposits, makes loans, sells insurance and manages money.'),
  ('Health Care', 'Develops medicines and medical products and runs care services.'),
  ('Industrials', 'Builds machinery, aircraft and equipment, and moves freight.'),
  ('Materials', 'Produces metals, chemicals, paper and building materials.'),
  ('Utilities', 'Delivers electricity, gas and water at regulated rates.'),
  ('Real Estate', 'Owns and leases offices, shops, homes and land.')
on conflict (sector) do nothing;

insert into public.market_name_pool (ticker, name, kind, sector, about) values
  ('TMIX', 'Total Market Index Fund', 'index_fund', null, 'Holds every stock in the market in proportion to its size, for a tiny yearly fee.'),
  ('CRVN', 'Corvane Systems', 'equity', 'Technology', null),
  ('BWLC', 'Brightwell Computing', 'equity', 'Technology', null),
  ('TSMD', 'Tessellate Microdevices', 'equity', 'Technology', null),
  ('ORDM', 'Orrin Data Machines', 'equity', 'Technology', null),
  ('KSTL', 'Kestrel Logic', 'equity', 'Technology', null),
  ('LMVS', 'Lumivale Semiconductor', 'equity', 'Technology', null),
  ('NGSW', 'Northgate Software', 'equity', 'Technology', null),
  ('QFIN', 'Quillfeather Instruments', 'equity', 'Technology', null),
  ('ARCW', 'Arbor Circuitworks', 'equity', 'Technology', null),
  ('VNTE', 'Vantor Electronics', 'equity', 'Technology', null),
  ('HXRC', 'Helix Ridge Computing', 'equity', 'Technology', null),
  ('PMBN', 'Pemberton Networks', 'equity', 'Technology', null),
  ('SBDV', 'Silverbirch Devices', 'equity', 'Technology', null),
  ('CLWD', 'Calloway Digital', 'equity', 'Technology', null),
  ('FNWM', 'Fenwick Microsystems', 'equity', 'Technology', null),
  ('STVT', 'Stratavale Technologies', 'equity', 'Technology', null),
  ('IRBD', 'Ironbark Data', 'equity', 'Technology', null),
  ('MPSY', 'Meridian Pulse Systems', 'equity', 'Technology', null),
  ('TLMS', 'Tallowmere Systems', 'equity', 'Technology', null),
  ('GRLK', 'Graylock Semiconductor', 'equity', 'Technology', null),
  ('AMBS', 'Amberline Software', 'equity', 'Technology', null),
  ('CPFI', 'Copperfield Instruments', 'equity', 'Technology', null),
  ('WXLC', 'Wexley Computing', 'equity', 'Technology', null),
  ('TDLG', 'Thistledown Logic', 'equity', 'Technology', null),
  ('BWTL', 'Bellweather Telephone', 'equity', 'Communications', null),
  ('CRWB', 'Carrow Broadcasting', 'equity', 'Communications', null),
  ('SGCC', 'Signalcrest Communications', 'equity', 'Communications', null),
  ('HRWM', 'Hartwell Media', 'equity', 'Communications', null),
  ('RVSN', 'Ravenstone Networks', 'equity', 'Communications', null),
  ('LGRT', 'Longreach Telecom', 'equity', 'Communications', null),
  ('STBC', 'Starling Broadcast', 'equity', 'Communications', null),
  ('EVMD', 'Echo Valley Media', 'equity', 'Communications', null),
  ('CXLT', 'Crossline Telephone', 'equity', 'Communications', null),
  ('PNWC', 'Pinewave Communications', 'equity', 'Communications', null),
  ('BPMD', 'Brightpost Media', 'equity', 'Communications', null),
  ('TDWN', 'Tidewell Networks', 'equity', 'Communications', null),
  ('CLBT', 'Clearbrook Telecom', 'equity', 'Communications', null),
  ('LKSM', 'Larkspur Media', 'equity', 'Communications', null),
  ('CRBC', 'Corbel Communications', 'equity', 'Communications', null),
  ('HWNK', 'Highwire Networks', 'equity', 'Communications', null),
  ('WCMD', 'Wavecrest Media', 'equity', 'Communications', null),
  ('RPTL', 'Relay Point Telephone', 'equity', 'Communications', null),
  ('NSBC', 'Northstar Broadcasting', 'equity', 'Communications', null),
  ('OFMD', 'Openfield Media', 'equity', 'Communications', null),
  ('SKLT', 'Skylark Telecom', 'equity', 'Communications', null),
  ('FLTC', 'Fairlight Communications', 'equity', 'Communications', null),
  ('SPDM', 'Spindle Media', 'equity', 'Communications', null),
  ('GHNW', 'Greenhollow Networks', 'equity', 'Communications', null),
  ('RDGM', 'Ridgeline Motors', 'equity', 'Consumer Discretionary', null),
  ('MRDS', 'Marlowe Department Stores', 'equity', 'Consumer Discretionary', null),
  ('PNAW', 'Pennant Auto Works', 'equity', 'Consumer Discretionary', null),
  ('HLRW', 'Hollis & Rowe Retail', 'equity', 'Consumer Discretionary', null),
  ('FHHG', 'Fairhaven Home Goods', 'equity', 'Consumer Discretionary', null),
  ('CRMA', 'Crestmoor Apparel', 'equity', 'Consumer Discretionary', null),
  ('BKSR', 'Brookside Restaurants', 'equity', 'Consumer Discretionary', null),
  ('AGCW', 'Ashgrove Coachworks', 'equity', 'Consumer Discretionary', null),
  ('OKST', 'Oakhurst Stores', 'equity', 'Consumer Discretionary', null),
  ('WDVL', 'Wendover Leisure', 'equity', 'Consumer Discretionary', null),
  ('GLHT', 'Gilded Lantern Hotels', 'equity', 'Consumer Discretionary', null),
  ('MRTR', 'Merrow Tire & Rubber', 'equity', 'Consumer Discretionary', null),
  ('BRMT', 'Bramble Toys', 'equity', 'Consumer Discretionary', null),
  ('CLOF', 'Cobalt Lane Outfitters', 'equity', 'Consumer Discretionary', null),
  ('HTSF', 'Hearthstone Furnishings', 'equity', 'Consumer Discretionary', null),
  ('VLMC', 'Velora Motor Company', 'equity', 'Consumer Discretionary', null),
  ('QHFW', 'Quarry Hill Footwear', 'equity', 'Consumer Discretionary', null),
  ('TTDS', 'Tinsel & Thread Stores', 'equity', 'Consumer Discretionary', null),
  ('RTDN', 'Roundtable Diners', 'equity', 'Consumer Discretionary', null),
  ('KTAP', 'Kittering Appliances', 'equity', 'Consumer Discretionary', null),
  ('SBCL', 'Seabright Cruise Lines', 'equity', 'Consumer Discretionary', null),
  ('FXGF', 'Foxglove Fashion', 'equity', 'Consumer Discretionary', null),
  ('HLHC', 'Halverson Home Centers', 'equity', 'Consumer Discretionary', null),
  ('PGAP', 'Peregrine Auto Parts', 'equity', 'Consumer Discretionary', null),
  ('GLFD', 'Goldleaf Foods', 'equity', 'Consumer Staples', null),
  ('PLBV', 'Pellham Beverage', 'equity', 'Consumer Staples', null),
  ('HMGR', 'Harvest Moon Grocers', 'equity', 'Consumer Staples', null),
  ('CLDD', 'Cloverdale Dairy', 'equity', 'Consumer Staples', null),
  ('TNBT', 'Thornbury Tobacco', 'equity', 'Consumer Staples', null),
  ('SWSD', 'Sweetwater Soda', 'equity', 'Consumer Staples', null),
  ('HYFM', 'Hayfield Mills', 'equity', 'Consumer Staples', null),
  ('BMHH', 'Brightmorrow Household', 'equity', 'Consumer Staples', null),
  ('CWSC', 'Corwin Soap & Candle', 'equity', 'Consumer Staples', null),
  ('LDCM', 'Larder & Co. Markets', 'equity', 'Consumer Staples', null),
  ('MPCB', 'Maple Crest Bakers', 'equity', 'Consumer Staples', null),
  ('OSTB', 'Ostrander Brewing', 'equity', 'Consumer Staples', null),
  ('PNHC', 'Pinehill Cosmetics', 'equity', 'Consumer Staples', null),
  ('WSPS', 'Wellspring Pharmacy Stores', 'equity', 'Consumer Staples', null),
  ('BHCN', 'Blue Heron Canning', 'equity', 'Consumer Staples', null),
  ('AMFF', 'Amberfield Farms', 'equity', 'Consumer Staples', null),
  ('SMCR', 'Sunmeadow Cereal', 'equity', 'Consumer Staples', null),
  ('KBCF', 'Kettlebrook Confections', 'equity', 'Consumer Staples', null),
  ('DVCT', 'Dovecote Tea', 'equity', 'Consumer Staples', null),
  ('FSWC', 'Fieldstone Wholesale Clubs', 'equity', 'Consumer Staples', null),
  ('RMPC', 'Rosemont Personal Care', 'equity', 'Consumer Staples', null),
  ('GRHF', 'Granary Hall Foods', 'equity', 'Consumer Staples', null),
  ('SSSM', 'Silver Spoon Supermarkets', 'equity', 'Consumer Staples', null),
  ('CKSN', 'Copperkettle Snacks', 'equity', 'Consumer Staples', null),
  ('RBPT', 'Ridgeback Petroleum', 'equity', 'Energy', null),
  ('CBOL', 'Crown Basin Oil', 'equity', 'Energy', null),
  ('SHRF', 'Sandhill Refining', 'equity', 'Energy', null),
  ('DMDR', 'Deepmere Drilling', 'equity', 'Energy', null),
  ('CSPG', 'Coldspring Gas', 'equity', 'Energy', null),
  ('RMOL', 'Redmesa Oil', 'equity', 'Energy', null),
  ('HWPL', 'Hollowell Pipeline', 'equity', 'Energy', null),
  ('ERPT', 'Ember Ridge Petroleum', 'equity', 'Energy', null),
  ('NFKE', 'Northfork Energy', 'equity', 'Energy', null),
  ('SMOI', 'Saltmarsh Oil & Gas', 'equity', 'Energy', null),
  ('GFPT', 'Granite Flats Petroleum', 'equity', 'Energy', null),
  ('TWRF', 'Tumbleweed Refining', 'equity', 'Energy', null),
  ('PSOF', 'Pelican Shoal Offshore', 'equity', 'Energy', null),
  ('IMEN', 'Iron Mesa Energy', 'equity', 'Energy', null),
  ('WROS', 'Westridge Oilfield Services', 'equity', 'Energy', null),
  ('CBRS', 'Coalbrook Resources', 'equity', 'Energy', null),
  ('SGBP', 'Sagebrush Petroleum', 'equity', 'Energy', null),
  ('FLKX', 'Flintlock Exploration', 'equity', 'Energy', null),
  ('HPGS', 'Highplain Gas', 'equity', 'Energy', null),
  ('CLDO', 'Caldera Oil', 'equity', 'Energy', null),
  ('PLOL', 'Prairie Lantern Oil', 'equity', 'Energy', null),
  ('HGEN', 'Harrowgate Energy', 'equity', 'Energy', null),
  ('RMRK', 'Rimrock Drilling', 'equity', 'Energy', null),
  ('BMPL', 'Blue Mesa Pipeline', 'equity', 'Energy', null),
  ('GTBC', 'Granite Trust Bancorp', 'equity', 'Financials', null),
  ('CRMB', 'Cranmore Bank', 'equity', 'Financials', null),
  ('SNTA', 'Sentinel Assurance', 'equity', 'Financials', null),
  ('LKSV', 'Lockridge Savings', 'equity', 'Financials', null),
  ('FHCP', 'Fernhall Capital', 'equity', 'Financials', null),
  ('SBIN', 'Stonebridge Insurance', 'equity', 'Financials', null),
  ('HPSE', 'Holloway & Pike Securities', 'equity', 'Financials', null),
  ('EGML', 'Evergreen Mutual Life', 'equity', 'Financials', null),
  ('CGFN', 'Copper Gate Financial', 'equity', 'Financials', null),
  ('LKCR', 'Larkfield Credit', 'equity', 'Financials', null),
  ('IWTR', 'Ironwood Trust', 'equity', 'Financials', null),
  ('PNBS', 'Penrose Bancshares', 'equity', 'Financials', null),
  ('OMCS', 'Oakmont Card Services', 'equity', 'Financials', null),
  ('BWIN', 'Brightwater Insurance', 'equity', 'Financials', null),
  ('RVWB', 'Ravenwood Bank', 'equity', 'Financials', null),
  ('TGPY', 'Tollgate Payments', 'equity', 'Financials', null),
  ('MBHD', 'Marchbank Holdings', 'equity', 'Financials', null),
  ('HHMU', 'Hollyhock Mutual', 'equity', 'Financials', null),
  ('SCBR', 'Stonecrest Brokerage', 'equity', 'Financials', null),
  ('TFRE', 'Thornfield Re', 'equity', 'Financials', null),
  ('BRMG', 'Briarwood Mortgage', 'equity', 'Financials', null),
  ('CXGR', 'Calder Exchange Group', 'equity', 'Financials', null),
  ('MWFS', 'Mosswood Federal Savings', 'equity', 'Financials', null),
  ('HRAM', 'Harrier Asset Management', 'equity', 'Financials', null),
  ('BLPH', 'Bellamy Pharmaceuticals', 'equity', 'Health Care', null),
  ('VRDL', 'Verdant Laboratories', 'equity', 'Health Care', null),
  ('CRMD', 'Corran Medical', 'equity', 'Health Care', null),
  ('HLBG', 'Halden Biologics', 'equity', 'Health Care', null),
  ('ASHH', 'Ashby Health', 'equity', 'Health Care', null),
  ('LDTX', 'Lindqvist Therapeutics', 'equity', 'Health Care', null),
  ('MLMD', 'Meadowlark Medical Devices', 'equity', 'Health Care', null),
  ('ORPH', 'Oriel Pharma', 'equity', 'Health Care', null),
  ('PDDX', 'Pendle Diagnostics', 'equity', 'Health Care', null),
  ('QNTL', 'Quintara Labs', 'equity', 'Health Care', null),
  ('RHHS', 'Rowan Hill Hospitals', 'equity', 'Health Care', null),
  ('SCPH', 'Sable Creek Pharmaceuticals', 'equity', 'Health Care', null),
  ('TMBT', 'Tamsin Biotech', 'equity', 'Health Care', null),
  ('UHSG', 'Underhill Surgical', 'equity', 'Health Care', null),
  ('WMHP', 'Wilmot Health Plans', 'equity', 'Health Care', null),
  ('AVPH', 'Arden Vale Pharma', 'equity', 'Health Care', null),
  ('BBTX', 'Bluebell Therapeutics', 'equity', 'Health Care', null),
  ('CRSI', 'Cresswell Instruments', 'equity', 'Health Care', null),
  ('DNML', 'Dunmore Laboratories', 'equity', 'Health Care', null),
  ('ELMD', 'Elmstead Medical', 'equity', 'Health Care', null),
  ('FXPH', 'Foxley Pharmaceuticals', 'equity', 'Health Care', null),
  ('GRKH', 'Glenrock Health', 'equity', 'Health Care', null),
  ('HMBS', 'Hemlock Biosciences', 'equity', 'Health Care', null),
  ('IVGH', 'Ivory Gate Health', 'equity', 'Health Care', null),
  ('RWIN', 'Ridgeway Industries', 'equity', 'Industrials', null),
  ('THAE', 'Thornhill Aerospace', 'equity', 'Industrials', null),
  ('CWRL', 'Cartwright Rail', 'equity', 'Industrials', null),
  ('IFMC', 'Ironforge Machinery', 'equity', 'Industrials', null),
  ('BNEL', 'Bannerman Electric', 'equity', 'Industrials', null),
  ('CWEN', 'Coldwater Engineering', 'equity', 'Industrials', null),
  ('DCFT', 'Draycott Freight', 'equity', 'Industrials', null),
  ('ELTR', 'Ellery Tractor', 'equity', 'Industrials', null),
  ('FFCG', 'Fallowfield Conglomerate', 'equity', 'Industrials', null),
  ('GBWK', 'Gantry & Bolt Works', 'equity', 'Industrials', null),
  ('HBAL', 'Harrowby Air Lines', 'equity', 'Industrials', null),
  ('IKMT', 'Inkwell Machine Tools', 'equity', 'Industrials', null),
  ('JBCN', 'Joiner Brothers Construction', 'equity', 'Industrials', null),
  ('KWLG', 'Kingsway Logistics', 'equity', 'Industrials', null),
  ('LFDF', 'Longfellow Defense', 'equity', 'Industrials', null),
  ('MBEM', 'Millbrook Electric Motors', 'equity', 'Industrials', null),
  ('NWSP', 'Northwind Shipping', 'equity', 'Industrials', null),
  ('OXIN', 'Oxley Industries', 'equity', 'Industrials', null),
  ('PMCT', 'Pressman Controls', 'equity', 'Industrials', null),
  ('QDSB', 'Quarterdeck Shipbuilding', 'equity', 'Industrials', null),
  ('RNRC', 'Rennick Railcar', 'equity', 'Industrials', null),
  ('STMI', 'Strathmore Instruments', 'equity', 'Industrials', null),
  ('TLAV', 'Tallis Aviation', 'equity', 'Industrials', null),
  ('UFWS', 'Upfield Waste Services', 'equity', 'Industrials', null),
  ('GSST', 'Greystone Steel', 'equity', 'Materials', null),
  ('HMAL', 'Hammerfall Aluminum', 'equity', 'Materials', null),
  ('KWCH', 'Kilnworth Chemical', 'equity', 'Materials', null),
  ('LDMN', 'Lodestar Mining', 'equity', 'Materials', null),
  ('MRPP', 'Millrace Paper', 'equity', 'Materials', null),
  ('NCCP', 'Northcliff Copper', 'equity', 'Materials', null),
  ('ORMT', 'Oreline Metals', 'equity', 'Materials', null),
  ('PFTB', 'Pitchfork Timber', 'equity', 'Materials', null),
  ('QSCM', 'Quarrystone Cement', 'equity', 'Materials', null),
  ('RFCH', 'Redfern Chemical', 'equity', 'Materials', null),
  ('SAGL', 'Saltash Glass', 'equity', 'Materials', null),
  ('TBPK', 'Tinbridge Packaging', 'equity', 'Materials', null),
  ('UFFT', 'Umberfield Fertilizer', 'equity', 'Materials', null),
  ('VRPL', 'Verity Polymers', 'equity', 'Materials', null),
  ('WFAL', 'Wolfram Alloys', 'equity', 'Materials', null),
  ('YFPR', 'Yarrow Forest Products', 'equity', 'Materials', null),
  ('ACPL', 'Ashcombe Plastics', 'equity', 'Materials', null),
  ('BDSW', 'Brindle Steelworks', 'equity', 'Materials', null),
  ('CFCH', 'Cinderford Chemical', 'equity', 'Materials', null),
  ('DNMN', 'Dunlin Minerals', 'equity', 'Materials', null),
  ('ESIG', 'Emberstone Industrial Gases', 'equity', 'Materials', null),
  ('FRPP', 'Flintridge Paper', 'equity', 'Materials', null),
  ('GCMN', 'Goldcrest Mining', 'equity', 'Materials', null),
  ('HLCT', 'Harlow Coatings', 'equity', 'Materials', null),
  ('RBPL', 'Riverbend Power & Light', 'equity', 'Utilities', null),
  ('CDEL', 'Cleardawn Electric', 'equity', 'Utilities', null),
  ('HCGE', 'Hillcrest Gas & Electric', 'equity', 'Utilities', null),
  ('LSWT', 'Lakeshore Water', 'equity', 'Utilities', null),
  ('NFPW', 'Northfield Power', 'equity', 'Utilities', null),
  ('SHVU', 'Stonehaven Utilities', 'equity', 'Utilities', null),
  ('TDPW', 'Tidemark Power', 'equity', 'Utilities', null),
  ('UPEL', 'Upland Electric', 'equity', 'Utilities', null),
  ('VHGS', 'Valley Hearth Gas', 'equity', 'Utilities', null),
  ('WMEG', 'Willowmere Energy', 'equity', 'Utilities', null),
  ('BFEL', 'Brightfield Electric', 'equity', 'Utilities', null),
  ('CBPW', 'Cedarbrook Power', 'equity', 'Utilities', null),
  ('DVGS', 'Dovetail Gas', 'equity', 'Utilities', null),
  ('EWEL', 'Elmwood Electric', 'equity', 'Utilities', null),
  ('FLWT', 'Fernleigh Water', 'equity', 'Utilities', null),
  ('GVPW', 'Glimmer Valley Power', 'equity', 'Utilities', null),
  ('HMLT', 'Highmoor Light', 'equity', 'Utilities', null),
  ('ISHY', 'Ironstone Hydro', 'equity', 'Utilities', null),
  ('JREL', 'Jasper Ridge Electric', 'equity', 'Utilities', null),
  ('KSGS', 'Kestrel Gas', 'equity', 'Utilities', null),
  ('LFPW', 'Lanternfield Power', 'equity', 'Utilities', null),
  ('MBUT', 'Mossbank Utilities', 'equity', 'Utilities', null),
  ('NFEL', 'Nettlefield Electric', 'equity', 'Utilities', null),
  ('OVWT', 'Oakvale Water', 'equity', 'Utilities', null),
  ('AWPR', 'Archway Properties', 'equity', 'Real Estate', null),
  ('BBRY', 'Bellbrook Realty', 'equity', 'Real Estate', null),
  ('CGPR', 'Castlegate Properties', 'equity', 'Real Estate', null),
  ('DMLD', 'Dunmere Land', 'equity', 'Real Estate', null),
  ('EWES', 'Elderwood Estates', 'equity', 'Real Estate', null),
  ('FWRY', 'Fenwood Realty', 'equity', 'Real Estate', null),
  ('GSPR', 'Granary Square Properties', 'equity', 'Real Estate', null),
  ('HGTW', 'Highgate Towers', 'equity', 'Real Estate', null),
  ('IWLT', 'Ivywood Land Trust', 'equity', 'Real Estate', null),
  ('KBRY', 'Kingsbridge Realty', 'equity', 'Real Estate', null),
  ('LFPR', 'Larchfield Properties', 'equity', 'Real Estate', null),
  ('MBES', 'Meadowbrook Estates', 'equity', 'Real Estate', null),
  ('NWPR', 'Nestwood Properties', 'equity', 'Real Estate', null),
  ('ORRY', 'Orchard Row Realty', 'equity', 'Real Estate', null),
  ('PKLD', 'Parkstone Land', 'equity', 'Real Estate', null),
  ('QGPR', 'Queensgate Properties', 'equity', 'Real Estate', null),
  ('RBRY', 'Rosebank Realty', 'equity', 'Real Estate', null),
  ('SWES', 'Stonewall Estates', 'equity', 'Real Estate', null),
  ('TWTW', 'Thornwood Towers', 'equity', 'Real Estate', null),
  ('UWLD', 'Underwood Land', 'equity', 'Real Estate', null),
  ('VHPR', 'Vinehall Properties', 'equity', 'Real Estate', null),
  ('WFRY', 'Wrenfield Realty', 'equity', 'Real Estate', null),
  ('YTPR', 'Yewtree Properties', 'equity', 'Real Estate', null),
  ('ABES', 'Amberley Estates', 'equity', 'Real Estate', null)
on conflict do nothing;

-- =============================================================================
-- create_trading_session — 0033's, plus the market_data choice (rule 3 above).
-- Everything else is unchanged.
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
  v_data      text;
  v_sim_day   int := public._mkt_day(make_date(public._market_sim_year(), 1, 1));
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

  -- which market (0037): real history, or the simulated one. Absent means real
  -- history when any is loaded, else simulated.
  v_data := v_config->>'market_data';
  if v_data is null then
    v_data := case when exists (select 1 from public.market_calendar c where c.day < v_sim_day)
                   then 'historical' else 'simulated' end;
  end if;
  if v_data not in ('historical', 'simulated') then
    raise exception 'market_data must be historical or simulated'; end if;
  if v_data = 'simulated' and p_start_year is not null then
    raise exception 'a simulated market has no era to pick'; end if;
  v_config := v_config || jsonb_build_object('market_data', v_data);

  -- the data we hold
  -- the data we hold of the chosen kind: real history lies before 2100, the
  -- simulated market from 2100 on
  select min(c.day), max(c.day) into v_cal_first, v_cal_last from public.market_calendar c
   where (c.day >= v_sim_day) = (v_data = 'simulated');
  if v_cal_first is null then
    raise exception '%', case when v_data = 'simulated' then 'no simulated market data is loaded'
                              else 'no market data is loaded' end;
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
-- get_market_data_options — which markets this database can run, for the
-- setup form. Signed-in callers only; it names no data, only whether each kind
-- is loaded.
-- =============================================================================
create or replace function public.get_market_data_options()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'historical', exists (select 1 from public.market_calendar c
                           where c.day < public._mkt_day(make_date(public._market_sim_year(), 1, 1))),
    'simulated',  exists (select 1 from public.market_calendar c
                           where c.day >= public._mkt_day(make_date(public._market_sim_year(), 1, 1))));
$$;

revoke all on function public._market_sim_year()                 from public, anon, authenticated;
revoke all on function public.create_trading_session(jsonb, int) from public, anon;
grant execute on function public.create_trading_session(jsonb, int) to authenticated;
revoke all on function public.get_market_data_options()          from public, anon;
grant execute on function public.get_market_data_options() to authenticated;
