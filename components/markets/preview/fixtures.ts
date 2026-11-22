// DEV ONLY: a synthetic paper trading session for the screen preview
// (app/markets/trade/preview). Invented prices for invented companies, played
// through the real TS engine (lib/markets/trading/engine.ts), so every figure
// on the preview is one the engine could produce. Never shipped to students.

import pool from "@/data/names/name_pool.json";
import { seededRandom, normalFrom } from "@/lib/markets/data/fixtures";
import { toDayKey } from "@/lib/markets/data/normalize";
import { gameLabel, periodRange, type GameLabel } from "@/lib/markets/clock";
import { generatedHeadline } from "@/lib/markets/data/headlines";
import {
  resolvePeriod,
  periodRiskFree,
  type AccountState,
  type Bar,
  type EngineOrder,
  type PeriodMarket,
} from "@/lib/markets/trading/engine";
import { annualizedSharpe } from "@/lib/markets/trading/stats";
import { marginParams } from "@/lib/markets/trading/orders";
import {
  TRADING_DEFAULTS,
  type TradingConfig,
} from "@/lib/markets/trading/config";
import type {
  DailyBar,
  MarketAccountRoundRow,
  MarketAccountRow,
  MarketFillRow,
  MarketLedgerRow,
  MarketOrderRow,
  MarketPeriodResultRow,
  MarketPositionRow,
  MarketSnapshot,
  OrderSide,
  OrderType,
  SessionInstrumentRow,
  TimeInForce,
  TradingStandingRow,
  TradingTruth,
} from "@/lib/markets/db";

export const PREVIEW_ROUNDS = 8;
export const PREVIEW_START_YEAR = 1990;
const START_YEAR = PREVIEW_START_YEAR; // arithmetic only: every label the screens see is game-relative
const SESSION = "preview-session";
const ME = "preview-me";
const RATE = 0.045;

export const PREVIEW_CONFIG: TradingConfig = {
  ...TRADING_DEFAULTS,
  num_rounds: PREVIEW_ROUNDS,
  label: "Preview",
  market_data: "historical",
};

/** The preview's config, on real history or (`&market=simulated`) the simulated market. */
export const previewConfig = (simulated: boolean): TradingConfig =>
  simulated ? { ...PREVIEW_CONFIG, market_data: "simulated" } : PREVIEW_CONFIG;

const jan1 = toDayKey(`${START_YEAR}-01-01`);
const isWeekday = (day: number) => ((day % 7) + 7) % 7 < 5; // day key 0 (1962-01-01) was a Monday
const historyFrom = toDayKey(`${START_YEAR - 5}-01-01`);
const lastDay = periodRange(START_YEAR, "quarter", PREVIEW_ROUNDS).toDay;
const calendar: number[] = [];
for (let d = historyFrom; d <= lastDay; d++) if (isWeekday(d)) calendar.push(d);

const label = (day: number): GameLabel => gameLabel(START_YEAR, day);
const gameDay = (day: number) => day - jan1;

// ---- instruments --------------------------------------------------------------
type PoolSector = { about: string; names: { name: string; ticker: string }[] };
const sectors = (pool as unknown as { sectors: Record<string, PoolSector> })
  .sectors;
const indexFund = (
  pool as unknown as {
    index_fund: { name: string; ticker: string; about: string };
  }
).index_fund;
const PICKS: [string, number][] = [
  ["Technology", 0],
  ["Technology", 1],
  ["Health Care", 0],
  ["Financials", 0],
  ["Energy", 0],
  ["Consumer Staples", 0],
  ["Industrials", 0],
  ["Communications", 0],
  ["Consumer Discretionary", 0],
  ["Utilities", 0],
  ["Materials", 0],
  ["Financials", 1],
];

export const PREVIEW_INSTRUMENTS: SessionInstrumentRow[] = [
  {
    session_id: SESSION,
    slot: 0,
    kind: "index_fund",
    name: indexFund.name,
    ticker: indexFund.ticker,
    sector: "Index fund",
    about: indexFund.about,
  },
  ...PICKS.map(([sector, i], k) => ({
    session_id: SESSION,
    slot: k + 1,
    kind: "equity" as const,
    name: sectors[sector].names[i].name,
    ticker: sectors[sector].names[i].ticker,
    sector,
    about: sectors[sector].about,
  })),
];

// ---- prices: geometric random walks, rounded like the server's ------------------
const rand = seededRandom(20261120);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const bars: Record<number, Map<number, Bar>> = {};
const yields: Record<number, number> = {};
for (const inst of PREVIEW_INSTRUMENTS) {
  const s = inst.slot;
  const vol = s === 0 ? 0.16 : 0.2 + rand() * 0.25;
  const drift = s === 0 ? 0.08 : -0.02 + rand() * 0.2;
  yields[s] = s === 0 ? 0.02 : rand() < 0.6 ? 0.01 + rand() * 0.03 : 0;
  let c = s === 0 ? 100 : 15 + rand() * 180;
  const m = new Map<number, Bar>();
  const dt = 1 / 252;
  for (const d of calendar) {
    const o = c * Math.exp(normalFrom(rand) * vol * Math.sqrt(dt) * 0.25);
    c =
      c *
      Math.exp(
        (drift - (vol * vol) / 2) * dt + vol * Math.sqrt(dt) * normalFrom(rand),
      );
    const h =
      Math.max(o, c) *
      (1 + Math.abs(normalFrom(rand)) * vol * Math.sqrt(dt) * 0.5);
    const l =
      Math.min(o, c) *
      (1 - Math.abs(normalFrom(rand)) * vol * Math.sqrt(dt) * 0.5);
    m.set(
      d,
      s === 0
        ? { o: r4(c), h: r4(c), l: r4(c), c: r4(c) }
        : { o: r4(o), h: r4(h), l: r4(l), c: r4(c) },
    );
  }
  bars[s] = m;
}
const closeOn = (slot: number, day: number) => bars[slot].get(day)?.c ?? 0;
const tradingDaysIn = (from: number, to: number) =>
  calendar.filter((d) => d >= from && d <= to);
const lastTradingDayBefore = (day: number) => {
  let best = calendar[0];
  for (const d of calendar) if (d < day) best = d;
  return best;
};

/** Quarterly dividends, paid on the first trading day of each quarter's middle month. */
function dividendDays(from: number, to: number): number[] {
  const out: number[] = [];
  for (const d of tradingDaysIn(from, to)) {
    const [, , mm, dd] = label(d);
    const prev = calendar[calendar.indexOf(d) - 1];
    if (mm % 3 === 2 && prev != null && label(prev)[2] !== mm && dd <= 7)
      out.push(d);
  }
  return out;
}

// ---- the student's scripted orders, round by round ----------------------------------
interface Script {
  slot: number;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  notional?: number;
  limitPct?: number;
  stopPct?: number;
  tif?: TimeInForce;
}
const SCRIPT: Record<number, Script[]> = {
  1: [
    { slot: 0, side: "buy", type: "market", notional: 25_000 },
    { slot: 3, side: "buy", type: "market", quantity: 150 },
    { slot: 6, side: "sell_short", type: "market", quantity: 120 },
    {
      slot: 9,
      side: "buy",
      type: "limit",
      quantity: 60,
      limitPct: 0.96,
      tif: "gtc",
    },
  ],
  2: [
    {
      slot: 3,
      side: "sell",
      type: "stop",
      quantity: 150,
      stopPct: 0.88,
      tif: "gtc",
    },
    { slot: 1, side: "buy", type: "market", notional: 12_000 },
  ],
  3: [
    { slot: 2, side: "buy", type: "market", quantity: 80 },
    { slot: 11, side: "buy", type: "limit", quantity: 40, limitPct: 0.9 },
  ],
  4: [{ slot: 6, side: "buy_to_cover", type: "market", quantity: 120 }],
  5: [{ slot: 4, side: "buy", type: "market", notional: 8_000 }],
  6: [{ slot: 1, side: "sell", type: "limit", quantity: 20, limitPct: 1.05 }],
  7: [
    {
      slot: 12,
      side: "buy",
      type: "stop_limit",
      quantity: 50,
      stopPct: 1.04,
      limitPct: 1.07,
      tif: "gtc",
    },
  ],
  8: [{ slot: 0, side: "sell", type: "market", quantity: 40 }],
};

export interface PreviewWorld {
  instruments: SessionInstrumentRow[];
  snapshot: MarketSnapshot;
  account: MarketAccountRow;
  positions: MarketPositionRow[];
  orders: MarketOrderRow[];
  fills: MarketFillRow[];
  ledger: MarketLedgerRow[];
  accountRounds: MarketAccountRoundRow[];
  periods: MarketPeriodResultRow[];
  standings: TradingStandingRow[];
  history: (slot: number) => DailyBar[];
  truth: TradingTruth;
}

const iso = (n: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

/** The session after `revealed` periods, with `openRound`'s orders (if any) still open. */
export function previewWorld(
  revealed: number,
  openRound: number | null,
): PreviewWorld {
  const cfg = PREVIEW_CONFIG;
  const mp = marginParams(cfg);
  const engineCfg = {
    spread: cfg.spread,
    commission: cfg.commission,
    im: mp.im,
    maintLong: cfg.maint_long,
    maintShort: cfg.maint_short,
    borrowFee: cfg.borrow_fee,
    borrowSpread: cfg.borrow_spread,
  };
  let state: AccountState = {
    cash: cfg.starting_wealth,
    nlv: cfg.starting_wealth,
    peak: cfg.starting_wealth,
    maxDrawdown: 0,
    frozen: false,
    positions: {},
  };
  const orders: MarketOrderRow[] = [];
  const fills: MarketFillRow[] = [];
  const ledger: MarketLedgerRow[] = [];
  const accountRounds: MarketAccountRoundRow[] = [];
  const periods: MarketPeriodResultRow[] = [];
  const nlvs = [cfg.starting_wealth];
  const rfs: number[] = [];
  let seq = 0;

  const orderRow = (r: number, s: Script, last: number): MarketOrderRow => ({
    id: `o${++seq}`,
    session_id: SESSION,
    player_id: ME,
    slot: s.slot,
    side: s.side,
    order_type: s.type,
    quantity: s.quantity ?? null,
    notional: s.notional ?? null,
    limit_price: s.limitPct ? r4(last * s.limitPct) : null,
    stop_price: s.stopPct ? r4(last * s.stopPct) : null,
    tif: s.type === "market" ? "round" : (s.tif ?? "round"),
    status: "open",
    reject_reason: null,
    triggered: false,
    reserved: 0,
    placed_round: r,
    placed_at: iso(seq),
    closed_at: null,
    client_ref: null,
    context: null,
  });

  const lastRoundToPlace = openRound ?? revealed;
  for (let r = 1; r <= lastRoundToPlace; r++) {
    const range = periodRange(START_YEAR, "quarter", r);
    const days = tradingDaysIn(range.fromDay, range.toDay);
    const prevDay = lastTradingDayBefore(range.fromDay);
    for (const s of SCRIPT[r] ?? [])
      orders.push(orderRow(r, s, closeOn(s.slot, prevDay)));
    if (r > revealed) break; // the open round: placed, not resolved

    const prevClose: Record<number, number> = {};
    const periodBars: Record<number, Record<number, Bar>> = {};
    const cashEvents: PeriodMarket["cashEvents"] = [];
    for (const inst of PREVIEW_INSTRUMENTS) {
      prevClose[inst.slot] = closeOn(inst.slot, prevDay);
      periodBars[inst.slot] = Object.fromEntries(
        days.map((d) => [d, bars[inst.slot].get(d) as Bar]),
      );
      if (yields[inst.slot] > 0) {
        for (const d of dividendDays(range.fromDay, range.toDay)) {
          cashEvents.push({
            slot: inst.slot,
            day: d,
            kind: "dividend",
            amount: r4((prevClose[inst.slot] * yields[inst.slot]) / 4),
          });
        }
      }
    }
    const market: PeriodMarket = {
      days,
      prevDay,
      prevClose,
      bars: periodBars,
      cashEvents,
      delistings: {},
      rateOn: () => RATE,
    };
    const open = orders.filter((o) => o.status === "open");
    const engineOrders: EngineOrder[] = open.map((o) => ({
      id: o.id,
      slot: o.slot,
      side: o.side,
      type: o.order_type,
      quantity: o.quantity,
      notional: o.notional,
      limit: o.limit_price,
      stop: o.stop_price,
      tif: o.tif,
      triggered: o.triggered,
    }));
    const res = resolvePeriod(market, engineCfg, state, engineOrders);
    for (const out of res.orders) {
      const o = orders.find((x) => x.id === out.id);
      if (!o) continue;
      o.status = out.status;
      o.triggered = out.triggered;
      o.reject_reason = out.reason;
      if (out.status !== "open") o.closed_at = iso(1000 + r);
    }
    const fillIds: string[] = [];
    for (const f of res.fills) {
      const id = `f${fills.length + 1}`;
      fillIds.push(id);
      fills.push({
        id,
        order_id: f.orderId,
        session_id: SESSION,
        player_id: ME,
        round_number: r,
        game_day: gameDay(f.day),
        slot: f.slot,
        side: f.side,
        quantity: f.quantity,
        price: f.price,
        notional: f.notional,
        commission: f.commission,
        reason: f.reason,
        created_at: iso(2000 + fills.length),
      });
    }
    for (const e of res.ledger) {
      ledger.push({
        id: `l${ledger.length + 1}`,
        session_id: SESSION,
        player_id: ME,
        round_number: r,
        game_day: gameDay(e.day),
        kind: e.kind,
        amount: e.amount,
        slot: e.slot,
        fill_id: e.fill != null ? fillIds[e.fill] : null,
        note: null,
        created_at: iso(3000 + ledger.length),
      });
    }
    accountRounds.push({
      player_id: ME,
      session_id: SESSION,
      round_number: r,
      nlv_start: res.nlvStart,
      nlv_end: res.nlvEnd,
      daily_nlv: res.dailyNlv,
      traded: res.traded,
    });
    state = res.account;
    nlvs.push(res.nlvEnd);
    rfs.push(periodRiskFree(market));

    const ret = (slot: number) =>
      closeOn(slot, days[days.length - 1]) / prevClose[slot] - 1;
    const movers = PREVIEW_INSTRUMENTS.filter((i) => i.kind === "equity")
      .map((i) => ({ slot: i.slot, ret: Math.round(ret(i.slot) * 1e6) / 1e6 }))
      .sort((a, b) => b.ret - a.ret);
    const [, y, m] = label(days[days.length - 1]);
    periods.push({
      session_id: SESSION,
      round_number: r,
      first_game_day: gameDay(days[0]),
      last_game_day: gameDay(days[days.length - 1]),
      index_return: Math.round(ret(0) * 1e6) / 1e6,
      rf_return: rfs[rfs.length - 1],
      movers: [...movers.slice(0, 3), ...movers.slice(-3)],
      headlines: [0, 1, 2].map((k) => ({
        y,
        m: Math.max(1, m - 2 + k),
        rank: 1,
        text: generatedHeadline(
          `${START_YEAR}-0${k + 1}`,
          ret(0) * (1 - k * 0.3),
        ),
      })),
      created_at: iso(4000 + r),
    });
  }

  // reserves held by the open round's orders, as place_order would set them
  for (const o of orders) {
    if (o.status !== "open" || o.side === "sell" || o.side === "buy_to_cover")
      continue;
    const prev = lastTradingDayBefore(
      periodRange(START_YEAR, "quarter", revealed + 1).fromDay,
    );
    const px = o.limit_price ?? o.stop_price ?? closeOn(o.slot, prev);
    const q = o.quantity ?? (o.notional ?? 0) / px;
    o.reserved = r4(q * px * (mp.im + mp.spread / 2) + mp.commission);
  }

  // ---- the snapshot at the last revealed close (as get_market_snapshot builds it) ---
  const last =
    revealed === 0
      ? lastTradingDayBefore(jan1)
      : calendar
          .filter(
            (d) => d <= periodRange(START_YEAR, "quarter", revealed).toDay,
          )
          .slice(-1)[0];
  const prev =
    revealed === 0
      ? lastTradingDayBefore(last - 365 + 1)
      : lastTradingDayBefore(
          periodRange(START_YEAR, "quarter", revealed).fromDay,
        );
  const yearDays = calendar.filter((d) => d > last - 365 && d <= last);
  const snapshot: MarketSnapshot = {
    as_of: label(last),
    revealed_rounds: revealed,
    change_basis: revealed === 0 ? "year" : "period",
    instruments: PREVIEW_INSTRUMENTS.map((i) => {
      const c = closeOn(i.slot, last);
      const p = closeOn(i.slot, prev);
      const ys = yearDays.map((d) => bars[i.slot].get(d) as Bar);
      return {
        slot: i.slot,
        last: c,
        prev: p,
        change: p > 0 ? Math.round((c / p - 1) * 1e6) / 1e6 : null,
        high_52w: Math.max(...ys.map((b) => b.h)),
        low_52w: Math.min(...ys.map((b) => b.l)),
        dividend_yield:
          yields[i.slot] > 0 ? Math.round(yields[i.slot] * 1e6) / 1e6 : null,
        spark: yearDays
          .filter((_, k) => k % 5 === 4 || k === yearDays.length - 1)
          .map((d) => closeOn(i.slot, d)),
        delisted: false,
      };
    }),
  };

  const positions: MarketPositionRow[] = Object.entries(state.positions).map(
    ([slot, p]) => ({
      player_id: ME,
      session_id: SESSION,
      slot: Number(slot),
      quantity: p.qty,
      cost_basis: p.cost,
      realized_pnl: p.realized,
      updated_at: iso(5000),
    }),
  );

  const account: MarketAccountRow = {
    player_id: ME,
    session_id: SESSION,
    cash: state.cash,
    nlv: state.nlv,
    peak_nlv: state.peak,
    max_drawdown: state.maxDrawdown,
    sharpe: annualizedSharpe(nlvs, rfs, "quarter"),
    frozen: state.frozen,
    last_order_at: null,
    updated_at: iso(5001),
  };

  const classmates = [
    "Ava",
    "Ben",
    "Chloé",
    "Dev",
    "Emeka",
    "Farah",
    "Gus",
    "Hana",
    "Iris",
  ];
  const crowd = classmates.map((name, k) => ({
    player_id: `p${k}`,
    display_name: name,
    nlv:
      Math.round(
        cfg.starting_wealth *
          (1 + (seeded(k) - 0.45) * 0.08 * Math.max(1, revealed)) *
          100,
      ) / 100,
    sharpe:
      revealed >= 2 ? Math.round((seeded(k + 20) * 2 - 0.5) * 100) / 100 : null,
    max_drawdown: Math.round(seeded(k + 40) * 0.2 * 1e4) / 1e4,
    is_me: false,
  }));
  const everyone = [
    ...crowd,
    {
      player_id: ME,
      display_name: "You",
      nlv: state.nlv,
      sharpe: account.sharpe,
      max_drawdown: state.maxDrawdown,
      is_me: true,
    },
  ].sort((a, b) => b.nlv - a.nlv);
  const standings: TradingStandingRow[] = everyone.map((r, k) => ({
    ...r,
    rank: k + 1,
  }));

  return {
    instruments: PREVIEW_INSTRUMENTS,
    snapshot,
    account,
    positions,
    orders,
    fills,
    ledger,
    accountRounds,
    periods,
    standings,
    history: (slot) =>
      calendar
        .filter((d) => d <= last)
        .map((d) => {
          const b = bars[slot].get(d) as Bar;
          const [g, y, m, dd] = label(d);
          return [g, y, m, dd, b.o, b.h, b.l, b.c];
        }),
    truth: {
      // synthetic, so a made-up era is fine to show
      start_year: START_YEAR,
      host_picked_year: false,
      history_first_date: `${START_YEAR - 5}-01-02`,
      window_first_date: `${START_YEAR}-01-02`,
      window_last_date: periodRange(START_YEAR, "quarter", PREVIEW_ROUNDS).to,
      data_source: "synthetic",
      data_license: "dev-only",
      instruments: PREVIEW_INSTRUMENTS.map((i) => ({
        slot: i.slot,
        real_name: `(the real company behind ${i.ticker})`,
        real_ticker: "—",
        current_name: `(the real company behind ${i.ticker})`,
        current_ticker: "—",
        sector: i.sector,
        kind: i.kind,
      })),
    },
  };
}

function seeded(k: number): number {
  const r = seededRandom(1000 + k);
  return r();
}
