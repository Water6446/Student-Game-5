import { describe, expect, it } from "vitest";
import {
  buyingPower,
  checkOrder,
  freeEquity,
  marginParams,
  marksOf,
  orderReserve,
  referencePrice,
  riskWarning,
  sharesForNotional,
  type OrderContext,
} from "./orders";
import { TRADING_DEFAULTS } from "./config";

const margin = marginParams(TRADING_DEFAULTS); // im 0.5, spread 0.1%
const cashOnly = marginParams({ ...TRADING_DEFAULTS, margin_enabled: false });

const fresh = (over: Partial<OrderContext> = {}): OrderContext => ({
  last: 20,
  position: 0,
  pendingClose: 0,
  marks: { lmv: 0, smv: 0, equity: 100_000 },
  openReserves: 0,
  params: margin,
  shortingEnabled: true,
  frozen: false,
  ...over,
});

describe("margin parameters", () => {
  it("borrow at the initial margin, or not at all", () => {
    expect(margin.im).toBe(0.5);
    expect(cashOnly.im).toBe(1);
  });
});

describe("marks and buying power", () => {
  it("values longs and shorts at the last close", () => {
    const m = marksOf(50_000, [{ slot: 1, quantity: 100 }, { slot: 2, quantity: -50 }], (s) => (s === 1 ? 30 : 40));
    expect(m).toEqual({ lmv: 3000, smv: 2000, equity: 51_000 });
  });

  it("is about twice equity with margin, equity without", () => {
    const m = { lmv: 0, smv: 0, equity: 100_000 };
    expect(buyingPower(m, margin, 0)).toBeCloseTo(100_000 / 0.5005, 6);
    expect(buyingPower(m, cashOnly, 0)).toBeCloseTo(100_000 / 1.0005, 6);
    expect(buyingPower(m, margin, 99_950)).toBeCloseTo(50 / 0.5005, 6);
  });

  it("counts positions and open orders against free equity", () => {
    expect(freeEquity({ lmv: 10_000, smv: 0, equity: 100_000 }, margin, 1_000)).toBe(94_000);
  });
});

describe("reserves (the same formula the markets self-test checks in SQL)", () => {
  it("market buy: shares × last × (im + half spread) + commission", () => {
    expect(orderReserve(10, 12.34, margin)).toBe(61.7617);
    expect(orderReserve(10, 12.34, { ...margin, commission: 4.95 })).toBe(66.7117);
  });

  it("a limit buy reserves at its limit price; a stop buy at the higher of stop and last", () => {
    expect(referencePrice("buy", "limit", 20, 1)).toBe(1);
    expect(referencePrice("buy", "stop", 20, null, 25)).toBe(25);
    expect(referencePrice("buy", "stop", 20, null, 15)).toBe(20);
    expect(referencePrice("sell_short", "limit", 20, 18)).toBe(20);
    expect(referencePrice("sell_short", "limit", 20, 22)).toBe(22);
  });

  it("dollar orders convert at the expected fill price", () => {
    expect(sharesForNotional(1000, 20, "buy", 0.001)).toBe(49.975012);
    expect(sharesForNotional(1000, 20, "sell", 0.001)).toBe(50.025013);
  });

  it("a dollar buy without margin reserves exactly its cost", () => {
    const r = checkOrder({ side: "buy", type: "market", notional: 99_000 }, fresh({ params: cashOnly }));
    expect(r.ok && r.reserve).toBeCloseTo(99_000, 2);
  });
});

describe("checkOrder (mirrors place_order)", () => {
  it("accepts an order inside buying power and refuses one past it", () => {
    expect(checkOrder({ side: "buy", type: "market", notional: 190_000 }, fresh()).ok).toBe(true);
    const r = checkOrder({ side: "buy", type: "market", notional: 250_000 }, fresh());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/^not enough buying power/);
  });

  it("caps closing orders at what is held and not already promised", () => {
    expect(checkOrder({ side: "sell", type: "market", quantity: 1 }, fresh()).ok).toBe(false);
    expect(checkOrder({ side: "sell", type: "market", quantity: 60 }, fresh({ position: 100, pendingClose: 40 })).ok).toBe(true);
    const r = checkOrder({ side: "sell", type: "market", quantity: 61 }, fresh({ position: 100, pendingClose: 40 }));
    expect(!r.ok && r.reason).toBe("you can sell at most 60.000000 shares");
    expect(checkOrder({ side: "buy_to_cover", type: "market", quantity: 5 }, fresh({ position: -5 }))).toEqual({
      ok: true,
      quantity: 5,
      reserve: 0,
    });
  });

  it("keeps longs and shorts apart", () => {
    expect(checkOrder({ side: "buy", type: "market", quantity: 1 }, fresh({ position: -5 })).ok).toBe(false);
    expect(checkOrder({ side: "sell_short", type: "market", quantity: 1 }, fresh({ position: 5 })).ok).toBe(false);
  });

  it("refuses malformed orders the way the server does", () => {
    const reason = (o: Parameters<typeof checkOrder>[0], c = fresh()) => {
      const r = checkOrder(o, c);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason({ side: "buy", type: "limit", quantity: 1 })).toBe("a limit order needs a limit price");
    // the server reports the stray limit price first, so the mirror does too
    expect(reason({ side: "buy", type: "stop", quantity: 1, limit: 5 })).toBe("a stop order does not take a limit price");
    expect(reason({ side: "buy", type: "stop", quantity: 1 })).toBe("a stop order needs a stop price");
    expect(reason({ side: "buy", type: "limit", notional: 100, limit: 5 })).toMatch(/^dollar amounts are for market orders/);
    expect(reason({ side: "buy", type: "market", quantity: 1, notional: 5 })).toBe(
      "give either a number of shares or a dollar amount",
    );
    expect(reason({ side: "buy", type: "market", quantity: -3 })).toBe("shares must be more than 0");
    expect(reason({ side: "sell_short", type: "market", quantity: 1 }, fresh({ shortingEnabled: false }))).toBe(
      "short selling is off in this session",
    );
    expect(reason({ side: "buy", type: "market", quantity: 1 }, fresh({ frozen: true }))).toBe(
      "your account is frozen: you can only close positions",
    );
  });
});

describe("the risk warning", () => {
  it("covers every short sale and a buy that borrows", () => {
    expect(riskWarning("sell_short", 100, 5000, true)).toBe("short");
    expect(riskWarning("sell_short", 100, 5000, false)).toBe("short");
    expect(riskWarning("buy", 6000, 5000, true)).toBe("margin");
    expect(riskWarning("buy", 100, -50, true)).toBe("margin");
    expect(riskWarning("buy", 5000, 5000, true)).toBeNull();
    expect(riskWarning("buy", 6000, 5000, false)).toBeNull();
    expect(riskWarning("sell", 6000, 0, true)).toBeNull();
    expect(riskWarning("buy_to_cover", 6000, 0, true)).toBeNull();
    expect(riskWarning("buy", null, 0, true)).toBeNull();
  });
});
