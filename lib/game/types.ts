// Shared game domain types. These mirror the Postgres schema and the SQL
// resolve_round function. Keep this in sync with supabase/migrations/*.sql.

export type PayoffMode = "moderate" | "extreme";
export type MarketOutcome = "good" | "bad";
export type MarketMode = "auto" | "manual";
export type MarketScope = "shared" | "independent";
export type SessionStatus = "lobby" | "active" | "finished";
export type RoundStatus = "open" | "locked" | "revealed";
export type GameType = "basic" | "portfolio" | "manager";
export type FeeType = "flat" | "performance";
export type ManagerPreset = "default" | "hedge_fund" | "market_neutral";

/** Optional per-asset overrides (portfolio game). Missing keys fall back to the
 *  game-level good_prob / payoff_mode; missing name falls back to "Asset A…". */
export interface AssetConfig {
  name?: string;
  good_prob?: number;
  payoff_mode?: PayoffMode;
}

/**
 * PUBLIC per-manager data — everything a student is allowed to see. The true
 * parameters (beta, alpha, tracking_error) live in the server-only
 * session_secrets table and come back from get_manager_truth() once the game is
 * finished. Fees are public on purpose: real prospectuses disclose them, and the
 * fee counter needs them client-side.
 */
export interface ManagerPublic {
  name: string;
  strategy_line: string;
  fee_type: FeeType;
  /** 0.01 = 1%/yr on allocated assets, charged even in down years */
  mgmt_fee: number;
  /** 0.20 = 20% of the positive GROSS return; 0 for flat-fee funds */
  perf_fee: number;
  track_record: {
    /** exactly 10 years, net of fees, as a prospectus reports them */
    yearly: number[];
    one_yr: number;
    /** annualized */
    five_yr: number;
    /** annualized */
    ten_yr: number;
  };
  /** derived from the realised displayed path, never from the true parameters */
  vol_label: "Low" | "Moderate" | "High" | "Very high";
}

/** The truth behind a manager. Only ever obtained from get_manager_truth(). */
export interface ManagerTruth {
  name: string;
  beta: number;
  alpha: number;
  tracking_error: number;
}

export interface SessionConfig {
  /** absent on pre-portfolio sessions → treat as "basic" (see isPortfolio) */
  game_type?: GameType;
  payoff_mode: PayoffMode;
  num_rounds: number;
  starting_wealth: number;
  good_prob: number;
  market_mode: MarketMode;
  /** basic: one outcome per round (shared) or per player (independent).
   *  portfolio: one outcome per ASSET (shared) or per player × asset (independent). */
  market_scope: MarketScope;
  show_full_leaderboard_to_students: boolean;
  /** when true, students see the current good/bad market odds each round (auto mode) */
  show_odds_to_students: boolean;
  /** when true, 4 fixed-strategy benchmark "bot" players are added to the session */
  add_benchmark_bots: boolean;
  allow_late_join: boolean;
  /** portfolio only: number of independent risky assets (2..10) */
  num_assets?: number;
  /** portfolio only: per-round interest on the safe bucket (0 = flat, like basic) */
  risk_free_rate?: number;
  /** portfolio only: ρ — how much assets move together. 0 = independent
   *  (default), 1 = one market (the basic game). Marginal odds are unaffected. */
  correlation?: number;
  /** portfolio only: optional per-asset overrides, length = num_assets */
  assets?: AssetConfig[] | null;

  // ── manager game only ────────────────────────────────────────────────────
  /** public manager data, length = num_managers; written by create_session */
  managers?: ManagerPublic[];
  /** 1..8, default 5 */
  num_managers?: number;
  /** expected index return per year, default 0.08 */
  market_mean?: number;
  /** index volatility per year, default 0.16 */
  market_sd?: number;
  /** borrow_rate = risk_free_rate + borrow_spread, default 0.05 → 0.08 */
  borrow_spread?: number;
  /** max allocation as a multiple of wealth. 2.0 (Reg-T) default; 1.0 = no leverage */
  leverage_cap?: number;
  /** permute which slot holds the real alpha, default true */
  shuffle_skill?: boolean;
  manager_preset?: ManagerPreset;
}

export function isPortfolio(config: SessionConfig): boolean {
  return config.game_type === "portfolio";
}

export function isManager(config: SessionConfig): boolean {
  return config.game_type === "manager";
}

export const DEFAULT_CONFIG: SessionConfig = {
  game_type: "basic",
  payoff_mode: "moderate",
  num_rounds: 25,
  starting_wealth: 100,
  good_prob: 0.6,
  market_mode: "auto",
  market_scope: "shared",
  show_full_leaderboard_to_students: true,
  show_odds_to_students: true,
  add_benchmark_bots: false,
  allow_late_join: false,
};
