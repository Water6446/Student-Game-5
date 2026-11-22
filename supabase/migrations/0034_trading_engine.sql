-- =============================================================================
-- 0034_trading_engine.sql — the paper trading engine: _resolve_trading for real.
--
-- WHY: 0033 shipped _resolve_trading as a stub that revealed a period without
-- trading. This replaces it with the day-by-day replay of docs/PAPER_TRADING.md
-- §6, in Postgres (the server owns every number; nothing here needs to run
-- elsewhere). It is called only from resolve_round's trading branch, so
-- resolve_round stays the only writer of players.current_wealth.
--
-- MIRRORED by lib/markets/trading/engine.ts (resolvePeriod) and stats.ts —
-- same order of operations, same rounding points; the "golden" block of
-- scripts/markets_selftest.sql and engine.test.ts assert the same numbers.
-- MECHANICS.md "Paper trading" is the prose version.
--
-- Per period, for each active player independently (there is no order book,
-- so players never interact):
--   1. market orders fill before day 1 at the close students saw ± half spread
--   2. each trading day:
--        open      dividends / distributions to holders (shorts pay)
--        intraday  resting limit, stop and stop-limit orders, in submission order;
--                  every fill re-checked (shares held, long/short, frozen,
--                  margin at the previous close)
--        close     delistings settle; interest on cash not backing shorts,
--                  margin interest on a loan, the borrow fee on shorts; a
--                  maintenance breach liquidates the largest position, again
--                  until the account complies; the day's value is recorded
--   3. this-round orders still open expire
-- then positions, the account, its per-round row, the allocation record and
-- players.current_wealth are written, the Sharpe is recomputed, and the round
-- is set 'revealed' LAST.
--
-- Performance: market data is loaded once into flat arrays; each account is
-- simulated in memory and written at the end, with fills, dividends and order
-- changes the only rows written inside the loop. Budget: a one-year period
-- for 60 players inside Supabase's 8 s statement_timeout for `authenticated`
-- (the markets self-test times it).
-- =============================================================================

-- A stop-limit that has triggered behaves as a limit order from then on.
alter table public.market_orders add column if not exists triggered boolean not null default false;
-- The period's T-bill return, compounded daily the way cash accrues (for Sharpe).
alter table public.market_period_results add column if not exists rf_return numeric null;

-- ---------------------------------------------------------------------------
-- Rounding exactly as everywhere else: through numeric (15 significant digits,
-- half away from zero). MIRRORS rnd() in engine.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_round(p_x double precision, p_dp int)
returns double precision language sql immutable set search_path = public, pg_temp as $$
  select round(p_x::numeric, p_dp)::double precision;
$$;

-- ---------------------------------------------------------------------------
-- Does a resting order fill on this bar, and at what price? MIRRORS
-- evaluateOrder in engine.ts. Limit fills are never worse than the limit and
-- pay no spread; stop fills pay half the spread; a gap through a stop fills at
-- the open; a stop-limit triggers at its stop and then acts as a limit.
-- ---------------------------------------------------------------------------
create or replace function public._trading_trigger(
  p_side text, p_type text, p_triggered boolean,
  p_o double precision, p_h double precision, p_l double precision,
  p_lim double precision, p_stop double precision, p_spread double precision,
  out fill boolean, out px double precision, out triggered boolean)
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_up boolean := p_side in ('buy', 'buy_to_cover');
  v_s2 double precision := p_spread / 2;
  v_t  double precision;
begin
  fill := false; px := 0; triggered := p_triggered;
  if p_type = 'limit' or (p_type = 'stop_limit' and p_triggered) then
    if v_up and p_l <= p_lim then
      fill := true; px := public._trading_round(least(p_o, p_lim), 4);
    elsif not v_up and p_h >= p_lim then
      fill := true; px := public._trading_round(greatest(p_o, p_lim), 4);
    end if;
  elsif p_type = 'stop' then
    if v_up and p_h >= p_stop then
      fill := true; triggered := true; px := public._trading_round(greatest(p_o, p_stop) * (1 + v_s2), 4);
    elsif not v_up and p_l <= p_stop then
      fill := true; triggered := true; px := public._trading_round(least(p_o, p_stop) * (1 - v_s2), 4);
    end if;
  elsif p_type = 'stop_limit' then
    if v_up and p_h >= p_stop then
      triggered := true;
      v_t := greatest(p_o, p_stop);
      if v_t <= p_lim then fill := true; px := public._trading_round(v_t, 4);
      elsif p_l <= p_lim then fill := true; px := public._trading_round(p_lim, 4);
      end if;
    elsif not v_up and p_l <= p_stop then
      triggered := true;
      v_t := least(p_o, p_stop);
      if v_t >= p_lim then fill := true; px := public._trading_round(v_t, 4);
      elsif p_h >= p_lim then fill := true; px := public._trading_round(p_lim, 4);
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- One trade on one position: average cost, realized P&L on the part closed.
-- MIRRORS applyTrade in engine.ts.
-- ---------------------------------------------------------------------------
create or replace function public._trading_apply(
  p_q double precision, p_cost double precision, p_realized double precision,
  p_side text, p_qty double precision, p_px double precision,
  out q double precision, out cost double precision, out realized double precision,
  out realized_delta double precision, out cash_delta double precision, out notional double precision)
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_out double precision;
begin
  notional := public._trading_round(p_qty * p_px, 6);
  q := p_q; cost := p_cost; realized_delta := 0;
  if p_side = 'buy' then
    q := q + p_qty; cost := public._trading_round(cost + notional, 6); cash_delta := -notional;
  elsif p_side = 'sell' then
    v_out := public._trading_round(cost * (p_qty / q), 6);
    realized_delta := public._trading_round(notional - v_out, 6);
    q := q - p_qty; cost := public._trading_round(cost - v_out, 6); cash_delta := notional;
  elsif p_side = 'sell_short' then
    q := q - p_qty; cost := public._trading_round(cost - notional, 6); cash_delta := notional;
  else
    v_out := public._trading_round(cost * (p_qty / -q), 6);
    realized_delta := public._trading_round(-v_out - notional, 6);
    q := q + p_qty; cost := public._trading_round(cost - v_out, 6); cash_delta := -notional;
  end if;
  q := public._trading_round(q, 6);
  if abs(q) < 1e-9 then q := 0; cost := 0; end if;
  realized := public._trading_round(p_realized + realized_delta, 6);
end;
$$;

-- Can the account carry these positions? Equity − im × gross ≥ 0 at the marks.
create or replace function public._trading_margin_ok(p_cash double precision, p_q double precision[],
                                                    p_ref double precision[], p_im double precision)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_l double precision := 0;
  v_s double precision := 0;
  v_v double precision;
  k int;
begin
  for k in 1 .. coalesce(array_length(p_q, 1), 0) loop
    if p_q[k] <> 0 then
      v_v := p_q[k] * coalesce(p_ref[k], 0);
      if v_v > 0 then v_l := v_l + v_v; else v_s := v_s - v_v; end if;
    end if;
  end loop;
  return p_cash + v_l - v_s - p_im * (v_l + v_s) >= -0.005;
end;
$$;

-- =============================================================================
-- _resolve_trading — the engine.
-- =============================================================================
create or replace function public._resolve_trading(p_session_id uuid, p_round_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.sessions%rowtype;
  v_round   public.rounds%rowtype;
  v_ms      public.market_session_secrets%rowtype;
  v_cfg     jsonb;
  v_rn      int;
  v_jan1    int;
  v_from    int;
  v_to      int;
  v_prev    int;
  v_first   int;
  v_last    int;
  v_days    int[];
  v_n       int;
  v_ns      int;
  v_ppy     int;
  -- config
  c_spread double precision;
  c_s2     double precision;
  c_comm   double precision;
  c_im     double precision;
  c_ml     double precision;
  c_mshort double precision;
  c_bf     double precision;
  c_bs     double precision;
  -- market, loaded once: slot index k = slot + 1, day index i = 1..n
  m_p0     double precision[];
  m_has    boolean[];
  m_o      double precision[];
  m_h      double precision[];
  m_l      double precision[];
  m_c      double precision[];
  m_ref    double precision[];   -- mark at day i's close, (k-1)*n + i
  m_first  int[];                -- calendar offset (day - v_prev) -> first trading index on/after it
  dl_k     int[] := '{}';
  dl_idx   int[] := '{}';
  dl_val   double precision[] := '{}';
  e_idx    int[] := '{}';
  e_k      int[] := '{}';
  e_kind   text[] := '{}';
  e_amt    double precision[] := '{}';
  r_rate   double precision[];
  r_dt     int[];
  v_rf     double precision := 0;
  v_growth double precision := 1;
  v_idx_ret numeric;
  v_movers jsonb := '[]'::jsonb;
  v_heads  jsonb := '[]'::jsonb;
  -- per player
  pl        record;
  pr        record;
  t         record;
  trg       record;
  q         double precision[];
  cb        double precision[];
  rz        double precision[];
  touched   boolean[];
  held      int[];
  v_cash    double precision;
  v_peak    double precision;
  v_maxdd   double precision;
  v_frozen  boolean;
  v_daily   double precision[];
  v_traded  double precision;
  v_expo    double precision;
  v_int     double precision;
  v_mint    double precision;
  v_bfee    double precision;
  v_nlv     double precision;
  v_lmv     double precision;
  v_smv     double precision;
  v_val     double precision;
  v_x       double precision;
  v_y       double precision;
  v_z       double precision;
  v_r       double precision;
  v_big     int;
  v_bigv    double precision;
  o_id      uuid[];
  o_k       int[];
  o_side    text[];
  o_type    text[];
  o_qty     double precision[];
  o_not     double precision[];
  o_lim     double precision[];
  o_stop    double precision[];
  o_tif     text[];
  o_trig0   boolean[];
  o_trig    boolean[];
  o_st      text[];
  o_reason  text[];
  o_n       int;
  v_qty     double precision;
  v_px      double precision;
  v_reject  text;
  v_ref     double precision[];
  v_q2      double precision[];
  v_fill    uuid;
  v_side    text;
  v_kind    text;
  v_amt     double precision;
  v_day     int;
  v_gd      int;
  v_nlvs    double precision[];
  v_rfs     double precision[];
  v_n0      double precision;
  v_xs      double precision[];
  v_mean    double precision;
  v_sd      double precision;
  v_sharpe  double precision;
  r         record;
  i         int;
  j         int;
  k         int;
  e         int;
  ph        int;
begin
  select * into v_round from public.rounds where id = p_round_id;
  select * into v_session from public.sessions where id = p_session_id;
  select * into v_ms from public.market_session_secrets where session_id = p_session_id;
  if not found then raise exception 'trading session is missing its market window'; end if;
  v_cfg := v_session.config;
  v_rn := v_round.round_number;

  c_spread := coalesce((v_cfg->>'spread')::double precision, 0.001);
  c_s2     := c_spread / 2;
  c_comm   := coalesce((v_cfg->>'commission')::double precision, 0);
  c_im     := case when coalesce((v_cfg->>'margin_enabled')::boolean, false)
                   then coalesce((v_cfg->>'initial_margin')::double precision, 0.5) else 1 end;
  c_ml     := coalesce((v_cfg->>'maint_long')::double precision, 0.25);
  c_mshort := coalesce((v_cfg->>'maint_short')::double precision, 0.30);
  c_bf     := coalesce((v_cfg->>'borrow_fee')::double precision, 0.003);
  c_bs     := coalesce((v_cfg->>'borrow_spread')::double precision, 0.05);
  v_ppy    := case v_cfg->>'period' when 'year' then 1 when 'half' then 2 when 'quarter' then 4
                                    when 'month' then 12 else 52 end;

  -- ---- the period's days ---------------------------------------------------
  v_jan1 := public._mkt_day(make_date(v_ms.start_year, 1, 1));
  select x.from_day, x.to_day into v_from, v_to
    from public._trading_period_range(v_ms.start_year, v_cfg->>'period', v_rn) x;
  v_prev := public._trading_last_revealed_day(p_session_id);
  select coalesce(array_agg(c.day order by c.day), '{}') into v_days
    from public.market_calendar c where c.day between v_from and v_to and c.day > v_prev;
  v_n := coalesce(array_length(v_days, 1), 0);
  v_first := v_days[1];
  v_last  := v_days[v_n];
  select coalesce(max(si.slot), 0) + 1 into v_ns from public.session_instruments si where si.session_id = p_session_id;

  -- ---- market data, once --------------------------------------------------
  m_p0  := array_fill(null::double precision, array[v_ns]);
  m_has := array_fill(false, array[greatest(v_ns * v_n, 1)]);
  m_o   := array_fill(null::double precision, array[greatest(v_ns * v_n, 1)]);
  m_h   := m_o; m_l := m_o; m_c := m_o; m_ref := m_o;
  m_first := array_fill(null::int, array[greatest(coalesce(v_last, v_prev) - v_prev, 1)]);
  if v_n > 0 then
    for i in 1 .. v_n loop m_first[v_days[i] - v_prev] := i; end loop;
    for j in reverse (v_last - v_prev - 1) .. 1 loop
      if m_first[j] is null then m_first[j] := m_first[j + 1]; end if;
    end loop;
  end if;

  for r in
    select b.slot, b.day, b.o, b.h, b.l, b.c
      from public._session_bars(p_session_id, v_prev - 40, coalesce(v_last, v_prev)) b
     order by b.slot, b.day
  loop
    k := r.slot + 1;
    if r.day <= v_prev then
      m_p0[k] := public._trading_round(r.c, 4);
    else
      i := m_first[r.day - v_prev];
      j := (k - 1) * v_n + i;
      m_has[j] := true;
      m_o[j] := public._trading_round(r.o, 4);
      m_h[j] := public._trading_round(r.h, 4);
      m_l[j] := public._trading_round(r.l, 4);
      m_c[j] := public._trading_round(r.c, 4);
    end if;
  end loop;

  -- delistings that settle in (or before) this period
  for r in
    select s.slot, i2.delist_day, public._trading_round(i2.delist_value * s.price_scale, 4) as val
      from public.session_instrument_secrets s
      join public.market_instruments i2 on i2.id = s.instrument_id
     where s.session_id = p_session_id and i2.delist_day is not null and i2.delist_day <= coalesce(v_last, v_prev)
     order by s.slot
  loop
    if v_n = 0 then continue; end if;
    dl_k   := dl_k || (r.slot + 1);
    dl_idx := dl_idx || coalesce(case when r.delist_day <= v_prev then 1 else m_first[r.delist_day - v_prev] end, 1);
    dl_val := dl_val || r.val;
  end loop;

  -- marks at each close: the close if there was a bar, else carried; a
  -- delisted slot is marked at its settlement value from its settlement day
  if v_n > 0 then
    for k in 1 .. v_ns loop
      v_val := m_p0[k];
      for i in 1 .. v_n loop
        j := (k - 1) * v_n + i;
        if m_has[j] then v_val := m_c[j]; end if;
        for e in 1 .. coalesce(array_length(dl_k, 1), 0) loop
          if dl_k[e] = k and i >= dl_idx[e] then v_val := dl_val[e]; end if;
        end loop;
        m_ref[j] := v_val;
      end loop;
    end loop;
  end if;

  -- dividends and distributions, by the trading day they are paid on
  for r in
    select s.slot, a.day, a.kind, a.amount * s.price_scale as amt
      from public.session_instrument_secrets s
      join public.market_corporate_actions a on a.instrument_id = s.instrument_id
     where s.session_id = p_session_id and a.kind in ('dividend', 'distribution')
       and a.day > v_prev and a.day <= coalesce(v_last, v_prev)
     order by a.day, s.slot, a.kind
  loop
    e_idx  := e_idx || m_first[r.day - v_prev];
    e_k    := e_k || (r.slot + 1);
    e_kind := e_kind || r.kind;
    e_amt  := e_amt || r.amt;
  end loop;

  -- the T-bill rate in force over each night, and the period's compounded return
  r_rate := array_fill(0::double precision, array[greatest(v_n, 1)]);
  r_dt   := array_fill(0, array[greatest(v_n, 1)]);
  for i in 1 .. v_n loop
    v_day := case when i = 1 then v_prev else v_days[i - 1] end;
    select coalesce((select mr.tbill from public.market_rates mr where mr.day <= v_day
                      order by mr.day desc limit 1), 0) into v_r;
    r_rate[i] := v_r;
    r_dt[i] := v_days[i] - v_day;
    v_growth := v_growth * (1 + v_r * r_dt[i] / 365);
  end loop;
  v_rf := public._trading_round(v_growth - 1, 10);

  -- ---- the period summary (as the Phase 2 stub; plus rf) --------------------
  if v_last is not null then
    with b as (select * from public._session_bars(p_session_id, v_prev - 40, v_last)),
    p0 as (select distinct on (b.slot) b.slot, b.c from b where b.day <= v_prev order by b.slot, b.day desc),
    p1 as (select distinct on (b.slot) b.slot, b.c from b order by b.slot, b.day desc),
    rets as (select p1.slot, (p1.c / p0.c - 1)::numeric as ret from p0 join p1 using (slot) where p0.c > 0),
    eq as (select rets.* from rets join public.session_instruments si
             on si.session_id = p_session_id and si.slot = rets.slot and si.kind = 'equity'),
    top as (select * from eq order by ret desc limit 3),
    bot as (select * from eq order by ret asc limit 3)
    select (select round(x.ret, 6) from rets x where x.slot = 0),
           coalesce((select jsonb_agg(jsonb_build_object('slot', m.slot, 'ret', round(m.ret, 6)) order by m.ret desc)
                       from (select * from top union select * from bot) m), '[]'::jsonb)
      into v_idx_ret, v_movers;

    if coalesce((v_cfg->>'headlines')::boolean, true) then
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
                                            index_return, movers, headlines, rf_return)
  values (p_session_id, v_rn, v_first - v_jan1, v_last - v_jan1, v_idx_ret, v_movers, v_heads, v_rf)
  on conflict (session_id, round_number) do update
    set first_game_day = excluded.first_game_day, last_game_day = excluded.last_game_day,
        index_return = excluded.index_return, movers = excluded.movers,
        headlines = excluded.headlines, rf_return = excluded.rf_return;

  -- =========================================================================
  -- Each account, alone.
  -- =========================================================================
  for pl in
    select p.id as player_id, a.cash, a.nlv, a.peak_nlv, a.max_drawdown, a.frozen
      from public.players p
      join public.market_accounts a on a.player_id = p.id
     where p.session_id = p_session_id and p.is_active and not p.is_bot
     order by p.joined_at, p.id
  loop
    q := array_fill(0::double precision, array[v_ns]);
    cb := q; rz := q;
    touched := array_fill(false, array[v_ns]);
    for pr in select mp.slot, mp.quantity, mp.cost_basis, mp.realized_pnl from public.market_positions mp
               where mp.player_id = pl.player_id loop
      q[pr.slot + 1] := pr.quantity; cb[pr.slot + 1] := pr.cost_basis; rz[pr.slot + 1] := pr.realized_pnl;
    end loop;
    select coalesce(array_agg(k2 order by k2), '{}') into held
      from generate_series(1, v_ns) k2 where q[k2] <> 0;
    v_cash := pl.cash; v_peak := pl.peak_nlv; v_maxdd := pl.max_drawdown; v_frozen := pl.frozen;
    v_daily := array_fill(0::double precision, array[greatest(v_n, 1)]);
    v_traded := 0; v_int := 0; v_mint := 0; v_bfee := 0;

    select coalesce(array_agg(o.id order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.slot + 1 order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.side order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.order_type order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.quantity::double precision order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.notional::double precision order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.limit_price::double precision order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.stop_price::double precision order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.tif order by o.placed_at, o.id), '{}'),
           coalesce(array_agg(o.triggered order by o.placed_at, o.id), '{}')
      into o_id, o_k, o_side, o_type, o_qty, o_not, o_lim, o_stop, o_tif, o_trig0
      from public.market_orders o
     where o.player_id = pl.player_id and o.status = 'open';
    o_n := coalesce(array_length(o_id, 1), 0);
    o_trig := o_trig0;
    o_st := array_fill('open'::text, array[greatest(o_n, 1)]);
    o_reason := array_fill(null::text, array[greatest(o_n, 1)]);

    -- phase 0 = market orders before day 1; phase i = trading day i
    for ph in 0 .. v_n loop
      i := ph;
      v_gd := case when ph = 0 then coalesce(v_first, v_prev) - v_jan1 else v_days[ph] - v_jan1 end;

      if ph > 0 then
        -- ---- the open: cash to holders ------------------------------------
        for e in 1 .. coalesce(array_length(e_idx, 1), 0) loop
          if e_idx[e] = i and q[e_k[e]] <> 0 then
            v_amt := public._trading_round(q[e_k[e]] * e_amt[e], 6);
            v_cash := public._trading_round(v_cash + v_amt, 6);
            insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot)
            values (p_session_id, pl.player_id, v_rn, v_gd, e_kind[e], v_amt, e_k[e] - 1);
          end if;
        end loop;
      end if;

      -- ---- orders: market orders in phase 0, resting ones on each day --------
      for j in 1 .. o_n loop
        continue when o_st[j] <> 'open';
        k := o_k[j];
        if ph = 0 then
          continue when o_type[j] <> 'market';
          if m_p0[k] is null then
            o_st[j] := 'rejected'; o_reason[j] := 'no price for that instrument'; continue;
          end if;
          v_px := public._trading_round(m_p0[k] * case when o_side[j] in ('buy', 'buy_to_cover')
                                                      then 1 + c_s2 else 1 - c_s2 end, 4);
        else
          continue when o_type[j] = 'market' or not m_has[(k - 1) * v_n + i];
          select * into trg from public._trading_trigger(o_side[j], o_type[j], o_trig[j],
            m_o[(k - 1) * v_n + i], m_h[(k - 1) * v_n + i], m_l[(k - 1) * v_n + i],
            o_lim[j], o_stop[j], c_spread);
          o_trig[j] := trg.triggered;
          continue when not trg.fill;
          v_px := trg.px;
        end if;

        -- the fill-time checks (MIRRORS tryFill in engine.ts)
        v_reject := null;
        v_qty := coalesce(o_qty[j], public._trading_round(o_not[j] / v_px, 6));
        if not (v_qty > 0) then v_reject := 'that dollar amount buys no shares';
        elsif o_side[j] in ('buy', 'sell_short') and v_frozen then v_reject := 'your account was frozen';
        elsif o_side[j] = 'buy' and q[k] < 0 then v_reject := 'you were short this one: cover first';
        elsif o_side[j] = 'sell_short' and q[k] > 0 then v_reject := 'you owned this one: sell first';
        elsif o_side[j] = 'sell' and v_qty > q[k] + 5e-7 then v_reject := 'you no longer held enough shares';
        elsif o_side[j] = 'buy_to_cover' and v_qty > -q[k] + 5e-7 then
          v_reject := 'you were no longer short that many shares';
        end if;
        if v_reject is null then
          if o_side[j] = 'sell' then v_qty := least(v_qty, q[k]); end if;
          if o_side[j] = 'buy_to_cover' then v_qty := least(v_qty, -q[k]); end if;
          if o_side[j] in ('buy', 'sell_short') then
            select * into t from public._trading_apply(q[k], cb[k], rz[k], o_side[j], v_qty, v_px);
            v_q2 := q; v_q2[k] := t.q;
            if ph <= 1 then v_ref := m_p0;
            else v_ref := array(select m_ref[(k2 - 1) * v_n + i - 1] from generate_series(1, v_ns) k2);
            end if;
            v_ref[k] := coalesce(v_ref[k], v_px);
            if not public._trading_margin_ok(public._trading_round(v_cash + t.cash_delta - c_comm, 6),
                                             v_q2, v_ref, c_im) then
              v_reject := 'not enough buying power when it filled';
            end if;
          end if;
        end if;
        if v_reject is not null then
          o_st[j] := 'rejected'; o_reason[j] := v_reject; continue;
        end if;

        -- the fill
        select * into t from public._trading_apply(q[k], cb[k], rz[k], o_side[j], v_qty, v_px);
        q[k] := t.q; cb[k] := t.cost; rz[k] := t.realized; touched[k] := true;
        v_cash := public._trading_round(v_cash + t.cash_delta - c_comm, 6);
        insert into public.market_fills (order_id, session_id, player_id, round_number, game_day, slot, side,
                                         quantity, price, notional, commission, reason)
        values (o_id[j], p_session_id, pl.player_id, v_rn, v_gd, k - 1, o_side[j], v_qty, v_px, t.notional,
                c_comm, 'order')
        returning id into v_fill;
        insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot, fill_id)
        values (p_session_id, pl.player_id, v_rn, v_gd, 'trade', t.cash_delta, k - 1, v_fill);
        if c_comm > 0 then
          insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot, fill_id)
          values (p_session_id, pl.player_id, v_rn, v_gd, 'commission', -c_comm, k - 1, v_fill);
        end if;
        v_traded := public._trading_round(v_traded + t.notional, 6);
        o_st[j] := 'filled';
        select coalesce(array_agg(k2 order by k2), '{}') into held
          from generate_series(1, v_ns) k2 where q[k2] <> 0;
      end loop;

      if ph = 0 then
        v_expo := 0;
        foreach k in array held loop v_expo := v_expo + abs(q[k]) * m_p0[k]; end loop;
        v_expo := public._trading_round(v_expo, 6);
        continue;
      end if;

      -- ---- the close: delistings settle ------------------------------------
      for e in 1 .. coalesce(array_length(dl_k, 1), 0) loop
        continue when i < dl_idx[e];
        k := dl_k[e];
        if q[k] <> 0 then
          v_side := case when q[k] > 0 then 'sell' else 'buy_to_cover' end;
          v_qty := abs(q[k]);
          select * into t from public._trading_apply(q[k], cb[k], rz[k], v_side, v_qty, dl_val[e]);
          q[k] := t.q; cb[k] := t.cost; rz[k] := t.realized; touched[k] := true;
          v_cash := public._trading_round(v_cash + t.cash_delta, 6);
          insert into public.market_fills (order_id, session_id, player_id, round_number, game_day, slot, side,
                                           quantity, price, notional, commission, reason)
          values (null, p_session_id, pl.player_id, v_rn, v_gd, k - 1, v_side, v_qty, dl_val[e], t.notional, 0,
                  'delisting')
          returning id into v_fill;
          insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot, fill_id)
          values (p_session_id, pl.player_id, v_rn, v_gd, 'delisting', t.cash_delta, k - 1, v_fill);
          v_traded := public._trading_round(v_traded + t.notional, 6);
          select coalesce(array_agg(k2 order by k2), '{}') into held
            from generate_series(1, v_ns) k2 where q[k2] <> 0;
        end if;
        for j in 1 .. o_n loop
          if o_st[j] = 'open' and o_k[j] = k then
            o_st[j] := 'canceled'; o_reason[j] := 'the company stopped trading';
          end if;
        end loop;
      end loop;

      -- ---- interest, margin interest, borrow fee -----------------------------
      v_lmv := 0; v_smv := 0;
      foreach k in array held loop
        v_val := q[k] * m_ref[(k - 1) * v_n + i];
        if v_val > 0 then v_lmv := v_lmv + v_val; else v_smv := v_smv - v_val; end if;
      end loop;
      v_x := case when v_cash - v_smv > 0
                  then round(((v_cash - v_smv) * r_rate[i] * r_dt[i] / 365)::numeric, 6)::double precision else 0 end;
      v_y := case when v_cash < 0
                  then round((v_cash * (r_rate[i] + c_bs) * r_dt[i] / 365)::numeric, 6)::double precision else 0 end;
      v_z := case when v_smv > 0
                  then round((-v_smv * c_bf * r_dt[i] / 365)::numeric, 6)::double precision else 0 end;
      v_cash := round((v_cash + v_x + v_y + v_z)::numeric, 6)::double precision;
      v_int := round((v_int + v_x)::numeric, 6)::double precision;
      v_mint := round((v_mint + v_y)::numeric, 6)::double precision;
      v_bfee := round((v_bfee + v_z)::numeric, 6)::double precision;

      -- ---- maintenance: liquidate the largest position until the account complies
      loop
        exit when v_cash + v_lmv - v_smv >= c_ml * v_lmv + c_mshort * v_smv - 1e-9;
        exit when cardinality(held) = 0;
        v_big := held[1];
        v_bigv := abs(q[v_big]) * m_ref[(v_big - 1) * v_n + i];
        foreach k in array held loop
          if abs(q[k]) * m_ref[(k - 1) * v_n + i] > v_bigv then
            v_big := k; v_bigv := abs(q[k]) * m_ref[(k - 1) * v_n + i];
          end if;
        end loop;
        k := v_big;
        v_side := case when q[k] > 0 then 'sell' else 'buy_to_cover' end;
        v_qty := abs(q[k]);
        v_px := public._trading_round(m_ref[(k - 1) * v_n + i] * case when q[k] > 0 then 1 - c_s2 else 1 + c_s2 end, 4);
        select * into t from public._trading_apply(q[k], cb[k], rz[k], v_side, v_qty, v_px);
        q[k] := t.q; cb[k] := t.cost; rz[k] := t.realized; touched[k] := true;
        v_cash := public._trading_round(v_cash + t.cash_delta - c_comm, 6);
        insert into public.market_fills (order_id, session_id, player_id, round_number, game_day, slot, side,
                                         quantity, price, notional, commission, reason)
        values (null, p_session_id, pl.player_id, v_rn, v_gd, k - 1, v_side, v_qty, v_px, t.notional, c_comm,
                'margin_call')
        returning id into v_fill;
        insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot, fill_id, note)
        values (p_session_id, pl.player_id, v_rn, v_gd, 'forced_liquidation', t.cash_delta, k - 1, v_fill,
                'margin call: the account fell below its maintenance requirement at the close');
        if c_comm > 0 then
          insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount, slot, fill_id)
          values (p_session_id, pl.player_id, v_rn, v_gd, 'commission', -c_comm, k - 1, v_fill);
        end if;
        v_traded := public._trading_round(v_traded + t.notional, 6);
        select coalesce(array_agg(k2 order by k2), '{}') into held
          from generate_series(1, v_ns) k2 where q[k2] <> 0;
        v_lmv := 0; v_smv := 0;
        foreach k in array held loop
          v_val := q[k] * m_ref[(k - 1) * v_n + i];
          if v_val > 0 then v_lmv := v_lmv + v_val; else v_smv := v_smv - v_val; end if;
        end loop;
      end loop;

      -- ---- the day's value ------------------------------------------------
      v_nlv := v_cash + v_lmv - v_smv;
      v_daily[i] := v_nlv;
      if v_nlv > v_peak then v_peak := v_nlv; end if;
      if v_peak > 0 and least(1, (v_peak - v_nlv) / v_peak) > v_maxdd then
        v_maxdd := least(1, (v_peak - v_nlv) / v_peak);
      end if;
      if v_nlv <= 0 then v_frozen := true; end if;
    end loop;

    -- ---- this-round orders still open expire -----------------------------
    for j in 1 .. o_n loop
      if o_st[j] = 'open' and o_tif[j] = 'round' then o_st[j] := 'expired'; end if;
    end loop;

    -- ---- write the account ---------------------------------------------------
    v_lmv := 0; v_smv := 0;
    foreach k in array held loop
      v_val := q[k] * case when v_n > 0 then m_ref[(k - 1) * v_n + v_n] else m_p0[k] end;
      if v_val > 0 then v_lmv := v_lmv + v_val; else v_smv := v_smv - v_val; end if;
    end loop;
    v_nlv := public._trading_round(v_cash + v_lmv - v_smv, 6);
    v_day := coalesce(v_last, v_prev) - v_jan1;

    if v_int <> 0 then
      insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount)
      values (p_session_id, pl.player_id, v_rn, v_day, 'interest', v_int);
    end if;
    if v_mint <> 0 then
      insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount)
      values (p_session_id, pl.player_id, v_rn, v_day, 'margin_interest', v_mint);
    end if;
    if v_bfee <> 0 then
      insert into public.market_ledger (session_id, player_id, round_number, game_day, kind, amount)
      values (p_session_id, pl.player_id, v_rn, v_day, 'borrow_fee', v_bfee);
    end if;

    for j in 1 .. o_n loop
      if o_st[j] <> 'open' or o_trig[j] is distinct from o_trig0[j] then
        update public.market_orders
           set status = o_st[j], reject_reason = o_reason[j], triggered = o_trig[j],
               reserved = case when o_st[j] = 'open' then reserved else 0 end,
               closed_at = case when o_st[j] = 'open' then null else now() end
         where id = o_id[j];
      end if;
    end loop;

    for k in 1 .. v_ns loop
      continue when not touched[k];
      insert into public.market_positions (player_id, session_id, slot, quantity, cost_basis, realized_pnl, updated_at)
      values (pl.player_id, p_session_id, k - 1, round(q[k]::numeric, 6), round(cb[k]::numeric, 6),
              round(rz[k]::numeric, 6), now())
      on conflict (player_id, slot) do update
        set quantity = excluded.quantity, cost_basis = excluded.cost_basis,
            realized_pnl = excluded.realized_pnl, updated_at = now();
    end loop;

    insert into public.market_account_rounds (player_id, session_id, round_number, nlv_start, nlv_end, daily_nlv, traded)
    values (pl.player_id, p_session_id, v_rn, pl.nlv, v_nlv,
            case when v_n > 0 then v_daily::real[] else '{}'::real[] end, round(v_traded::numeric, 6))
    on conflict (player_id, round_number) do update
      set nlv_start = excluded.nlv_start, nlv_end = excluded.nlv_end,
          daily_nlv = excluded.daily_nlv, traded = excluded.traded;

    -- Sharpe over every round so far (MIRRORS annualizedSharpe in stats.ts)
    select array_agg(ar.nlv_end::double precision order by ar.round_number),
           array_agg(coalesce(prr.rf_return, 0)::double precision order by ar.round_number),
           (array_agg(ar.nlv_start::double precision order by ar.round_number))[1]
      into v_nlvs, v_rfs, v_n0
      from public.market_account_rounds ar
      left join public.market_period_results prr
        on prr.session_id = ar.session_id and prr.round_number = ar.round_number
     where ar.player_id = pl.player_id;
    v_xs := '{}';
    for e in 1 .. coalesce(array_length(v_nlvs, 1), 0) loop
      v_val := case when e = 1 then v_n0 else v_nlvs[e - 1] end;
      exit when not (v_val > 0);
      v_xs := v_xs || (greatest(-1, v_nlvs[e] / v_val - 1) - v_rfs[e]);
    end loop;
    v_sharpe := null;
    if cardinality(v_xs) >= 2 then
      select avg(x) into v_mean from unnest(v_xs) x;
      select sqrt(sum((x - v_mean) ^ 2) / count(*)) into v_sd from unnest(v_xs) x;  -- population sd
      if v_sd >= 1e-6 then v_sharpe := v_mean / v_sd * sqrt(v_ppy); end if;
    end if;

    update public.market_accounts
       set cash = round(v_cash::numeric, 6), nlv = v_nlv, peak_nlv = round(v_peak::numeric, 6),
           max_drawdown = round(v_maxdd::numeric, 8), frozen = v_frozen,
           sharpe = round(v_sharpe::numeric, 6), updated_at = now()
     where player_id = pl.player_id;

    insert into public.allocations (round_id, player_id, risky_amount, safe_amount, resulting_wealth)
    values (p_round_id, pl.player_id, v_expo, round((pl.nlv - v_expo)::numeric, 6), v_nlv)
    on conflict (round_id, player_id) do update
      set risky_amount = excluded.risky_amount, safe_amount = excluded.safe_amount,
          resulting_wealth = excluded.resulting_wealth;

    update public.players set current_wealth = v_nlv where id = pl.player_id;
  end loop;

  -- LAST: every client keys its reveal off this write.
  update public.rounds
     set status = 'revealed', market_outcome = null, market_return = v_idx_ret, revealed_at = now()
   where id = p_round_id;
end;
$$;

revoke all on function public._trading_round(double precision, int) from public, anon, authenticated;
revoke all on function public._trading_trigger(text, text, boolean, double precision, double precision,
  double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public._trading_apply(double precision, double precision, double precision, text,
  double precision, double precision) from public, anon, authenticated;
revoke all on function public._trading_margin_ok(double precision, double precision[], double precision[],
  double precision) from public, anon, authenticated;
revoke all on function public._resolve_trading(uuid, uuid) from public, anon, authenticated;
