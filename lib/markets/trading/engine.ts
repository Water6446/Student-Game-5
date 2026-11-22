// The paper trading engine: one account through one period, day by day. Pure.
// MIRRORS _resolve_trading in supabase/migrations/0034_trading_engine.sql —
// same order of operations, same rounding points. The server is the authority;
// this exists for tests and previews. MECHANICS.md "Paper trading" explains it.
//
// Per period:
//   1. market orders fill before day 1 at the close students saw ± half the spread
//   2. each trading day, in order:
//        at the open   dividends and distributions to holders (shorts pay)
//        intraday      resting limit / stop / stop-limit orders, in submission order
//        at the close  delistings settle; interest, margin interest and the
//                      borrow fee accrue; a maintenance breach liquidates the
//                      largest position, repeatedly; the day's value is recorded
//   3. this-round orders still open expire
// Players never interact (no order book), so each account resolves alone.

import type { OrderSide, OrderType, TimeInForce } from "../db";

// ---- rounding: as Postgres does it (float8 -> numeric keeps 15 significant
// digits; numeric rounds half away from zero) -----------------------------------
export function rnd(x: number, dp: number): number {
  if (!Number.isFinite(x) || x === 0) return x === 0 ? 0 : x;
  const y = Number(x.toPrecision(15));
  const scaled = Number((Math.abs(y) * 10 ** dp).toPrecision(15));
  return (Math.sign(y) * Math.round(scaled)) / 10 ** dp;
}
export const price4 = (x: number) => rnd(x, 4);
export const money6 = (x: number) => rnd(x, 6);
export const shares6 = (x: number) => rnd(x, 6);

/** Below this a position is treated as closed. */
const EPS_QTY = 1e-9;
/** Slack when comparing a quantity to what is held. */
const QTY_SLACK = 5e-7;

export interface EngineConfig {
  spread: number;
  commission: number;
  /** initial requirement (1 = no borrowing) */
  im: number;
  maintLong: number;
  maintShort: number;
  /** annual fee on short value */
  borrowFee: number;
  /** margin loan rate = T-bill + this */
  borrowSpread: number;
}

export interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface PeriodMarket {
  /** the period's trading day keys, ascending */
  days: number[];
  /** the last trading day before the period (interest runs from it) */
  prevDay: number;
  /** the close each slot stood at before the period: what students saw */
  prevClose: Record<number, number>;
  /** slot -> day -> bar, prices already at 4 decimals (close-only bars have o=h=l=c) */
  bars: Record<number, Record<number, Bar>>;
  /** cash per share, already scaled to the session's prices */
  cashEvents: { slot: number; day: number; kind: "dividend" | "distribution"; amount: number }[];
  /** settlement value per share, scaled */
  delistings: Record<number, { day: number; value: number }>;
  /** the annual T-bill rate in force on a day */
  rateOn: (day: number) => number;
}

export interface Position {
  /** signed: negative is short */
  qty: number;
  /** signed total cost of the open quantity */
  cost: number;
  realized: number;
}

export interface AccountState {
  cash: number;
  /** value at the last revealed close, before this period */
  nlv: number;
  peak: number;
  maxDrawdown: number;
  frozen: boolean;
  positions: Record<number, Position>;
}

export interface EngineOrder {
  id: string;
  slot: number;
  side: OrderSide;
  type: OrderType;
  quantity: number | null;
  notional: number | null;
  limit: number | null;
  stop: number | null;
  tif: TimeInForce;
  triggered: boolean;
}

export type FillReason = "order" | "margin_call" | "delisting";

export interface Fill {
  orderId: string | null;
  slot: number;
  side: OrderSide;
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  day: number;
  reason: FillReason;
}

export type LedgerKind =
  | "trade"
  | "commission"
  | "dividend"
  | "distribution"
  | "interest"
  | "margin_interest"
  | "borrow_fee"
  | "forced_liquidation"
  | "delisting";

export interface LedgerEntry {
  kind: LedgerKind;
  amount: number;
  slot: number | null;
  day: number;
  /** index into `fills` for trade-related rows */
  fill: number | null;
}

export interface OrderOutcome {
  id: string;
  status: "open" | "filled" | "rejected" | "expired" | "canceled";
  triggered: boolean;
  reason: string | null;
}

export interface PeriodResult {
  account: AccountState;
  fills: Fill[];
  ledger: LedgerEntry[];
  orders: OrderOutcome[];
  /** the account's value at each trading day's close */
  dailyNlv: number[];
  /** dollars traded this period, both sides */
  traded: number;
  /** gross exposure right after the market orders, at the prices students saw */
  exposureStart: number;
  nlvStart: number;
  nlvEnd: number;
}

const buyish = (side: OrderSide) => side === "buy" || side === "buy_to_cover";

// ---- order triggers -------------------------------------------------------------
export interface TriggerResult {
  fill: boolean;
  price: number;
  triggered: boolean;
}

/**
 * Does a resting order fill on this bar, and at what price? MIRRORS
 * _trading_trigger. Limit fills are never worse than the limit and pay no
 * spread; stop fills pay half the spread; a gap through a stop fills at the
 * open. A stop-limit triggers at its stop and then behaves as a limit order.
 */
export function evaluateOrder(
  o: Pick<EngineOrder, "side" | "type" | "limit" | "stop" | "triggered">,
  bar: Bar,
  spread: number,
): TriggerResult {
  const s2 = spread / 2;
  const up = buyish(o.side);
  const limitRule = (lim: number): TriggerResult | null => {
    if (up && bar.l <= lim) return { fill: true, price: price4(Math.min(bar.o, lim)), triggered: o.triggered };
    if (!up && bar.h >= lim) return { fill: true, price: price4(Math.max(bar.o, lim)), triggered: o.triggered };
    return null;
  };
  const none: TriggerResult = { fill: false, price: 0, triggered: o.triggered };

  if (o.type === "limit") return limitRule(o.limit as number) ?? none;
  if (o.type === "stop") {
    const stop = o.stop as number;
    if (up && bar.h >= stop) return { fill: true, price: price4(Math.max(bar.o, stop) * (1 + s2)), triggered: true };
    if (!up && bar.l <= stop) return { fill: true, price: price4(Math.min(bar.o, stop) * (1 - s2)), triggered: true };
    return none;
  }
  if (o.type === "stop_limit") {
    const lim = o.limit as number;
    const stop = o.stop as number;
    if (o.triggered) return limitRule(lim) ?? none;
    if (up && bar.h >= stop) {
      const t = Math.max(bar.o, stop);
      if (t <= lim) return { fill: true, price: price4(t), triggered: true };
      if (bar.l <= lim) return { fill: true, price: price4(lim), triggered: true };
      return { fill: false, price: 0, triggered: true };
    }
    if (!up && bar.l <= stop) {
      const t = Math.min(bar.o, stop);
      if (t >= lim) return { fill: true, price: price4(t), triggered: true };
      if (bar.h >= lim) return { fill: true, price: price4(lim), triggered: true };
      return { fill: false, price: 0, triggered: true };
    }
    return none;
  }
  return none; // market orders fill before day 1, not here
}

// ---- one trade on one position --------------------------------------------------
export interface TradeResult {
  position: Position;
  /** realized P&L of the part closed */
  realized: number;
  /** cash effect before commission */
  cashDelta: number;
  notional: number;
}

/** MIRRORS _trading_apply. Average-cost accounting; realized P&L on the part closed. */
export function applyTrade(p: Position, side: OrderSide, qty: number, px: number): TradeResult {
  const notional = money6(qty * px);
  let { qty: q, cost, realized } = p;
  let r = 0;
  let cashDelta = 0;
  if (side === "buy") {
    q += qty;
    cost = money6(cost + notional);
    cashDelta = -notional;
  } else if (side === "sell") {
    const out = money6(cost * (qty / q));
    r = money6(notional - out);
    q -= qty;
    cost = money6(cost - out);
    cashDelta = notional;
  } else if (side === "sell_short") {
    q -= qty;
    cost = money6(cost - notional);
    cashDelta = notional;
  } else {
    const out = money6(cost * (qty / -q)); // negative: the short's proceeds being closed
    r = money6(-out - notional);
    q += qty;
    cost = money6(cost - out);
    cashDelta = -notional;
  }
  q = shares6(q);
  if (Math.abs(q) < EPS_QTY) {
    q = 0;
    cost = 0;
  }
  realized = money6(realized + r);
  return { position: { qty: q, cost, realized }, realized: r, cashDelta, notional };
}

// ---- the period -----------------------------------------------------------------
export function resolvePeriod(
  market: PeriodMarket,
  cfg: EngineConfig,
  start: AccountState,
  orders: EngineOrder[],
): PeriodResult {
  const s2 = cfg.spread / 2;
  let cash = start.cash;
  let peak = start.peak;
  let maxDd = start.maxDrawdown;
  let frozen = start.frozen;
  const pos: Record<number, Position> = {};
  for (const [k, v] of Object.entries(start.positions)) pos[Number(k)] = { ...v };
  const ref: Record<number, number> = { ...market.prevClose };
  const state = orders.map((o) => ({ o, status: "open" as OrderOutcome["status"], triggered: o.triggered, reason: null as string | null }));
  const fills: Fill[] = [];
  const ledger: LedgerEntry[] = [];
  const daily: number[] = [];
  let traded = 0;

  const held = () => Object.keys(pos).map(Number).filter((k) => pos[k].qty !== 0).sort((a, b) => a - b);
  const marks = () => {
    let lmv = 0;
    let smv = 0;
    for (const k of held()) {
      const v = pos[k].qty * (ref[k] ?? 0);
      if (v > 0) lmv += v;
      else smv -= v;
    }
    return { lmv, smv };
  };
  const posOf = (k: number) => (pos[k] ??= { qty: 0, cost: 0, realized: 0 });

  const record = (slot: number, side: OrderSide, qty: number, px: number, day: number, reason: FillReason,
                  orderId: string | null, commission: number): void => {
    const t = applyTrade(posOf(slot), side, qty, px);
    pos[slot] = t.position;
    cash = money6(cash + t.cashDelta - commission);
    fills.push({ orderId, slot, side, quantity: qty, price: px, notional: t.notional, commission, day, reason });
    const fi = fills.length - 1;
    const kind: LedgerKind = reason === "order" ? "trade" : reason === "margin_call" ? "forced_liquidation" : "delisting";
    ledger.push({ kind, amount: t.cashDelta, slot, day, fill: fi });
    if (commission > 0) ledger.push({ kind: "commission", amount: -commission, slot, day, fill: fi });
    traded = money6(traded + t.notional);
  };

  /** Fill an order at px if the account can take it; otherwise reject it. MIRRORS the SQL. */
  const tryFill = (st: (typeof state)[number], px: number, day: number) => {
    const o = st.o;
    const reject = (why: string) => {
      st.status = "rejected";
      st.reason = why;
    };
    let qty = o.quantity != null ? o.quantity : shares6((o.notional as number) / px);
    if (!(qty > 0)) return reject("that dollar amount buys no shares");
    const q = pos[o.slot]?.qty ?? 0;
    const opening = o.side === "buy" || o.side === "sell_short";
    if (opening && frozen) return reject("your account was frozen");
    if (o.side === "buy" && q < 0) return reject("you were short this one: cover first");
    if (o.side === "sell_short" && q > 0) return reject("you owned this one: sell first");
    if (o.side === "sell") {
      if (qty > q + QTY_SLACK) return reject("you no longer held enough shares");
      qty = Math.min(qty, q);
    }
    if (o.side === "buy_to_cover") {
      if (qty > -q + QTY_SLACK) return reject("you were no longer short that many shares");
      qty = Math.min(qty, -q);
    }
    if (opening) {
      const t = applyTrade(posOf(o.slot), o.side, qty, px);
      const cashAfter = money6(cash + t.cashDelta - cfg.commission);
      let lmv = 0;
      let smv = 0;
      for (const k of new Set([...held(), o.slot])) {
        const qq = k === o.slot ? t.position.qty : pos[k].qty;
        const v = qq * (ref[k] ?? px);
        if (v > 0) lmv += v;
        else smv -= v;
      }
      if (cashAfter + lmv - smv - cfg.im * (lmv + smv) < -0.005) {
        return reject("not enough buying power when it filled");
      }
    }
    record(o.slot, o.side, qty, px, day, "order", o.id, cfg.commission);
    st.status = "filled";
  };

  // 1. market orders, before day 1, at the close students saw
  const firstDay = market.days[0] ?? market.prevDay;
  for (const st of state) {
    if (st.o.type !== "market") continue;
    const p0 = market.prevClose[st.o.slot];
    if (p0 == null) {
      st.status = "rejected";
      st.reason = "no price for that instrument";
      continue;
    }
    tryFill(st, price4(p0 * (buyish(st.o.side) ? 1 + s2 : 1 - s2)), firstDay);
  }
  const m0 = marks();
  const exposureStart = money6(m0.lmv + m0.smv);

  let interest = 0;
  let marginInterest = 0;
  let borrowFee = 0;

  // 2. the trading days
  let prevT = market.prevDay;
  for (const d of market.days) {
    // at the open: cash to holders (ex-dates falling on a closed day count on the next open)
    for (const ev of market.cashEvents) {
      if (ev.day <= prevT || ev.day > d) continue;
      const q = pos[ev.slot]?.qty ?? 0;
      if (q === 0) continue;
      const amt = money6(q * ev.amount);
      cash = money6(cash + amt);
      ledger.push({ kind: ev.kind, amount: amt, slot: ev.slot, day: d, fill: null });
    }

    // intraday: resting orders in submission order
    for (const st of state) {
      if (st.status !== "open" || st.o.type === "market") continue;
      const bar = market.bars[st.o.slot]?.[d];
      if (!bar) continue;
      const r = evaluateOrder({ ...st.o, triggered: st.triggered }, bar, cfg.spread);
      st.triggered = r.triggered;
      if (r.fill) tryFill(st, r.price, d);
    }

    // at the close
    for (const k of Object.keys(market.bars).map(Number)) {
      const bar = market.bars[k][d];
      if (bar) ref[k] = bar.c;
    }
    for (const k of Object.keys(market.delistings).map(Number).sort((a, b) => a - b)) {
      const dl = market.delistings[k];
      if (dl.day > d) continue;
      const q = pos[k]?.qty ?? 0;
      if (q !== 0) record(k, q > 0 ? "sell" : "buy_to_cover", Math.abs(q), dl.value, d, "delisting", null, 0);
      for (const st of state) {
        if (st.status === "open" && st.o.slot === k) {
          st.status = "canceled";
          st.reason = "the company stopped trading";
        }
      }
      ref[k] = dl.value;
    }

    const dt = d - prevT;
    const r = market.rateOn(prevT);
    const { smv } = marks();
    const base = cash - smv;
    const x = base > 0 ? money6(base * r * dt / 365) : 0;
    const y = cash < 0 ? money6(cash * (r + cfg.borrowSpread) * dt / 365) : 0;
    const z = smv > 0 ? money6(-smv * cfg.borrowFee * dt / 365) : 0;
    cash = money6(cash + x + y + z);
    interest = money6(interest + x);
    marginInterest = money6(marginInterest + y);
    borrowFee = money6(borrowFee + z);

    // maintenance: liquidate the largest position at the close until the account complies
    for (;;) {
      const m = marks();
      const equity = cash + m.lmv - m.smv;
      if (equity >= cfg.maintLong * m.lmv + cfg.maintShort * m.smv - 1e-9) break;
      const ks = held();
      if (!ks.length) break;
      let big = ks[0];
      for (const k of ks) {
        if (Math.abs(pos[k].qty) * ref[k] > Math.abs(pos[big].qty) * ref[big]) big = k;
      }
      const q = pos[big].qty;
      record(big, q > 0 ? "sell" : "buy_to_cover", Math.abs(q), price4(ref[big] * (q > 0 ? 1 - s2 : 1 + s2)), d,
             "margin_call", null, cfg.commission);
    }

    const m = marks();
    const nlv = cash + m.lmv - m.smv;
    daily.push(nlv);
    if (nlv > peak) peak = nlv;
    const dd = peak > 0 ? Math.min(1, (peak - nlv) / peak) : 0;
    if (dd > maxDd) maxDd = dd;
    if (nlv <= 0) frozen = true;
    prevT = d;
  }

  const lastDay = market.days[market.days.length - 1] ?? market.prevDay;
  if (interest !== 0) ledger.push({ kind: "interest", amount: interest, slot: null, day: lastDay, fill: null });
  if (marginInterest !== 0) {
    ledger.push({ kind: "margin_interest", amount: marginInterest, slot: null, day: lastDay, fill: null });
  }
  if (borrowFee !== 0) ledger.push({ kind: "borrow_fee", amount: borrowFee, slot: null, day: lastDay, fill: null });

  // 3. this-round orders still open expire; good-till-cancelled ones carry on
  for (const st of state) {
    if (st.status === "open" && st.o.tif === "round") st.status = "expired";
  }

  const mEnd = marks();
  const nlvEnd = money6(cash + mEnd.lmv - mEnd.smv);
  return {
    account: { cash: money6(cash), nlv: nlvEnd, peak, maxDrawdown: maxDd, frozen, positions: pos },
    fills,
    ledger,
    orders: state.map((st) => ({ id: st.o.id, status: st.status, triggered: st.triggered, reason: st.reason })),
    dailyNlv: daily,
    traded,
    exposureStart,
    nlvStart: start.nlv,
    nlvEnd,
  };
}

/**
 * The period's T-bill return, compounded the way cash accrues (each trading
 * day: rate × days / 365), so an all-cash account's excess return is zero.
 * MIRRORS market_period_results.rf_return.
 */
export function periodRiskFree(market: Pick<PeriodMarket, "days" | "prevDay" | "rateOn">): number {
  let prevT = market.prevDay;
  let growth = 1;
  for (const d of market.days) {
    growth *= 1 + (market.rateOn(prevT) * (d - prevT)) / 365;
    prevT = d;
  }
  return rnd(growth - 1, 10);
}
