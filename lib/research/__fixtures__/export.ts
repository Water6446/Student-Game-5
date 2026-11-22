// A small synthetic research export for the metrics and CSV tests: three
// quarters, an index fund and three companies, one active student (P1) and
// one who never traded (P2). Never vendor data.

import { FRICTION_PRESETS } from "../friction";
import type { ExportFill, ExportOrder, ResearchTables } from "../export";

const order = (
  id: string,
  round: number,
  slot: number,
  side: ExportOrder["side"],
  quantity: number,
  context: Record<string, unknown> | null = null,
): ExportOrder => ({
  order_id: id,
  pid: "P1",
  round,
  slot,
  side,
  order_type: "market",
  quantity,
  notional: null,
  limit_price: null,
  stop_price: null,
  tif: "round",
  status: "filled",
  reject_reason: null,
  placed_at: `2026-01-0${round}T10:00:00Z`,
  closed_at: null,
  context,
});

const fill = (
  orderId: string,
  round: number,
  slot: number,
  side: ExportFill["side"],
  quantity: number,
  price: number,
): ExportFill => ({
  order_id: orderId,
  pid: "P1",
  round,
  game_day: (round - 1) * 91,
  slot,
  side,
  quantity,
  price,
  notional: quantity * price,
  commission: 0,
  reason: "order",
});

export const EXPORT_FIXTURE: ResearchTables = {
  exported_at: "2026-01-10T00:00:00Z",
  session: {
    status: "finished",
    created_at: "2026-01-01T00:00:00Z",
    current_round: 3,
    config: { game_type: "trading", period: "quarter", research_mode: true },
    window_first_date: "1990-01-02",
    players_total: 3,
    players_included: 2,
  },
  players: [
    {
      pid: "P1",
      arm: "low",
      consented: true,
      active: true,
      joined_at: "2026-01-01T09:00:00Z",
      nlv: 10050,
      max_drawdown: 0.02,
      sharpe: 0.1,
      frozen: false,
      knobs: FRICTION_PRESETS.low,
    },
    {
      pid: "P2",
      arm: "high",
      consented: true,
      active: true,
      joined_at: "2026-01-01T09:01:00Z",
      nlv: 10000,
      max_drawdown: 0,
      sharpe: null,
      frozen: false,
      knobs: FRICTION_PRESETS.high,
    },
  ],
  rounds: [1, 2, 3].map((round) => ({
    round,
    status: "revealed",
    opened_at: `2026-01-0${round}T09:58:00Z`,
    closes_at: `2026-01-0${round}T10:00:30Z`,
    locked_at: `2026-01-0${round}T10:00:40Z`,
    revealed_at: `2026-01-0${round}T10:00:41Z`,
    first_game_day: (round - 1) * 91,
    last_game_day: round * 91 - 1,
    index_return: 0.02,
    movers:
      round === 1
        ? [
            { slot: 1, ret: 0.2 },
            { slot: 2, ret: -0.1 },
          ]
        : round === 2
          ? [
              { slot: 3, ret: 0.15 },
              { slot: 1, ret: -0.05 },
            ]
          : [],
  })),
  account_rounds: [
    { pid: "P1", round: 1, nlv_start: 10000, nlv_end: 9800, traded: 10980 },
    { pid: "P1", round: 2, nlv_start: 9800, nlv_end: 10100, traded: 8250 },
    { pid: "P1", round: 3, nlv_start: 10100, nlv_end: 10050, traded: 1260 },
    { pid: "P2", round: 1, nlv_start: 10000, nlv_end: 10000, traded: 0 },
    { pid: "P2", round: 2, nlv_start: 10000, nlv_end: 10000, traded: 0 },
    { pid: "P2", round: 3, nlv_start: 10000, nlv_end: 10000, traded: 0 },
  ],
  orders: [
    order("o1", 1, 1, "buy", 100, { ticket_ms: 4000, review_ms: 1000, from: "stock" }),
    order("o2", 1, 2, "buy", 100, { ticket_ms: 6000, review_ms: null }),
    order("o3", 1, 0, "buy", 10, { ticket_ms: 8000, review_ms: 3000 }),
    order("o4", 2, 1, "sell", 100),
    order("o5", 2, 2, "buy", 50),
    order("o7", 3, 3, "buy", 20),
    order("o8", 3, 1, "sell_short", 10),
  ],
  fills: [
    fill("o1", 1, 1, "buy", 100, 50),
    fill("o2", 1, 2, "buy", 100, 50),
    fill("o3", 1, 0, "buy", 10, 98),
    fill("o4", 2, 1, "sell", 100, 60),
    fill("o5", 2, 2, "buy", 50, 45),
    fill("o7", 3, 3, "buy", 20, 34.5),
    fill("o8", 3, 1, "sell_short", 10, 57),
  ],
  instruments: [
    { slot: 0, kind: "index_fund", ticker: "TMIX", sector: "Index fund" },
    { slot: 1, kind: "equity", ticker: "AAAA", sector: "Technology" },
    { slot: 2, kind: "equity", ticker: "BBBB", sector: "Energy" },
    { slot: 3, kind: "equity", ticker: "CCCC", sector: "Industrials" },
  ],
  period_closes: [
    { round: 1, slot: 0, close: 100 },
    { round: 1, slot: 1, close: 60 },
    { round: 1, slot: 2, close: 45 },
    { round: 1, slot: 3, close: 30 },
    { round: 2, slot: 0, close: 102 },
    { round: 2, slot: 1, close: 57 },
    { round: 2, slot: 2, close: 50 },
    { round: 2, slot: 3, close: 34.5 },
    { round: 3, slot: 0, close: 104 },
    { round: 3, slot: 1, close: 55 },
    { round: 3, slot: 2, close: 52 },
    { round: 3, slot: 3, close: 33 },
  ],
};
