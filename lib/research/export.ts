// The research export (section-level): the shape export_research_data (0035)
// returns, and the CSV files the host downloads from it. Pure.
//
// Students appear only as pseudonyms ("P" + 8 hex characters); the server
// leaves out names, account ids and the host's label, and, in research mode,
// every student who has not agreed. These files add nothing to that.

import { toCsv } from "../game/csv";
import type { FrictionProfile } from "../game/types";
import type { FrictionKnobs } from "./friction";
import { SUMMARY_KEYS, type ArmSummary, type PlayerMetrics } from "./metrics";

export interface ExportSession {
  status: string;
  created_at: string;
  current_round: number;
  config: Record<string, unknown>;
  /** the real first trading day of Year 1, to turn game days into dates */
  window_first_date: string;
  players_total: number;
  players_included: number;
}

export interface ExportPlayer {
  pid: string;
  arm: FrictionProfile;
  /** null outside research mode (nobody is asked) */
  consented: boolean | null;
  active: boolean;
  joined_at: string;
  nlv: number | null;
  max_drawdown: number | null;
  sharpe: number | null;
  frozen: boolean | null;
  knobs: FrictionKnobs;
}

export interface ExportRound {
  round: number;
  status: string;
  opened_at: string | null;
  closes_at: string | null;
  locked_at: string | null;
  revealed_at: string | null;
  first_game_day: number | null;
  last_game_day: number | null;
  index_return: number | null;
  /** the period's biggest company moves, [{slot, ret}] */
  movers: { slot: number; ret: number }[];
}

export interface ExportAccountRound {
  pid: string;
  round: number;
  nlv_start: number;
  nlv_end: number;
  traded: number;
}

export interface ExportOrder {
  order_id: string;
  pid: string;
  /** the round it was placed in */
  round: number;
  slot: number;
  side: "buy" | "sell" | "sell_short" | "buy_to_cover";
  order_type: string;
  quantity: number | null;
  notional: number | null;
  limit_price: number | null;
  stop_price: number | null;
  tif: string;
  status: string;
  reject_reason: string | null;
  placed_at: string;
  closed_at: string | null;
  /** what the student saw when they placed it (TradeTicket / quick buy) */
  context: Record<string, unknown> | null;
}

export interface ExportFill {
  order_id: string | null;
  pid: string;
  round: number;
  game_day: number;
  slot: number;
  side: "buy" | "sell" | "sell_short" | "buy_to_cover";
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  reason: "order" | "margin_call" | "delisting";
}

export interface ExportInstrument {
  slot: number;
  kind: "equity" | "index_fund";
  ticker: string;
  sector: string;
}

export interface ExportPeriodClose {
  round: number;
  slot: number;
  close: number;
}

/** export_research_data(session, 'tables') */
export interface ResearchTables {
  exported_at: string;
  session: ExportSession;
  players: ExportPlayer[];
  rounds: ExportRound[];
  account_rounds: ExportAccountRound[];
  orders: ExportOrder[];
  fills: ExportFill[];
  instruments: ExportInstrument[];
  period_closes: ExportPeriodClose[];
}

export interface ExportEvent {
  id: number;
  pid: string;
  round: number | null;
  type: string;
  client_ts: string | null;
  server_ts: string;
  payload: Record<string, unknown>;
}

/** export_research_data(session, 'events', after): 5,000 a page; follow `next` until null. */
export interface EventsPage {
  events: ExportEvent[];
  next: number | null;
}

// ---- CSV -------------------------------------------------------------------------

type Cell = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

const cell = (v: Cell): string | number => {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
};

function table<T>(columns: readonly (keyof T & string)[], rows: readonly T[]): string {
  return toCsv([columns as unknown as string[], ...rows.map((r) => columns.map((c) => cell(r[c] as Cell)))]);
}

const KNOB_COLUMNS = [
  "one_tap_buy",
  "amount_chips",
  "review_step",
  "typed_confirmation",
  "cooldown_seconds",
  "risk_disclosure",
  "celebrate_fills",
  "show_movers",
  "show_class_popular",
] as const;

const METRIC_COLUMNS = [
  "rounds",
  "orders",
  "orders_per_round",
  "trades",
  "trades_per_round",
  "turnover",
  "final_return",
  "tickets_opened",
  "abandon_rate",
  "ticket_ms_median",
  "review_ms_median",
  "hhi_mean",
  "index_share_mean",
  "leverage_mean",
  "leverage_max",
  "short_rounds",
  "sell_after_loss",
  "sell_after_gain",
  "chasing",
  "pgr",
  "plr",
  "disposition",
  "doubling_down",
] as const satisfies readonly (keyof PlayerMetrics)[];

/** One row per student: who they are (pseudonym, arm, knobs), how it ended, and every metric. */
export function playersCsv(t: ResearchTables, metrics: PlayerMetrics[]): string {
  const byPid = new Map(metrics.map((m) => [m.pid, m]));
  const header = [
    "pid",
    "arm",
    "consented",
    "active",
    "joined_at",
    "nlv",
    "max_drawdown",
    "sharpe",
    "frozen",
    ...KNOB_COLUMNS,
    ...METRIC_COLUMNS,
  ];
  const rows = t.players.map((p) => {
    const m = byPid.get(p.pid);
    return [
      p.pid,
      p.arm,
      p.consented,
      p.active,
      p.joined_at,
      p.nlv,
      p.max_drawdown,
      p.sharpe,
      p.frozen,
      ...KNOB_COLUMNS.map((k) => p.knobs?.[k]),
      ...METRIC_COLUMNS.map((k) => (m ? m[k] : null)),
    ].map((v) => cell(v as Cell));
  });
  return toCsv([header, ...rows]);
}

export function ordersCsv(t: ResearchTables): string {
  return table<ExportOrder>(
    [
      "order_id",
      "pid",
      "round",
      "slot",
      "side",
      "order_type",
      "quantity",
      "notional",
      "limit_price",
      "stop_price",
      "tif",
      "status",
      "reject_reason",
      "placed_at",
      "closed_at",
      "context",
    ],
    t.orders,
  );
}

export function fillsCsv(t: ResearchTables): string {
  return table<ExportFill>(
    ["order_id", "pid", "round", "game_day", "slot", "side", "quantity", "price", "notional", "commission", "reason"],
    t.fills,
  );
}

/** Each round's clock (opened, closes, locked, revealed) and its market. */
export function roundsCsv(t: ResearchTables): string {
  return table<ExportRound>(
    [
      "round",
      "status",
      "opened_at",
      "closes_at",
      "locked_at",
      "revealed_at",
      "first_game_day",
      "last_game_day",
      "index_return",
      "movers",
    ],
    t.rounds,
  );
}

export function accountRoundsCsv(t: ResearchTables): string {
  return table<ExportAccountRound>(["pid", "round", "nlv_start", "nlv_end", "traded"], t.account_rounds);
}

export function eventsCsv(events: readonly ExportEvent[]): string {
  return table<ExportEvent>(["id", "pid", "round", "type", "client_ts", "server_ts", "payload"], events);
}

/** "sharpesim-research-AB12CD-orders.csv" */
/** One row per friction arm: students and the mean of each summary metric. */
export function armsCsv(arms: readonly ArmSummary[]): string {
  const cols = ["arm", "players", ...SUMMARY_KEYS] as const;
  return toCsv([[...cols], ...arms.map((a) => cols.map((c) => cell(a[c as keyof ArmSummary] as Cell)))]);
}

export function exportFileName(joinCode: string, part: string): string {
  return `sharpesim-research-${joinCode.replace(/[^A-Za-z0-9]/g, "")}-${part}.csv`;
}
