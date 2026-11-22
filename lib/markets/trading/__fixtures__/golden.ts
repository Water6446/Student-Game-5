// The GOLDEN SCENARIO: one small, fully specified session that the TS engine
// (engine.test.ts) and the SQL engine (scripts/markets_selftest.sql, the
// "golden" block) must resolve to the same numbers. If you change a rule,
// both tests change together — that is the point.
//
// Two instruments at price scale 1, every weekday a trading day (the selftest's
// synthetic calendar), T-bill 8%, Jan and Feb 1990 as rounds 1 and 2.
import { toDayKey } from "../../data/normalize";
import type { Bar, EngineConfig, EngineOrder, PeriodMarket } from "../engine";

export const GOLDEN_CONFIG: EngineConfig = {
  spread: 0.002,
  commission: 1,
  im: 0.5,
  maintLong: 0.25,
  maintShort: 0.3,
  borrowFee: 0.01,
  borrowSpread: 0.05,
};

const weekdays = (from: string, to: string) => {
  const out: number[] = [];
  for (let d = toDayKey(from); d <= toDayKey(to); d++) {
    const wd = new Date(Date.UTC(1962, 0, 1) + d * 86_400_000).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
};

const bar = (o: number, h: number, l: number, c: number): Bar => ({ o, h, l, c });

/** slot -> ISO date -> bar, exactly as the SQL fixture inserts them. */
export const GOLDEN_BARS: Record<number, Record<string, Bar>> = {
  1: {
    "1989-12-29": bar(50, 50, 50, 50),
    "1990-01-02": bar(50.2, 50.6, 49.9, 50.4),
    "1990-01-03": bar(50.9, 51.8, 50.7, 51.6),
    "1990-01-10": bar(51, 51.2, 50.5, 50.9),
    "1990-01-15": bar(47, 47.5, 46.5, 47.2),
    "1990-02-05": bar(46, 46.5, 45, 45.5),
    "1990-02-12": bar(35, 36, 33, 34),
    "1990-02-20": bar(19, 19.5, 17.5, 18),
  },
  2: {
    "1989-12-29": bar(20, 20, 20, 20),
    "1990-01-02": bar(20.1, 20.3, 19.9, 20.2),
    "1990-01-22": bar(20.5, 20.6, 20.4, 20.5),
    "1990-01-25": bar(21, 22, 20.8, 21.5),
  },
};

export const GOLDEN_DIVIDENDS = [
  { slot: 1, date: "1990-01-10", amount: 0.5 },
  { slot: 2, date: "1990-01-22", amount: 0.1 },
];

function market(from: string, to: string, prevDate: string, prevClose: Record<number, number>): PeriodMarket {
  const bars: PeriodMarket["bars"] = {};
  for (const [slot, byDate] of Object.entries(GOLDEN_BARS)) {
    bars[Number(slot)] = {};
    for (const [date, b] of Object.entries(byDate)) bars[Number(slot)][toDayKey(date)] = b;
  }
  return {
    days: weekdays(from, to),
    prevDay: toDayKey(prevDate),
    prevClose,
    bars,
    cashEvents: GOLDEN_DIVIDENDS.map((d) => ({ slot: d.slot, day: toDayKey(d.date), kind: "dividend" as const, amount: d.amount })),
    delistings: {},
    rateOn: () => 0.08,
  };
}

export const GOLDEN_JAN = market("1990-01-01", "1990-01-31", "1989-12-29", { 1: 50, 2: 20 });
export const GOLDEN_FEB = market("1990-02-01", "1990-02-28", "1990-01-31", { 1: 47.2, 2: 21.5 });

const order = (id: string, o: Partial<EngineOrder>): EngineOrder => ({
  id, slot: 1, side: "buy", type: "market", quantity: null, notional: null, limit: null, stop: null,
  tif: "round", triggered: false, ...o,
});

/** Alice's orders, in submission order. */
export const GOLDEN_ORDERS_R1: EngineOrder[] = [
  order("a1", { slot: 1, side: "buy", type: "market", quantity: 100 }),
  order("a2", { slot: 2, side: "sell_short", type: "market", quantity: 50 }),
  order("a3", { slot: 1, side: "sell", type: "stop", quantity: 100, stop: 48, tif: "gtc" }),
  order("a4", { slot: 2, side: "buy_to_cover", type: "limit", quantity: 50, limit: 19 }),
  order("a5", { slot: 1, side: "buy", type: "limit", quantity: 10, limit: 40 }),
  order("a6", { slot: 1, side: "buy", type: "stop_limit", quantity: 20, stop: 51, limit: 51.5 }),
];
export const GOLDEN_ORDERS_R2: EngineOrder[] = [
  order("b1", { slot: 2, side: "buy_to_cover", type: "market", quantity: 50 }),
  order("b2", { slot: 1, side: "buy", type: "market", quantity: 3000 }),
];
