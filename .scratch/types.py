import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("lib/game/types.ts", [
(
'''export type GameType = "basic" | "portfolio";''',
'''export type GameType = "basic" | "portfolio" | "manager";
export type FeeType = "flat" | "performance";
export type ManagerPreset = "default" | "hedge_fund" | "market_neutral";'''
),
(
'''export interface SessionConfig {''',
'''/**
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

export interface SessionConfig {'''
),
(
'''  /** portfolio only: optional per-asset overrides, length = num_assets */
  assets?: AssetConfig[] | null;
}''',
'''  /** portfolio only: optional per-asset overrides, length = num_assets */
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
}'''
),
(
'''export function isPortfolio(config: SessionConfig): boolean {
  return config.game_type === "portfolio";
}''',
'''export function isPortfolio(config: SessionConfig): boolean {
  return config.game_type === "portfolio";
}

export function isManager(config: SessionConfig): boolean {
  return config.game_type === "manager";
}'''
),
])

patch("lib/game/db.ts", [
(
'''  /** portfolio, shared scope: one outcome per asset (written at reveal) */
  market_outcomes?: MarketOutcome[] | null;
  revealed_at: string | null;''',
'''  /** portfolio, shared scope: one outcome per asset (written at reveal) */
  market_outcomes?: MarketOutcome[] | null;
  /** manager game: the year's index return (written at reveal) */
  market_return?: number | null;
  /** manager game: [r0..rn-1] GROSS manager returns (written at reveal) */
  manager_returns?: number[] | null;
  revealed_at: string | null;'''
),
(
'''  resulting_wealth: number | null;
  submitted_at: string;''',
'''  /** manager game: total fees charged this year, in dollars */
  fees_paid?: number | null;
  /** manager game: [{mgmt, perf}, ...] dollars per manager */
  fee_breakdown?: { mgmt: number; perf: number }[] | null;
  resulting_wealth: number | null;
  submitted_at: string;'''
),
(
'''  strategy: string | null; // 'all_safe' | 'edge' | 'fifty_fifty' | 'all_risky' for bots''',
'''  // 'all_safe' | 'edge' | 'fifty_fifty' | 'all_risky' | portfolio keys, or
  // 'index' — the manager game's lone benchmark
  strategy: string | null;'''
),
])
