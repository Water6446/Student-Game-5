// Behaviour metrics for the research export (docs/PAPER_TRADING.md §8.1, Q14).
// Pure: everything is derived from export_research_data's tables and events,
// so a researcher can recompute any number from the CSVs.
//
// Holdings are rebuilt from fills (every change to a position is a fill:
// orders, margin calls and delisting settlements) at average cost, and valued
// at each period's closing prices. "Round r's decisions" are the orders placed
// while round r was open; they were made at the close of round r − 1.

import type { TradingPeriod } from "../game/types";
import { annualTurnover } from "../markets/trading/stats";
import type { ExportEvent, ExportFill, ResearchTables } from "./export";

export interface PlayerMetrics {
  pid: string;
  arm: string;
  /** rounds this student's account was resolved in */
  rounds: number;
  /** orders placed, of every outcome */
  orders: number;
  orders_per_round: number | null;
  /** fills of the student's own orders (not margin calls or delistings) */
  trades: number;
  trades_per_round: number | null;
  /** annual turnover: half the dollars traded over the average account value, per year */
  turnover: number | null;
  /** last value over the starting value, minus 1 */
  final_return: number | null;
  tickets_opened: number;
  /** tickets closed without an order, over tickets opened */
  abandon_rate: number | null;
  /** median ms from opening the ticket to placing the order */
  ticket_ms_median: number | null;
  /** median ms on the review screen, for orders that had one */
  review_ms_median: number | null;
  /** mean Herfindahl index of company holdings at round ends (1 = one company) */
  hhi_mean: number | null;
  /** mean share of the gross position held in the index fund at round ends */
  index_share_mean: number | null;
  /** gross position over account value at round ends: mean and max */
  leverage_mean: number | null;
  leverage_max: number | null;
  /** share of rounds that ended with a short position */
  short_rounds: number | null;
  /** share of rounds after a losing round in which the student sold (a "panic" sale) … */
  sell_after_loss: number | null;
  /** … and after a winning round, for comparison */
  sell_after_gain: number | null;
  /** share of buying, in dollars, that went into last round's top gainers ("chasing") */
  chasing: number | null;
  /** Odean's proportion of gains realized and of losses realized, on rounds with a sale */
  pgr: number | null;
  plr: number | null;
  /** PGR − PLR: above 0 is the disposition effect */
  disposition: number | null;
  /** share of purchases adding to an existing holding that added to a losing one */
  doubling_down: number | null;
}

// ---- small helpers ---------------------------------------------------------------

export function median(xs: readonly number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const mean = (xs: readonly number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** The Herfindahl index of a set of position values (by size): Σ share². */
export function hhi(values: readonly number[]): number | null {
  const abs = values.map(Math.abs).filter((v) => v > 0);
  const total = abs.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  return abs.reduce((a, v) => a + (v / total) ** 2, 0);
}

// ---- holdings from fills ------------------------------------------------------------

export interface Holding {
  /** signed shares: negative is short */
  qty: number;
  /** signed total cost of the open quantity; cost / qty is the average price */
  cost: number;
}

const SIGN: Record<ExportFill["side"], 1 | -1> = { buy: 1, buy_to_cover: 1, sell: -1, sell_short: -1 };
const EPS = 1e-9;

/** A holding after one fill, at average cost. */
export function applyFill(h: Holding, side: ExportFill["side"], quantity: number, price: number): Holding {
  const dq = SIGN[side] * quantity;
  if (Math.abs(h.qty) < EPS || Math.sign(dq) === Math.sign(h.qty)) {
    return { qty: h.qty + dq, cost: h.cost + dq * price };
  }
  // reducing: the cost leaves at the average price; any excess opens the other side
  if (Math.abs(dq) <= Math.abs(h.qty) + EPS) {
    const left = h.qty + dq;
    return Math.abs(left) < EPS ? { qty: 0, cost: 0 } : { qty: left, cost: (h.cost * left) / h.qty };
  }
  const excess = h.qty + dq;
  return { qty: excess, cost: excess * price };
}

/**
 * Each round's closing holdings, per slot: holdings[r] is after every fill of
 * rounds ≤ r (holdings[0] is empty). Fills must be in the export's order.
 */
export function holdingsByRound(fills: readonly ExportFill[], rounds: number): Map<number, Holding>[] {
  const out: Map<number, Holding>[] = [new Map()];
  let cur = new Map<number, Holding>();
  let i = 0;
  const sorted = [...fills].sort((a, b) => a.round - b.round || a.game_day - b.game_day);
  for (let r = 1; r <= rounds; r++) {
    while (i < sorted.length && sorted[i].round <= r) {
      const f = sorted[i++];
      const h = cur.get(f.slot) ?? { qty: 0, cost: 0 };
      cur.set(f.slot, applyFill(h, f.side, f.quantity, f.price));
    }
    out.push(cur);
    cur = new Map(cur);
  }
  return out;
}

// ---- the metrics ------------------------------------------------------------------

/** Closing price per round and slot. */
function closesOf(t: ResearchTables): Map<number, Map<number, number>> {
  const m = new Map<number, Map<number, number>>();
  for (const c of t.period_closes) {
    if (!m.has(c.round)) m.set(c.round, new Map());
    m.get(c.round)!.set(c.slot, c.close);
  }
  return m;
}

/** Each round's top three gaining companies (positive moves only). */
export function topGainers(t: ResearchTables, n = 3): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const r of t.rounds) {
    const up = [...(r.movers ?? [])].filter((m) => m.ret > 0).sort((a, b) => b.ret - a.ret).slice(0, n);
    out.set(r.round, new Set(up.map((m) => m.slot)));
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Every metric for one student. `events` may be empty (they are a separate download). */
export function playerMetrics(
  t: ResearchTables,
  pid: string,
  events: readonly ExportEvent[] = [],
): PlayerMetrics {
  const player = t.players.find((p) => p.pid === pid);
  const period = (t.session.config.period as TradingPeriod | undefined) ?? "quarter";
  const kinds = new Map(t.instruments.map((i) => [i.slot, i.kind]));
  const closes = closesOf(t);
  const gainers = topGainers(t);

  const acct = t.account_rounds.filter((a) => a.pid === pid).sort((a, b) => a.round - b.round);
  const byRound = new Map(acct.map((a) => [a.round, a]));
  const orders = t.orders.filter((o) => o.pid === pid);
  const fills = t.fills.filter((f) => f.pid === pid);
  const orderRound = new Map(orders.map((o) => [o.order_id, o.round]));
  const own = fills.filter((f) => f.reason === "order");
  const rounds = acct.length;
  const lastRound = acct.length ? acct[acct.length - 1].round : 0;

  // ---- activity ----
  const turnover = rounds
    ? annualTurnover(
        acct.map((a) => a.traded),
        acct.map((a) => a.nlv_start),
        period,
      )
    : null;
  const finalReturn = acct.length && acct[0].nlv_start > 0 ? acct[acct.length - 1].nlv_end / acct[0].nlv_start - 1 : null;

  // ---- the ticket ----
  const mine = events.filter((e) => e.pid === pid);
  const opened = mine.filter((e) => e.type === "ticket_open").length;
  const abandoned = mine.filter((e) => e.type === "ticket_abandon").length;
  const ticketMs = orders.map((o) => num(o.context?.ticket_ms)).filter((x): x is number => x != null);
  const reviewMs = orders.map((o) => num(o.context?.review_ms)).filter((x): x is number => x != null);

  // ---- holdings at round ends ----
  const holdings = holdingsByRound(fills, lastRound);
  const hhis: number[] = [];
  const indexShares: number[] = [];
  const levers: number[] = [];
  let shortRounds = 0;
  for (const a of acct) {
    const h = holdings[a.round] ?? new Map();
    const px = closes.get(a.round);
    const companies: number[] = [];
    let gross = 0;
    let index = 0;
    let short = false;
    for (const [slot, pos] of h) {
      if (Math.abs(pos.qty) < EPS) continue;
      const p = px?.get(slot);
      if (p == null) continue;
      const v = Math.abs(pos.qty * p);
      gross += v;
      if (kinds.get(slot) === "index_fund") index += v;
      else companies.push(v);
      if (pos.qty < 0) short = true;
    }
    const c = hhi(companies);
    if (c != null) hhis.push(c);
    if (gross > 0) indexShares.push(index / gross);
    if (a.nlv_end > 0) levers.push(gross / a.nlv_end);
    if (short) shortRounds += 1;
  }

  // ---- after a loss / after a gain ----
  const soldIn = new Set(orders.filter((o) => o.side === "sell").map((o) => o.round));
  let afterLoss = 0;
  let afterLossSold = 0;
  let afterGain = 0;
  let afterGainSold = 0;
  for (const a of acct) {
    const prev = byRound.get(a.round - 1);
    if (!prev) continue;
    const sold = soldIn.has(a.round);
    if (prev.nlv_end < prev.nlv_start) {
      afterLoss += 1;
      if (sold) afterLossSold += 1;
    } else {
      afterGain += 1;
      if (sold) afterGainSold += 1;
    }
  }

  // ---- chasing: buying last round's top gainers ----
  let buyDollars = 0;
  let chaseDollars = 0;
  for (const f of own) {
    if (f.side !== "buy" || f.order_id == null) continue;
    const r = orderRound.get(f.order_id);
    if (r == null || r < 2) continue;
    buyDollars += Math.abs(f.notional);
    if (gainers.get(r - 1)?.has(f.slot)) chaseDollars += Math.abs(f.notional);
  }

  // ---- disposition (PGR / PLR) and doubling down, at the prior close ----
  let rg = 0;
  let pg = 0;
  let rl = 0;
  let pl = 0;
  let addLoser = 0;
  let addWinner = 0;
  const soldSlots = new Map<number, Set<number>>(); // round -> slots sold by own orders placed that round
  const boughtSlots = new Map<number, Set<number>>();
  for (const f of own) {
    if (f.order_id == null) continue;
    const r = orderRound.get(f.order_id);
    if (r == null) continue;
    const bucket = f.side === "sell" ? soldSlots : f.side === "buy" ? boughtSlots : null;
    if (!bucket) continue;
    if (!bucket.has(r)) bucket.set(r, new Set());
    bucket.get(r)!.add(f.slot);
  }
  for (let r = 2; r <= lastRound; r++) {
    const before = holdings[r - 1];
    const px = closes.get(r - 1);
    if (!before || !px) continue;
    const sold = soldSlots.get(r);
    const bought = boughtSlots.get(r);
    for (const [slot, h] of before) {
      if (!(h.qty > EPS)) continue;
      const p = px.get(slot);
      if (p == null) continue;
      const avg = h.cost / h.qty;
      const gain = p > avg + EPS;
      const loss = p < avg - EPS;
      if (sold) {
        const realized = sold.has(slot);
        if (gain) realized ? rg++ : pg++;
        if (loss) realized ? rl++ : pl++;
      }
      if (bought?.has(slot)) {
        if (loss) addLoser++;
        if (gain) addWinner++;
      }
    }
  }
  const pgr = ratio(rg, rg + pg);
  const plr = ratio(rl, rl + pl);

  return {
    pid,
    arm: player?.arm ?? "",
    rounds,
    orders: orders.length,
    orders_per_round: ratio(orders.length, rounds),
    trades: own.length,
    trades_per_round: ratio(own.length, rounds),
    turnover,
    final_return: finalReturn,
    tickets_opened: opened,
    abandon_rate: ratio(abandoned, opened),
    ticket_ms_median: median(ticketMs),
    review_ms_median: median(reviewMs),
    hhi_mean: mean(hhis),
    index_share_mean: mean(indexShares),
    leverage_mean: mean(levers),
    leverage_max: levers.length ? Math.max(...levers) : null,
    short_rounds: ratio(shortRounds, rounds),
    sell_after_loss: ratio(afterLossSold, afterLoss),
    sell_after_gain: ratio(afterGainSold, afterGain),
    chasing: ratio(chaseDollars, buyDollars),
    pgr,
    plr,
    disposition: pgr != null && plr != null ? pgr - plr : null,
    doubling_down: ratio(addLoser, addLoser + addWinner),
  };
}

/** Every student's metrics, in the export's player order. */
export function allMetrics(t: ResearchTables, events: readonly ExportEvent[] = []): PlayerMetrics[] {
  return t.players.map((p) => playerMetrics(t, p.pid, events));
}

export type ArmSummary = { arm: string; players: number } & Partial<Record<SummaryKey, number | null>>;
type SummaryKey = (typeof SUMMARY_KEYS)[number];

export const SUMMARY_KEYS = [
  "orders_per_round",
  "trades_per_round",
  "turnover",
  "final_return",
  "abandon_rate",
  "ticket_ms_median",
  "review_ms_median",
  "hhi_mean",
  "leverage_mean",
  "short_rounds",
  "sell_after_loss",
  "sell_after_gain",
  "chasing",
  "disposition",
  "doubling_down",
] as const satisfies readonly (keyof PlayerMetrics)[];

/** The mean of each metric per arm, over the students it is defined for. */
export function metricsByArm(rows: readonly PlayerMetrics[]): ArmSummary[] {
  const arms = [...new Set(rows.map((r) => r.arm))].sort();
  return arms.map((arm) => {
    const group = rows.filter((r) => r.arm === arm);
    const out: ArmSummary = { arm, players: group.length };
    for (const k of SUMMARY_KEYS) {
      out[k] = mean(group.map((r) => r[k]).filter((v): v is number => typeof v === "number"));
    }
    return out;
  });
}
