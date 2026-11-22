import { describe, expect, it } from "vitest";
import {
  applyTrade,
  evaluateOrder,
  periodRiskFree,
  resolvePeriod,
  rnd,
  type AccountState,
  type EngineConfig,
  type EngineOrder,
  type PeriodMarket,
} from "./engine";
import { annualizedSharpe, annualTurnover, excessReturns, maxDrawdown } from "./stats";
import {
  GOLDEN_CONFIG,
  GOLDEN_FEB,
  GOLDEN_JAN,
  GOLDEN_ORDERS_R1,
  GOLDEN_ORDERS_R2,
} from "./__fixtures__/golden";

const CFG: EngineConfig = { spread: 0.002, commission: 0, im: 0.5, maintLong: 0.25, maintShort: 0.3, borrowFee: 0, borrowSpread: 0.05 };
const fresh = (cash = 100_000): AccountState => ({ cash, nlv: cash, peak: cash, maxDrawdown: 0, frozen: false, positions: {} });
const ord = (o: Partial<EngineOrder>): EngineOrder => ({
  id: "x", slot: 1, side: "buy", type: "market", quantity: 10, notional: null, limit: null, stop: null,
  tif: "round", triggered: false, ...o,
});
/** A tiny market: day keys 1..n after prevDay 0, slot 1 only, no interest. */
const mkt = (bars: Record<number, { o: number; h: number; l: number; c: number }>, over: Partial<PeriodMarket> = {}): PeriodMarket => ({
  days: Object.keys(bars).map(Number).sort((a, b) => a - b),
  prevDay: 0,
  prevClose: { 1: 100 },
  bars: { 1: bars },
  cashEvents: [],
  delistings: {},
  rateOn: () => 0,
  ...over,
});

describe("rnd (Postgres numeric rounding)", () => {
  it("rounds half away from zero, like round(numeric)", () => {
    expect(rnd(2.5, 0)).toBe(3);
    expect(rnd(-2.5, 0)).toBe(-3);
    expect(rnd(12.34565, 4)).toBe(12.3457);
    expect(rnd(0.1 + 0.2, 6)).toBe(0.3);
  });
});

describe("evaluateOrder (mirrors _trading_trigger)", () => {
  const bar = { o: 100, h: 104, l: 97, c: 101 };
  it("limit buys fill at the better of the open and the limit; limit sells mirror", () => {
    expect(evaluateOrder(ord({ type: "limit", limit: 98 }), bar, 0.002)).toMatchObject({ fill: true, price: 98 });
    expect(evaluateOrder(ord({ type: "limit", limit: 102 }), bar, 0.002)).toMatchObject({ fill: true, price: 100 });
    expect(evaluateOrder(ord({ type: "limit", limit: 96 }), bar, 0.002).fill).toBe(false);
    expect(evaluateOrder(ord({ side: "sell", type: "limit", limit: 103 }), bar, 0.002)).toMatchObject({ fill: true, price: 103 });
    expect(evaluateOrder(ord({ side: "sell", type: "limit", limit: 99 }), bar, 0.002)).toMatchObject({ fill: true, price: 100 });
  });

  it("a stop sell that the open gaps through fills at the open, less half the spread", () => {
    const gap = { o: 80, h: 82, l: 78, c: 81 };
    expect(evaluateOrder(ord({ side: "sell", type: "stop", stop: 95 }), gap, 0.002)).toMatchObject({ fill: true, price: 79.92 });
    expect(evaluateOrder(ord({ side: "sell", type: "stop", stop: 98 }), bar, 0.002)).toMatchObject({ fill: true, price: 97.902 });
    expect(evaluateOrder(ord({ side: "buy", type: "stop", stop: 103 }), bar, 0.002)).toMatchObject({ fill: true, price: 103.103 });
    expect(evaluateOrder(ord({ side: "buy_to_cover", type: "stop", stop: 110 }), bar, 0.002).fill).toBe(false);
  });

  it("a stop-limit triggers at its stop, then acts as a limit", () => {
    // triggers at 103, fills right there inside the limit
    expect(evaluateOrder(ord({ type: "stop_limit", stop: 103, limit: 103.5 }), bar, 0.002)).toMatchObject({ fill: true, price: 103, triggered: true });
    // gaps open above the limit, comes back down to it during the day
    expect(evaluateOrder(ord({ type: "stop_limit", stop: 95, limit: 98 }), bar, 0.002)).toMatchObject({ fill: true, price: 98, triggered: true });
    // gaps above the limit and never returns: triggered, unfilled, a limit from now on
    const r = evaluateOrder(ord({ type: "stop_limit", stop: 95, limit: 96 }), bar, 0.002);
    expect(r).toMatchObject({ fill: false, triggered: true });
    expect(evaluateOrder(ord({ type: "stop_limit", stop: 95, limit: 96, triggered: true }), { o: 97, h: 97, l: 95, c: 96 }, 0.002))
      .toMatchObject({ fill: true, price: 96 });
  });

  it("a close-only bar triggers and fills on the close", () => {
    const close = { o: 90, h: 90, l: 90, c: 90 };
    expect(evaluateOrder(ord({ side: "sell", type: "stop", stop: 95 }), close, 0)).toMatchObject({ fill: true, price: 90 });
  });
});

describe("applyTrade (average cost, realized P&L)", () => {
  it("longs", () => {
    let p = applyTrade({ qty: 0, cost: 0, realized: 0 }, "buy", 10, 20).position;
    p = applyTrade(p, "buy", 10, 30).position;
    const s = applyTrade(p, "sell", 5, 40);
    expect(s.realized).toBe(75); // 5 × (40 − 25)
    expect(s.position).toEqual({ qty: 15, cost: 375, realized: 75 });
    expect(s.cashDelta).toBe(200);
  });

  it("shorts profit when the price falls", () => {
    const p = applyTrade({ qty: 0, cost: 0, realized: 0 }, "sell_short", 10, 50).position;
    expect(p).toEqual({ qty: -10, cost: -500, realized: 0 });
    const c = applyTrade(p, "buy_to_cover", 10, 30);
    expect(c.realized).toBe(200);
    expect(c.position).toEqual({ qty: 0, cost: 0, realized: 200 });
    expect(c.cashDelta).toBe(-300);
  });
});

describe("resolvePeriod: the GOLDEN scenario (scripts/markets_selftest.sql asserts the same numbers)", () => {
  const start = fresh();
  const r1 = resolvePeriod(GOLDEN_JAN, GOLDEN_CONFIG, start, GOLDEN_ORDERS_R1);
  const carried = GOLDEN_ORDERS_R1.filter((o) => r1.orders.find((x) => x.id === o.id)!.status === "open");
  const r2 = resolvePeriod(GOLDEN_FEB, GOLDEN_CONFIG, r1.account, [...carried, ...GOLDEN_ORDERS_R2]);

  it("round 1: fills, a gapped stop, a stop-limit, dividends both ways, expiry", () => {
    expect(r1.orders.map((o) => `${o.id}:${o.status}`)).toEqual([
      "a1:filled", "a2:filled", "a3:filled", "a4:expired", "a5:expired", "a6:filled",
    ]);
    expect(r1.fills.map((f) => [f.orderId, f.side, f.quantity, f.price])).toEqual([
      ["a1", "buy", 100, 50.05],
      ["a2", "sell_short", 50, 19.98],
      ["a6", "buy", 20, 51],
      ["a3", "sell", 100, 46.953],
    ]);
    const sum = (k: string) => r1.ledger.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0);
    expect(sum("dividend")).toBe(55); // +120 × 0.50 long, −50 × 0.10 short
    expect(sum("commission")).toBe(-4);
    expect(sum("interest")).toBeCloseTo(702.579313, 4);
    expect(sum("borrow_fee")).toBeCloseTo(-0.926847, 4);
    expect(r1.account.cash).toBeCloseTo(100421.952466, 4);
    expect(r1.nlvEnd).toBeCloseTo(100290.952466, 4);
    expect(r1.account.positions[1]).toEqual({ qty: 20, cost: 1004.166667, realized: -325.533333 });
    expect(r1.account.positions[2]).toEqual({ qty: -50, cost: -999, realized: 0 });
    expect(r1.exposureStart).toBe(6000);
    expect(r1.traded).toBeCloseTo(11719.3, 6);
    expect(r1.dailyNlv).toHaveLength(23);
  });

  it("round 2: cover, a 2× levered buy, a crash and a margin call at the close", () => {
    expect(r2.orders.map((o) => `${o.id}:${o.status}`)).toEqual(["b1:filled", "b2:filled"]);
    expect(r2.fills.map((f) => [f.orderId, f.side, f.quantity, f.price, f.reason])).toEqual([
      ["b1", "buy_to_cover", 50, 21.5215, "order"],
      ["b2", "buy", 3000, 47.2472, "order"],
      [null, "sell", 3020, 17.982, "margin_call"],
    ]);
    expect(r2.exposureStart).toBe(142544);
    const sum = (k: string) => r2.ledger.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0);
    expect(sum("margin_interest")).toBeCloseTo(-302.986531, 4);
    expect(sum("forced_liquidation")).toBeCloseTo(54305.64, 6);
    expect(r2.nlvEnd).toBeCloseTo(11624.291494, 4);
    expect(r2.account.maxDrawdown).toBeCloseTo(0.884444, 5);
    expect(r2.account.positions[1].realized).toBeCloseTo(-88765.66, 4);
    expect(r2.account.frozen).toBe(false);
  });

  it("an all-cash account just earns the T-bill, and its Sharpe is undefined", () => {
    const b1 = resolvePeriod(GOLDEN_JAN, GOLDEN_CONFIG, start, []);
    const b2 = resolvePeriod(GOLDEN_FEB, GOLDEN_CONFIG, b1.account, []);
    expect(b1.nlvEnd).toBeCloseTo(100725.757346, 4);
    expect(b2.nlvEnd).toBeCloseTo(101345.684085, 4);
    expect(periodRiskFree(GOLDEN_JAN)).toBeCloseTo(0.0072575735, 9);
    const rfs = [periodRiskFree(GOLDEN_JAN), periodRiskFree(GOLDEN_FEB)];
    expect(annualizedSharpe([100_000, b1.nlvEnd, b2.nlvEnd], rfs, "month")).toBeNull();
    expect(annualizedSharpe([100_000, r1.nlvEnd, r2.nlvEnd], rfs, "month")).toBeCloseTo(-3.498106, 4);
  });
});

describe("resolvePeriod: fill-time checks", () => {
  it("market orders fill at the close students saw, plus or minus half the spread", () => {
    const r = resolvePeriod(mkt({ 1: { o: 120, h: 125, l: 119, c: 122 } }), CFG, fresh(), [ord({ quantity: 10 })]);
    expect(r.fills[0].price).toBe(100.1);
  });

  it("dollar market orders become shares at the fill price", () => {
    const r = resolvePeriod(mkt({ 1: { o: 100, h: 100, l: 100, c: 100 } }), CFG, fresh(), [ord({ quantity: null, notional: 1001 })]);
    expect(r.fills[0].quantity).toBe(10);
  });

  it("rejects a sell when an earlier fill already sold the shares", () => {
    const start = { ...fresh(), positions: { 1: { qty: 10, cost: 1000, realized: 0 } } };
    const r = resolvePeriod(mkt({ 1: { o: 100, h: 100, l: 90, c: 95 } }), CFG, start, [
      ord({ id: "m", side: "sell", quantity: 10 }),
      ord({ id: "s", side: "sell", type: "stop", stop: 95, quantity: 10, tif: "gtc" }),
    ]);
    expect(r.orders.map((o) => [o.id, o.status, o.reason])).toEqual([
      ["m", "filled", null],
      ["s", "rejected", "you no longer held enough shares"],
    ]);
  });

  it("rejects an opening fill the account cannot carry at that moment", () => {
    // $1,000 of equity cannot take a $5,000 position at 50% margin
    const r = resolvePeriod(mkt({ 1: { o: 100, h: 100, l: 100, c: 100 } }), CFG, fresh(1000), [ord({ quantity: 50 })]);
    expect(r.orders[0]).toMatchObject({ status: "rejected", reason: "not enough buying power when it filled" });
  });

  it("keeps a long and a short apart", () => {
    const start = { ...fresh(), positions: { 1: { qty: -5, cost: -500, realized: 0 } } };
    const r = resolvePeriod(mkt({ 1: { o: 100, h: 100, l: 100, c: 100 } }), CFG, start, [ord({ side: "buy", quantity: 1 })]);
    expect(r.orders[0].reason).toBe("you were short this one: cover first");
  });

  it("this-round orders expire; good-till-cancelled ones stay open", () => {
    const r = resolvePeriod(mkt({ 1: { o: 100, h: 101, l: 99, c: 100 } }), CFG, fresh(), [
      ord({ id: "r", type: "limit", limit: 50, tif: "round" }),
      ord({ id: "g", type: "limit", limit: 50, tif: "gtc" }),
    ]);
    expect(r.orders.map((o) => o.status)).toEqual(["expired", "open"]);
  });
});

describe("resolvePeriod: cash, interest and margin", () => {
  it("pays dividends and distributions to longs and charges shorts", () => {
    const start = { ...fresh(), positions: { 1: { qty: 10, cost: 1000, realized: 0 }, 2: { qty: -4, cost: -400, realized: 0 } } };
    const m = mkt({ 1: { o: 100, h: 100, l: 100, c: 100 } }, {
      prevClose: { 1: 100, 2: 100 },
      bars: { 1: { 1: { o: 100, h: 100, l: 100, c: 100 } }, 2: { 1: { o: 100, h: 100, l: 100, c: 100 } } },
      cashEvents: [
        { slot: 1, day: 1, kind: "dividend", amount: 0.5 },
        { slot: 2, day: 1, kind: "distribution", amount: 2 },
      ],
    });
    const r = resolvePeriod(m, CFG, start, []);
    expect(r.ledger.map((l) => [l.kind, l.amount])).toEqual([["dividend", 5], ["distribution", -8]]);
  });

  it("earns no interest on cash that backs a short, pays margin interest on a loan, and charges a borrow fee", () => {
    const m = mkt({ 365: { o: 100, h: 100, l: 100, c: 100 } }, { rateOn: () => 0.05 });
    // short $10,000 against $10,000: cash $20,000, of which $10,000 earns interest
    const short = { ...fresh(20_000), nlv: 10_000, positions: { 1: { qty: -100, cost: -10_000, realized: 0 } } };
    const a = resolvePeriod(m, { ...CFG, borrowFee: 0.01 }, short, []);
    expect(a.ledger.find((l) => l.kind === "interest")!.amount).toBe(500);
    expect(a.ledger.find((l) => l.kind === "borrow_fee")!.amount).toBe(-100);
    // a $5,000 loan for a year at 5% + 5%
    const loan = { ...fresh(-5_000), nlv: 5_000, positions: { 1: { qty: 100, cost: 10_000, realized: 0 } } };
    const b = resolvePeriod(m, CFG, loan, []);
    expect(b.ledger.find((l) => l.kind === "margin_interest")!.amount).toBe(-500);
  });

  it("liquidates the largest position at the close when the account breaches maintenance, then re-checks", () => {
    const start = {
      ...fresh(-15_500),
      nlv: 4_500,
      positions: { 1: { qty: 100, cost: 10_000, realized: 0 }, 2: { qty: 100, cost: 10_000, realized: 0 } },
    };
    const m = mkt({}, {
      days: [1],
      prevClose: { 1: 100, 2: 100 },
      bars: { 1: { 1: { o: 70, h: 70, l: 70, c: 70 } }, 2: { 1: { o: 90, h: 90, l: 90, c: 90 } } },
    });
    const r = resolvePeriod(m, CFG, start, []);
    // equity 500 < 0.25 × 16,000: the larger (slot 2, $9,000) goes first; equity
    // 491 is still under 0.25 × 7,000, so slot 1 goes too
    expect(r.fills.map((f) => [f.slot, f.reason])).toEqual([[2, "margin_call"], [1, "margin_call"]]);
    expect(r.fills.map((f) => f.price)).toEqual([89.91, 69.93]);
    // less the day's margin interest on the $15,500 loan, which accrues before the check
    expect(r.nlvEnd).toBeCloseTo(484 - (15_500 * 0.05) / 365, 5);
  });

  it("a gap can push an account below zero: shown negative and frozen", () => {
    const start = { ...fresh(20_000), nlv: 10_000, positions: { 1: { qty: -100, cost: -10_000, realized: 0 } } };
    const m = mkt({ 1: { o: 400, h: 410, l: 395, c: 400 } });
    const r = resolvePeriod(m, CFG, start, []);
    expect(r.fills[0]).toMatchObject({ reason: "margin_call", side: "buy_to_cover", price: 400.4 });
    expect(r.nlvEnd).toBe(-20_040);
    expect(r.account.frozen).toBe(true);
    expect(r.account.maxDrawdown).toBe(1);
  });
});

describe("resolvePeriod: delistings", () => {
  const holder = (qty: number) => ({ ...fresh(10_000), positions: { 1: { qty, cost: qty * 10, realized: 0 } } });
  const m = (value: number) =>
    mkt({ 1: { o: 10, h: 10, l: 10, c: 10 }, 2: { o: 10, h: 10, l: 10, c: 10 } }, {
      prevClose: { 1: 10 },
      bars: { 1: { 1: { o: 10, h: 10, l: 10, c: 10 } } },
      days: [1, 2],
      delistings: { 1: { day: 1, value } },
    });

  it("bankruptcy writes a long down to the recovery value, and closes a short at it", () => {
    const long = resolvePeriod(m(0), CFG, holder(100), []);
    expect(long.fills[0]).toMatchObject({ reason: "delisting", side: "sell", price: 0, quantity: 100 });
    expect(long.nlvEnd).toBe(10_000);
    expect(long.account.positions[1].realized).toBe(-1000);
    const short = resolvePeriod(m(0), CFG, { ...fresh(11_000), positions: { 1: { qty: -100, cost: -1000, realized: 0 } } }, []);
    expect(short.fills[0]).toMatchObject({ side: "buy_to_cover", price: 0 });
    expect(short.nlvEnd).toBe(11_000);
  });

  it("a cash acquisition (or a stock merger, cashed out in v1) pays the deal value", () => {
    const r = resolvePeriod(m(13.5), CFG, holder(100), []);
    expect(r.nlvEnd).toBe(11_350);
  });

  it("cancels open orders on the delisted company", () => {
    const r = resolvePeriod(m(0), CFG, holder(100), [ord({ side: "sell", type: "limit", limit: 50, quantity: 100, tif: "gtc" })]);
    expect(r.orders[0]).toMatchObject({ status: "canceled", reason: "the company stopped trading" });
  });
});

describe("stats", () => {
  it("excess returns stop after a wipe-out and floor at -100%", () => {
    const xs = excessReturns([100, 110, 0, 50], [0, 0, 0]);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(0.1, 12);
    expect(xs[1]).toBe(-1);
    expect(excessReturns([100, -20], [0.01])).toEqual([-1.01]);
  });

  it("annualizes Sharpe by the number of periods in a year", () => {
    const nlvs = [100, 110, 99, 108.9];
    const m = annualizedSharpe(nlvs, [0, 0, 0], "month")!;
    const y = annualizedSharpe(nlvs, [0, 0, 0], "year")!;
    expect(m / y).toBeCloseTo(Math.sqrt(12), 10);
    expect(annualizedSharpe([100, 110], [0], "year")).toBeNull();
  });

  it("measures drawdown and turnover", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(0.25, 10);
    // traded $400k over 4 quarters on a $100k account: replaced twice in the year
    expect(annualTurnover([100_000, 100_000, 100_000, 100_000], [100_000, 100_000, 100_000, 100_000, 100_000], "quarter")).toBe(2);
  });
});
