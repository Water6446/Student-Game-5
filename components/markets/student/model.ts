// The data the student screens render and the actions they can take. The live
// container (TradingPlay) fills it from Supabase; the dev preview fills it from
// fixtures. The screens never talk to the database themselves.

import type { GameLabel } from "@/lib/markets/clock";
import type {
  ClassActivity,
  DailyBar,
  MarketAccountRoundRow,
  MarketFillRow,
  MarketLedgerRow,
  MarketOrderRow,
  MarketPeriodResultRow,
  OrderSide,
  OrderType,
  TimeInForce,
  TradingReveal,
  TradingStandingRow,
  TradingTruth,
} from "@/lib/markets/db";
import type { TradingConfig } from "@/lib/markets/trading/config";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import type { AccountView, Listing, PositionView } from "@/lib/markets/trading/view";
import type { FrictionKnobs } from "@/lib/research/friction";
import type { LogFn } from "@/components/use-behavior-log";
import type { MarketPositionRow } from "@/lib/markets/db";

export interface TradingModel {
  sessionId: string;
  cfg: TradingConfig;
  phase: TradingPhase;
  /** the session's current round (0 in the lobby) */
  round: number;
  closesAt: string | null;
  me: { id: string; name: string };
  /** the last revealed close */
  asOf: GameLabel | null;
  changeBasis: "period" | "year";
  listings: Listing[];
  account: AccountView;
  positions: PositionView[];
  rawPositions: MarketPositionRow[];
  orders: MarketOrderRow[];
  fills: MarketFillRow[];
  ledger: MarketLedgerRow[];
  accountRounds: MarketAccountRoundRow[];
  periods: MarketPeriodResultRow[];
  standings: TradingStandingRow[] | null;
  activity: ClassActivity | null;
  /** this student's friction (get_my_conditions): the knobs only, never the arm */
  knobs: FrictionKnobs;
  /** research mode and this student's consent answer (null: not answered yet) */
  research: { mode: boolean; consent: boolean | null };
  /** when this student's last order was placed (the cooldown counts from it) */
  lastOrderAt: string | null;
  /** instruments and prices have arrived */
  ready: boolean;
}

export interface OrderInput {
  slot: number;
  side: OrderSide;
  order_type: OrderType;
  quantity: number | null;
  notional: number | null;
  limit_price: number | null;
  stop_price: number | null;
  tif: TimeInForce;
  /** idempotency key: a retried tap returns the first attempt's order */
  client_ref: string;
}

export interface TradingActions {
  placeOrder: (order: OrderInput, context: Record<string, unknown>) => Promise<string | null>;
  cancelOrder: (orderId: string) => Promise<string | null>;
  rename: (name: string) => Promise<string | null>;
  loadHistory: (slot: number) => Promise<DailyBar[]>;
  /** the real companies and dates: only once the game is over */
  loadTruth: () => Promise<TradingTruth | null>;
  /** the end-of-game reveal (get_trading_reveal): finished only; null on failure */
  loadReveal: () => Promise<TradingReveal | null>;
  /** the consent screen's answer (research mode); an error message or null */
  answerConsent: (yes: boolean) => Promise<string | null>;
  log: LogFn;
}
