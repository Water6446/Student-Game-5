// Row and RPC result shapes for the Markets section (supabase/migrations
// 0031-0033). Hand-written, like lib/game/db.ts. Numbers arrive from PostgREST
// as JSON numbers (numeric columns are cast by supabase-js as numbers).

import type { GameLabel } from "./clock";

export type InstrumentKind = "equity" | "index_fund";
export type OrderSide = "buy" | "sell" | "sell_short" | "buy_to_cover";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "round" | "gtc";
export type OrderStatus = "open" | "filled" | "canceled" | "rejected" | "expired";

/** session_instruments: the fake identity a session gives each slot. */
export interface SessionInstrumentRow {
  session_id: string;
  slot: number;
  kind: InstrumentKind;
  name: string;
  ticker: string;
  sector: string;
  about: string;
}

export interface MarketAccountRow {
  player_id: string;
  session_id: string;
  /** signed: negative is a margin loan; short-sale proceeds sit here */
  cash: number;
  /** net liquidation value at the last revealed close: the score */
  nlv: number;
  peak_nlv: number;
  max_drawdown: number;
  sharpe: number | null;
  frozen: boolean;
  last_order_at: string | null;
  updated_at: string;
}

export interface MarketPositionRow {
  player_id: string;
  session_id: string;
  slot: number;
  /** signed: negative is short */
  quantity: number;
  cost_basis: number;
  realized_pnl: number;
  updated_at: string;
}

export interface MarketOrderRow {
  id: string;
  session_id: string;
  player_id: string;
  slot: number;
  side: OrderSide;
  order_type: OrderType;
  quantity: number | null;
  notional: number | null;
  limit_price: number | null;
  stop_price: number | null;
  tif: TimeInForce;
  status: OrderStatus;
  reject_reason: string | null;
  /** a stop-limit whose stop has been hit; it rests as a limit order from then on (0034) */
  triggered: boolean;
  reserved: number;
  placed_round: number;
  placed_at: string;
  closed_at: string | null;
  client_ref: string | null;
  context: Record<string, unknown> | null;
}

export interface MarketFillRow {
  id: string;
  order_id: string | null;
  session_id: string;
  player_id: string;
  round_number: number;
  game_day: number;
  slot: number;
  side: OrderSide;
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  reason: "order" | "margin_call" | "delisting";
  created_at: string;
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

export interface MarketLedgerRow {
  id: string;
  session_id: string;
  player_id: string;
  round_number: number;
  game_day: number;
  kind: LedgerKind;
  amount: number;
  slot: number | null;
  fill_id: string | null;
  note: string | null;
  created_at: string;
}

export interface MarketAccountRoundRow {
  player_id: string;
  session_id: string;
  round_number: number;
  nlv_start: number;
  nlv_end: number;
  daily_nlv: number[];
  traded: number;
}

export interface PeriodHeadlineRow {
  /** game-relative year ("Year N") and calendar month */
  y: number;
  m: number;
  rank: number;
  text: string;
}

export interface MarketPeriodResultRow {
  session_id: string;
  round_number: number;
  first_game_day: number | null;
  last_game_day: number | null;
  index_return: number | null;
  /** the period's T-bill return, compounded daily (0034); the Sharpe's benchmark */
  rf_return: number | null;
  movers: { slot: number; ret: number }[];
  headlines: PeriodHeadlineRow[];
  created_at: string;
}

// ---- RPC results -----------------------------------------------------------------

/** get_market_snapshot */
export interface MarketSnapshot {
  as_of: GameLabel;
  revealed_rounds: number;
  /** what `change` is measured over: the last revealed period, or (before Year 1) the past year */
  change_basis: "period" | "year";
  instruments: {
    slot: number;
    last: number;
    prev: number | null;
    change: number | null;
    high_52w: number | null;
    low_52w: number | null;
    dividend_yield: number | null;
    /** weekly closes over the last year */
    spark: number[];
    delisted: boolean;
  }[];
}

/** get_price_history, daily: [game_day, year, month, day, o, h, l, c] */
export type DailyBar = [number, number, number, number, number, number, number, number];
/** get_price_history, weekly: [game_day, year, month, day, c] */
export type WeeklyBar = [number, number, number, number, number];

/** get_period_replay */
export interface PeriodReplay {
  round: number;
  days: GameLabel[];
  /** each slot's close before the period, keyed by slot */
  prev: Record<string, number>;
  series: { slot: number; c: number[] }[];
}

/** get_trading_standings */
export interface TradingStandingRow {
  player_id: string;
  display_name: string;
  nlv: number;
  rank: number;
  sharpe: number | null;
  max_drawdown: number;
  is_me: boolean;
}

/** get_class_activity */
export interface ClassActivity {
  round: number;
  players: number;
  players_with_orders: number;
  orders: number;
  most_bought: { slot: number; players: number }[];
}

/** get_market_data_options (0037): which markets this database can run */
export interface MarketDataOptions {
  historical: boolean;
  simulated: boolean;
}

/** get_trading_truth (host any time; students once finished) */
export interface TradingTruth {
  start_year: number;
  host_picked_year: boolean;
  history_first_date: string;
  window_first_date: string;
  window_last_date: string;
  data_source: string;
  data_license: "dev-only" | "display-licensed";
  instruments: {
    slot: number;
    /** the name and ticker in the session's era */
    real_name: string;
    real_ticker: string;
    /** what the history is called today */
    current_name: string;
    current_ticker: string;
    sector: string;
    kind: InstrumentKind;
  }[];
}

/** get_trading_reveal (0036): the end-of-game reveal, finished sessions only. */
export interface TradingReveal {
  start_year: number;
  window_first_date: string;
  window_last_date: string;
  /** the last played day (the game may finish before its window runs out) */
  played_last_date: string | null;
  starting_cash: number;
  /** buying the index fund on day one and holding it */
  index_return: number | null;
  periods: {
    round: number;
    first_date: string;
    last_date: string;
    index_return: number | null;
    /** that period's real headlines, "YYYY-MM" */
    headlines: { month: string; text: string }[];
  }[];
  instruments: {
    slot: number;
    kind: InstrumentKind;
    sector: string;
    /** the name and ticker students traded under */
    name: string;
    ticker: string;
    real_name: string;
    real_ticker: string;
    current_name: string;
    /** last close before Year 1 to the last played day, prices only; null if it stopped trading */
    price_change: number | null;
  }[];
  /** the caller's own fills (none for the host) */
  my_fills: RevealFill[];
  /** by final value; names and ids only for the host (and the student's own row) */
  class: RevealClassRow[];
}

export interface RevealFill {
  round: number;
  /** real date, YYYY-MM-DD */
  date: string;
  slot: number;
  side: OrderSide;
  quantity: number;
  price: number;
  notional: number;
  reason: "order" | "margin_call" | "delisting";
}

export interface RevealClassRow {
  player_id: string | null;
  name: string | null;
  is_me: boolean;
  nlv: number;
  return: number;
  /** annual turnover: 1 = the whole account traded once a year */
  turnover: number;
  sharpe: number | null;
  max_drawdown: number;
  trades: number;
}
