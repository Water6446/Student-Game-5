import { describe, expect, it } from "vitest";
import type {
  DailyBar,
  MarketAccountRoundRow,
  MarketLedgerRow,
  MarketOrderRow,
  MarketPositionRow,
  MarketSnapshot,
  SessionInstrumentRow,
} from "../db";
import { TRADING_DEFAULTS } from "./config";
import { buyingPower, marginParams } from "./orders";
import {
  accountRanges,
  accountSeries,
  accountView,
  downsample,
  listingsOf,
  moversOf,
  pendingClose,
  periodCashflows,
  periodSlice,
  positionViews,
  priceRanges,
  rangePosition,
  sliceAccountSeries,
  slicePriceRange,
  sortListings,
  ticketSides,
} from "./view";

const inst = (slot: number, name: string, kind: "equity" | "index_fund" = "equity"): SessionInstrumentRow => ({
  session_id: "s",
  slot,
  kind,
  name,
  ticker: name.slice(0, 4).toUpperCase(),
  sector: kind === "index_fund" ? "Index fund" : "Technology",
  about: "",
});

const quote = (slot: number, last: number, change: number | null, delisted = false) => ({
  slot,
  last,
  prev: null,
  change,
  high_52w: null,
  low_52w: null,
  dividend_yield: null,
  spark: [],
  delisted,
});

const snapshot = (quotes: MarketSnapshot["instruments"]): MarketSnapshot => ({
  as_of: [90, 1, 3, 31],
  revealed_rounds: 1,
  change_basis: "period",
  instruments: quotes,
});

const pos = (slot: number, quantity: number, cost_basis: number, realized_pnl = 0): MarketPositionRow => ({
  player_id: "p",
  session_id: "s",
  slot,
  quantity,
  cost_basis,
  realized_pnl,
  updated_at: "",
});

const order = (over: Partial<MarketOrderRow>): MarketOrderRow => ({
  id: "o",
  session_id: "s",
  player_id: "p",
  slot: 1,
  side: "buy",
  order_type: "limit",
  quantity: 10,
  notional: null,
  limit_price: 40,
  stop_price: null,
  tif: "round",
  status: "open",
  reject_reason: null,
  triggered: false,
  reserved: 0,
  placed_round: 1,
  placed_at: "",
  closed_at: null,
  client_ref: null,
  context: null,
  ...over,
});

const instruments = [inst(0, "Index", "index_fund"), inst(1, "Alpha"), inst(2, "Bravo"), inst(3, "Charlie")];
// The golden scenario's state after round 1 (lib/markets/trading/__fixtures__/golden.ts)
const listings = listingsOf(
  instruments,
  snapshot([quote(0, 100, 0.01), quote(1, 50.4, 0.008), quote(2, 21.5, 0.075), quote(3, 10, -0.2)]),
);

describe("positionViews", () => {
  it("values longs and shorts at the last close, largest first", () => {
    const views = positionViews([pos(1, 20, 1004.166667, -325.533333), pos(2, -50, -999), pos(3, 0, 0, 12)], listings);
    expect(views.map((v) => v.slot)).toEqual([2, 1]);
    const [short, long] = views;
    expect(short.value).toBeCloseTo(-1075, 6);
    expect(short.unrealized).toBeCloseTo(-76, 6); // short 50 at 19.98, now 21.50
    expect(short.averageCost).toBeCloseTo(19.98, 6);
    expect(long.value).toBeCloseTo(1008, 6);
    expect(long.unrealized).toBeCloseTo(3.833333, 6);
    expect(long.unrealizedPct).toBeCloseTo(3.833333 / 1004.166667, 9);
    expect(long.realized).toBeCloseTo(-325.533333, 6);
  });
});

describe("accountView", () => {
  const cfg = TRADING_DEFAULTS;
  const account = { cash: 100421.952466, nlv: 100290.952466, frozen: false, sharpe: null, max_drawdown: 0.01 };
  const positions = [pos(1, 20, 1004.166667), pos(2, -50, -999)];

  it("uses the server's account value and the place_order mirror for buying power", () => {
    const v = accountView(account, positions, listings, [order({ reserved: 250 })], cfg);
    expect(v.nlv).toBe(100290.952466);
    expect(v.change).toBeCloseTo(290.952466, 6);
    expect(v.longValue).toBeCloseTo(1008, 6);
    expect(v.shortValue).toBeCloseTo(1075, 6);
    expect(v.reserved).toBe(250);
    const marks = { lmv: 1008, smv: 1075, equity: 100421.952466 + 1008 - 1075 };
    expect(v.buyingPower).toBeCloseTo(buyingPower(marks, marginParams(cfg), 250), 6);
    expect(v.marginLoan).toBe(0);
  });

  it("calls negative cash a margin loan, and a frozen account has no buying power", () => {
    const v = accountView({ ...account, cash: -15500, frozen: true }, positions, listings, [], cfg);
    expect(v.marginLoan).toBe(15500);
    expect(v.buyingPower).toBe(0);
  });

  it("starts at the starting cash before the account row arrives", () => {
    const v = accountView(null, [], listings, [], cfg);
    expect(v.nlv).toBe(cfg.starting_wealth);
    expect(v.change).toBe(0);
  });
});

describe("order helpers", () => {
  it("counts shares already promised to open closing orders", () => {
    const orders = [
      order({ side: "sell", quantity: 5 }),
      order({ id: "b", side: "sell", quantity: null, notional: 100 }),
      order({ id: "c", side: "sell", status: "filled", quantity: 7 }),
      order({ id: "d", side: "buy", quantity: 3 }),
    ];
    expect(pendingClose(orders, 1, "sell", 50)).toBeCloseTo(7, 9);
  });

  it("offers the sides a position allows", () => {
    expect(ticketSides(10, true)).toEqual(["buy", "sell"]);
    expect(ticketSides(-10, true)).toEqual(["buy_to_cover", "sell_short"]);
    expect(ticketSides(0, true)).toEqual(["buy", "sell_short"]);
    expect(ticketSides(0, false)).toEqual(["buy"]);
  });
});

describe("account series", () => {
  const round = (n: number, start: number, days: number[]): MarketAccountRoundRow => ({
    player_id: "p",
    session_id: "s",
    round_number: n,
    nlv_start: start,
    nlv_end: days[days.length - 1],
    daily_nlv: days,
    traded: 0,
  });
  const rounds = [round(2, 105, [104, 110]), round(1, 100, [101, 103, 105])];

  it("starts at the starting cash and runs through every day, in round order", () => {
    const s = accountSeries(rounds, 100);
    expect(s.map((p) => p.value)).toEqual([100, 101, 103, 105, 104, 110]);
    expect(s.map((p) => p.round)).toEqual([0, 1, 1, 1, 2, 2]);
  });

  it("slices the last period from the close before it", () => {
    const s = accountSeries(rounds, 100);
    expect(sliceAccountSeries(s, "period", "quarter", 2).map((p) => p.value)).toEqual([105, 104, 110]);
    expect(sliceAccountSeries(s, "all", "quarter", 2)).toHaveLength(6);
  });

  it("offers only ranges that show something new", () => {
    expect(accountRanges("quarter", 1)).toEqual([]);
    expect(accountRanges("quarter", 4)).toEqual(["period", "all"]);
    expect(accountRanges("quarter", 5)).toEqual(["period", "year", "all"]);
    expect(accountRanges("year", 3)).toEqual(["period", "all"]);
    expect(accountRanges("week", 53)).toEqual(["period", "year", "all"]);
  });
});

describe("price ranges", () => {
  const bars: DailyBar[] = [];
  for (let d = -800; d <= 100; d += 1) bars.push([d, d < 0 ? -1 : 1, 1, 1, 10, 10, 10, 10 + d / 100]);

  it("offers ranges shorter than the history, then All", () => {
    expect(priceRanges(bars)).toEqual(["1m", "3m", "1y", "all"]);
    expect(priceRanges(bars.slice(0, 1))).toEqual([]);
  });

  it("slices from the bar before the range starts", () => {
    const m = slicePriceRange(bars, "1m");
    expect(m[m.length - 1][0]).toBe(100);
    expect(m[0][0]).toBe(68);
    expect(slicePriceRange(bars, "all")).toBe(bars);
  });

  it("slices a period from the close before it", () => {
    const p = periodSlice(bars, 10, 20);
    expect(p[0][0]).toBe(9);
    expect(p[p.length - 1][0]).toBe(20);
    expect(p).toHaveLength(12);
    expect(periodSlice(bars, -800, -799).map((b) => b[0])).toEqual([-800, -799]);
    expect(periodSlice(bars, 500, 600)).toEqual([]);
  });

  it("downsamples evenly and keeps both ends", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(pts, 100);
    expect(d).toHaveLength(100);
    expect(d[0]).toBe(0);
    expect(d[99]).toBe(999);
    expect(downsample(pts.slice(0, 50), 100)).toHaveLength(50);
  });
});

describe("the market list", () => {
  it("sorts by name or change, missing changes last", () => {
    const rows = listingsOf(
      instruments,
      snapshot([quote(0, 100, 0.01), quote(1, 1, 0.1), quote(2, 1, null), quote(3, 1, -0.3)]),
    ).filter((l) => l.kind === "equity");
    expect(sortListings(rows, "name").map((l) => l.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(sortListings(rows, "gainers").map((l) => l.slot)).toEqual([1, 3, 2]);
    expect(sortListings(rows, "losers").map((l) => l.slot)).toEqual([3, 1, 2]);
  });

  it("finds movers among live companies only", () => {
    const rows = listingsOf(
      instruments,
      snapshot([quote(0, 100, 0.5), quote(1, 1, 0.1), quote(2, 1, -0.05, true), quote(3, 1, -0.3)]),
    );
    const m = moversOf(rows);
    expect(m.up.map((l) => l.slot)).toEqual([1]);
    expect(m.down.map((l) => l.slot)).toEqual([3]);
  });
});

describe("periodCashflows", () => {
  const row = (kind: MarketLedgerRow["kind"], amount: number, round = 1): MarketLedgerRow => ({
    id: `${kind}${amount}`,
    session_id: "s",
    player_id: "p",
    round_number: round,
    game_day: 1,
    kind,
    amount,
    slot: null,
    fill_id: null,
    note: null,
    created_at: "",
  });

  it("sums the period's cash events by kind, leaving trades out", () => {
    const flows = periodCashflows(
      [
        row("trade", -5000),
        row("dividend", 50),
        row("dividend", 5),
        row("interest", 702.579313),
        row("borrow_fee", -0.926847),
        row("commission", -4),
        row("dividend", 99, 2),
        row("forced_liquidation", 100),
      ],
      1,
    );
    expect(flows.map((f) => f.kind)).toEqual(["dividend", "interest", "borrow_fee", "commission"]);
    expect(flows[0].amount).toBe(55);
  });
});

describe("rangePosition", () => {
  it("places a value inside its range, clamped", () => {
    expect(rangePosition(15, 10, 20)).toBe(0.5);
    expect(rangePosition(25, 10, 20)).toBe(1);
    expect(rangePosition(5, 5, 5)).toBe(0.5);
  });
});
