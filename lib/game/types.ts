// Shared game domain types. These mirror the Postgres schema and the SQL
// resolve_round function. Keep this in sync with supabase/migrations/*.sql.

export type PayoffMode = "moderate" | "extreme";
export type MarketOutcome = "good" | "bad";
export type MarketMode = "auto" | "manual";
export type MarketScope = "shared" | "independent";
export type SessionStatus = "lobby" | "active" | "finished";
export type RoundStatus = "open" | "locked" | "revealed";
export type GameType = "basic" | "portfolio";

/** Optional per-asset overrides (portfolio game). Missing keys fall back to the
 *  game-level good_prob / payoff_mode; missing name falls back to "Asset A…". */
export interface AssetConfig {
  name?: string;
  good_prob?: number;
  payoff_mode?: PayoffMode;
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
  /** portfolio only: optional per-asset overrides, length = num_assets */
  assets?: AssetConfig[] | null;
}

export function isPortfolio(config: SessionConfig): boolean {
  return config.game_type === "portfolio";
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
