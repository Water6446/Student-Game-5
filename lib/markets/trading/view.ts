// What the student screens show, derived from the rows the server sends. Pure.
// Nothing here is authoritative: the account value is the server's `nlv`, and
// buying power comes from the place_order mirror in ./orders.ts so the ticket
// says what the server will accept.

import type { TradingPeriod } from "../../game/types";
import type {
  DailyBar,
  LedgerKind,
  MarketAccountRoundRow,
  MarketAccountRow,
  MarketLedgerRow,
  MarketOrderRow,
  MarketPositionRow,
  MarketSnapshot,
  OrderSide,
  SessionInstrumentRow,
} from "../db";
import { buyingPower, freeEquity, marginParams, marksOf } from "./orders";
import type { TradingConfig } from "./config";

export type Quote = MarketSnapshot["instruments"][number];

/** An instrument's fake identity and its latest quote, side by side. */
export interface Listing extends SessionInstrumentRow {
  quote: Quote | null;
}

export function listingsOf(instruments: SessionInstrumentRow[], snapshot: MarketSnapshot | null): Listing[] {
  const bySlot = new Map((snapshot?.instruments ?? []).map((q) => [q.slot, q]));
  return [...instruments]
    .sort((a, b) => a.slot - b.slot)
    .map((i) => ({ ...i, quote: bySlot.get(i.slot) ?? null }));
}

export interface PositionView {
  slot: number;
  ticker: string;
  name: string;
  /** signed: negative is short */
  quantity: number;
  last: number | null;
  /** signed market value at the last close: negative for a short */
  value: number;
  /** signed cost of the open quantity */
  costBasis: number;
  /** cost per share, always positive */
  averageCost: number;
  unrealized: number;
  /** unrealized as a fraction of the cost, null when the cost is 0 */
  unrealizedPct: number | null;
  realized: number;
}

const EPS = 5e-7;

/** Open positions, largest by market value first. */
export function positionViews(positions: MarketPositionRow[], listings: Listing[]): PositionView[] {
  const bySlot = new Map(listings.map((l) => [l.slot, l]));
  const out: PositionView[] = [];
  for (const p of positions) {
    const q = Number(p.quantity);
    if (Math.abs(q) < EPS) continue;
    const l = bySlot.get(p.slot);
    const last = l?.quote?.last ?? null;
    const cost = Number(p.cost_basis);
    const value = last == null ? cost : q * last;
    const unrealized = value - cost;
    out.push({
      slot: p.slot,
      ticker: l?.ticker ?? `#${p.slot}`,
      name: l?.name ?? "",
      quantity: q,
      last,
      value,
      costBasis: cost,
      averageCost: Math.abs(cost / q),
      unrealized,
      unrealizedPct: cost !== 0 ? unrealized / Math.abs(cost) : null,
      realized: Number(p.realized_pnl),
    });
  }
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export interface AccountView {
  /** the server's account value at the last revealed close */
  nlv: number;
  startingCash: number;
  change: number;
  changePct: number;
  /** cash on hand; negative means a margin loan */
  cash: number;
  marginLoan: number;
  longValue: number;
  shortValue: number;
  /** held by open buy and short orders */
  reserved: number;
  /** equity not tied up by positions or open orders */
  free: number;
  /** the largest market buy the server would accept now */
  buyingPower: number;
  frozen: boolean;
  sharpe: number | null;
  maxDrawdown: number;
}

export function accountView(
  account: Pick<MarketAccountRow, "cash" | "nlv" | "frozen" | "sharpe" | "max_drawdown"> | null,
  positions: MarketPositionRow[],
  listings: Listing[],
  orders: MarketOrderRow[],
  cfg: TradingConfig,
): AccountView {
  const start = cfg.starting_wealth;
  const cash = account ? Number(account.cash) : start;
  const price = new Map(listings.map((l) => [l.slot, l.quote?.last]));
  const marks = marksOf(
    cash,
    positions.map((p) => ({ slot: p.slot, quantity: Number(p.quantity) })),
    (slot) => price.get(slot) ?? undefined,
  );
  const reserved = orders.filter((o) => o.status === "open").reduce((s, o) => s + Number(o.reserved), 0);
  const params = marginParams(cfg);
  const nlv = account ? Number(account.nlv) : start;
  return {
    nlv,
    startingCash: start,
    change: nlv - start,
    changePct: start > 0 ? nlv / start - 1 : 0,
    cash,
    marginLoan: cash < 0 ? -cash : 0,
    longValue: marks.lmv,
    shortValue: marks.smv,
    reserved,
    free: Math.max(0, freeEquity(marks, params, reserved)),
    buyingPower: account?.frozen ? 0 : buyingPower(marks, params, reserved),
    frozen: account?.frozen ?? false,
    sharpe: account?.sharpe == null ? null : Number(account.sharpe),
    maxDrawdown: account ? Number(account.max_drawdown) : 0,
  };
}

/** Shares already promised to open closing orders of this side on this slot. */
export function pendingClose(orders: MarketOrderRow[], slot: number, side: OrderSide, last: number): number {
  return orders
    .filter((o) => o.status === "open" && o.slot === slot && o.side === side)
    .reduce((s, o) => s + (o.quantity != null ? Number(o.quantity) : Number(o.notional ?? 0) / last), 0);
}

/** The order sides a ticket offers for a position, in display order. */
export function ticketSides(position: number, shortingEnabled: boolean): OrderSide[] {
  if (position > EPS) return ["buy", "sell"];
  if (position < -EPS) return ["buy_to_cover", "sell_short"];
  return shortingEnabled ? ["buy", "sell_short"] : ["buy"];
}

// ---- the account's value over time ------------------------------------------------

export interface ValuePoint {
  /** 0 = the starting cash before round 1; then each trading day's close */
  i: number;
  round: number;
  value: number;
}

/** Every trading day's account value, from the starting cash on. */
export function accountSeries(rounds: MarketAccountRoundRow[], startingCash: number): ValuePoint[] {
  const out: ValuePoint[] = [{ i: 0, round: 0, value: startingCash }];
  for (const r of [...rounds].sort((a, b) => a.round_number - b.round_number)) {
    const days = r.daily_nlv?.length ? r.daily_nlv : [Number(r.nlv_end)];
    for (const v of days) out.push({ i: out.length, round: r.round_number, value: Number(v) });
  }
  return out;
}

export type AccountRange = "period" | "year" | "all";

const MONTHS: Record<TradingPeriod, number> = { year: 12, half: 6, quarter: 3, month: 1, week: 12 / 52 };

/** The ranges worth offering once `revealed` rounds have played: never one that shows nothing new. */
export function accountRanges(period: TradingPeriod, revealed: number): AccountRange[] {
  if (revealed <= 1) return [];
  const perYear = Math.round(12 / MONTHS[period]);
  const out: AccountRange[] = ["period"];
  if (period !== "year" && revealed > perYear) out.push("year");
  out.push("all");
  return out;
}

/** The points a range covers, starting from the close before it. */
export function sliceAccountSeries(
  series: ValuePoint[],
  range: AccountRange,
  period: TradingPeriod,
  lastRound: number,
): ValuePoint[] {
  if (range === "all" || series.length === 0) return series;
  const rounds = range === "period" ? 1 : Math.round(12 / MONTHS[period]);
  const firstRound = lastRound - rounds + 1;
  const start = series.findIndex((p) => p.round >= firstRound);
  if (start <= 0) return series;
  return series.slice(start - 1);
}

// ---- price history ------------------------------------------------------------------

export type PriceRange = "1m" | "3m" | "1y" | "5y" | "all";

const RANGE_DAYS: Record<Exclude<PriceRange, "all">, number> = { "1m": 31, "3m": 92, "1y": 366, "5y": 1827 };

export const PRICE_RANGE_TEXT: Record<PriceRange, string> = {
  "1m": "1M",
  "3m": "3M",
  "1y": "1Y",
  "5y": "5Y",
  all: "All",
};

/** Ranges shorter than the history on hand, then All. */
export function priceRanges(bars: DailyBar[]): PriceRange[] {
  if (bars.length < 2) return [];
  const span = bars[bars.length - 1][0] - bars[0][0];
  const out = (Object.keys(RANGE_DAYS) as Exclude<PriceRange, "all">[]).filter((r) => RANGE_DAYS[r] < span - 15);
  return [...out, "all"];
}

export function slicePriceRange(bars: DailyBar[], range: PriceRange): DailyBar[] {
  if (range === "all" || bars.length === 0) return bars;
  const from = bars[bars.length - 1][0] - RANGE_DAYS[range];
  const start = bars.findIndex((b) => b[0] >= from);
  return start <= 0 ? bars : bars.slice(Math.max(0, start - 1));
}

/**
 * The bars of one period (game days `fromDay`..`toDay`), led by the close
 * before it, so a period's line starts where the last one ended.
 */
export function periodSlice(bars: DailyBar[], fromDay: number, toDay: number): DailyBar[] {
  const start = bars.findIndex((b) => b[0] >= fromDay);
  if (start < 0) return [];
  let end = start;
  while (end < bars.length && bars[end][0] <= toDay) end++;
  return bars.slice(Math.max(0, start - 1), end);
}

/** At most `max` points, evenly spaced, always keeping the first and last. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 3) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(points[Math.round(k * step)]);
  return out;
}

// ---- the market list --------------------------------------------------------------

export type MarketSort = "name" | "gainers" | "losers";

export function sortListings(rows: Listing[], sort: MarketSort): Listing[] {
  const change = (l: Listing) => l.quote?.change ?? null;
  const copy = [...rows];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  const dir = sort === "gainers" ? -1 : 1;
  return copy.sort((a, b) => {
    const ca = change(a);
    const cb = change(b);
    if (ca == null && cb == null) return a.name.localeCompare(b.name);
    if (ca == null) return 1;
    if (cb == null) return -1;
    return dir * (ca - cb) || a.name.localeCompare(b.name);
  });
}

/** The biggest risers and fallers among the companies (not the index fund). */
export function moversOf(rows: Listing[], n = 3): { up: Listing[]; down: Listing[] } {
  const live = rows.filter((l) => l.kind === "equity" && !l.quote?.delisted && l.quote?.change != null);
  const up = sortListings(live, "gainers").filter((l) => (l.quote?.change ?? 0) > 0).slice(0, n);
  const down = sortListings(live, "losers").filter((l) => (l.quote?.change ?? 0) < 0).slice(0, n);
  return { up, down };
}

// ---- a revealed period ------------------------------------------------------------

/** Money in and out of the account in one round, by kind, trades left out. */
export function periodCashflows(ledger: MarketLedgerRow[], round: number): { kind: LedgerKind; amount: number }[] {
  const sums = new Map<LedgerKind, number>();
  for (const e of ledger) {
    if (e.round_number !== round || e.kind === "trade" || e.kind === "forced_liquidation") continue;
    sums.set(e.kind, (sums.get(e.kind) ?? 0) + Number(e.amount));
  }
  const order: LedgerKind[] = [
    "dividend",
    "distribution",
    "interest",
    "margin_interest",
    "borrow_fee",
    "commission",
    "delisting",
  ];
  return order
    .filter((k) => sums.has(k) && Math.abs(sums.get(k) as number) >= 0.005)
    .map((k) => ({ kind: k, amount: sums.get(k) as number }));
}

/** Where a value sits in a range, 0..1, for the 52-week bar. */
export function rangePosition(value: number, low: number, high: number): number {
  if (!(high > low)) return 0.5;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}
