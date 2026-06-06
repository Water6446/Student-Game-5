// Shared game domain types. These mirror the Postgres schema and the SQL
// resolve_round function. Keep this in sync with supabase/migrations/*.sql.

export type PayoffMode = "moderate" | "extreme";
export type MarketOutcome = "good" | "bad";
export type MarketMode = "auto" | "manual";
export type MarketScope = "shared" | "independent";
export type SessionStatus = "lobby" | "active" | "finished";
export type RoundStatus = "open" | "locked" | "revealed";

export interface SessionConfig {
  payoff_mode: PayoffMode;
  num_rounds: number;
  starting_wealth: number;
  good_prob: number;
  market_mode: MarketMode;
  market_scope: MarketScope;
  show_full_leaderboard_to_students: boolean;
  /** when true, students see the current good/bad market odds each round (auto mode) */
  show_odds_to_students: boolean;
  allow_late_join: boolean;
}

export const DEFAULT_CONFIG: SessionConfig = {
  payoff_mode: "moderate",
  num_rounds: 25,
  starting_wealth: 100,
  good_prob: 0.6,
  market_mode: "auto",
  market_scope: "shared",
  show_full_leaderboard_to_students: true,
  show_odds_to_students: true,
  allow_late_join: false,
};
