// Shared game domain types. These mirror the Postgres schema and the SQL
// resolve_round function. Keep this in sync with supabase/migrations/*.sql.

export type PayoffMode = "moderate" | "extreme";
export type MarketOutcome = "good" | "bad";
export type MarketMode = "auto" | "manual";
export type MarketScope = "shared" | "independent";
export type SessionStatus = "lobby" | "active" | "finished";
export type RoundStatus = "open" | "locked" | "revealed";
/** "trading" is the Markets section's paper trading game (docs/PAPER_TRADING.md);
 *  its sessions live under /markets/trade/… and never render as a basic game. */
export type GameType = "basic" | "portfolio" | "manager" | "trading";
/** paper trading: the length of one round */
export type TradingPeriod = "year" | "half" | "quarter" | "month" | "week";
export type FrictionProfile = "low" | "standard" | "high";
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
  /** the passive index fund create_session appends to the line-up: tracks the
   *  index exactly (beta 1, no alpha, no tracking error) and is never part of
   *  the skill shuffle. Public on purpose — the name says it anyway. */
  index_fund?: boolean;
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
  /** host's own name for the run ("ECON 101 — Section B"). Trimmed, capped at
   *  80 chars and dropped when blank by the trigger in 0023. */
  label?: string;
  payoff_mode: PayoffMode;
  num_rounds: number;
  starting_wealth: number;
  /** ABSENT while the host hides the odds and the game is running — the server
   *  keeps them in session_secrets then (0029). Host screens merge them back
   *  via applyHiddenOdds (hidden-odds.ts); read it as `good_prob ?? 0.6`. */
  good_prob?: number;
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
  /** the whole line-up, index fund included once create_session has run.
   *  The host picks 1..8 active managers; the index fund makes it up to 9. */
  num_managers?: number;
  /** append a passive index fund (0.05%/yr) to the line-up, default true */
  index_fund?: boolean;
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

  // ── paper trading only (defaults: TRADING_DEFAULTS in lib/markets/trading/config.ts,
  //    mirrored by _trading_config_defaults in 0033) ─────────────────────────
  period?: TradingPeriod;
  /** the trading window each round, seconds */
  round_seconds?: number;
  /** companies traded (the index fund comes on top); the server writes what it found */
  universe_size?: number;
  /** years of real history shown before Year 1; set by the server */
  history_years?: number;
  margin_enabled?: boolean;
  initial_margin?: number;
  maint_long?: number;
  maint_short?: number;
  shorting_enabled?: boolean;
  /** annual fee on the value of short positions */
  borrow_fee?: number;
  /** bid-ask spread as a fraction of price; half is paid on each side */
  spread?: number;
  /** dollars per trade */
  commission?: number;
  headlines?: boolean;
  friction_profile?: FrictionProfile;
  /** "per_player": each student gets one of friction_arms on joining (0035) */
  friction_assignment?: "session" | "per_player";
  friction_arms?: FrictionProfile[];
  /** single friction knobs set on top of the profile (lib/research/friction.ts) */
  friction_overrides?: Record<string, boolean | number>;
  research_mode?: boolean;
  /** real history, or the simulated market (0037); the server writes the one it played */
  market_data?: "historical" | "simulated";
  /** set by the server: which vendor's data, and what its licence allows */
  data_source?: string;
  data_license?: "dev-only" | "display-licensed";
}

export function isPortfolio(config: SessionConfig): boolean {
  return config.game_type === "portfolio";
}

export function isManager(config: SessionConfig): boolean {
  return config.game_type === "manager";
}

export function isTrading(config: SessionConfig): boolean {
  return config.game_type === "trading";
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
