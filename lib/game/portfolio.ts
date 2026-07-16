// Pure portfolio-game math — the TS mirror of the portfolio branch in
// supabase/migrations/0010_portfolio.sql (resolve_round). Used only for
// previews, benchmarks/counterfactuals and tests; the SQL is authoritative.

import { riskyMultiplier } from "./math";
import type { MarketOutcome, PayoffMode, SessionConfig } from "./types";

/** Default asset labels: "Asset A", "Asset B", … (overridable per asset). */
export function assetName(config: SessionConfig, index: number): string {
  const custom = config.assets?.[index]?.name?.trim();
  return custom || `Asset ${String.fromCharCode(65 + index)}`;
}

export function numAssets(config: SessionConfig): number {
  return config.num_assets ?? 4;
}

export function assetGoodProb(config: SessionConfig, index: number): number {
  return config.assets?.[index]?.good_prob ?? config.good_prob ?? 0.6;
}

export function assetPayoffMode(config: SessionConfig, index: number): PayoffMode {
  return config.assets?.[index]?.payoff_mode ?? config.payoff_mode;
}

/** True when any asset overrides the game-level odds or payoff mode. */
export function hasCustomAssets(config: SessionConfig): boolean {
  return (config.assets ?? []).some(
    (a) => a && (a.good_prob != null || a.payoff_mode != null || (a.name ?? "").trim() !== ""),
  );
}

/**
 * Client-side validation of a per-asset allocation. Mirrors
 * submit_portfolio_allocation: every amount finite and >= 0, sum <= wealth
 * (tiny epsilon for float rounding). Returns the total allocated.
 */
export function validatePortfolioAmounts(currentWealth: number, amounts: number[]): number {
  let sum = 0;
  for (const a of amounts) {
    if (!Number.isFinite(a) || a < 0) {
      throw new Error(`asset amounts must be finite and >= 0, got ${a}`);
    }
    sum += a;
  }
  if (sum > currentWealth + 1e-6) {
    throw new Error(`total allocated (${sum}) exceeds current wealth (${currentWealth})`);
  }
  return Math.min(sum, currentWealth);
}

/**
 * Resolve one player's portfolio round:
 *   result = safe · (1 + risk_free_rate) + Σ amount_i · multiplier_i
 * where safe = wealth − Σ amounts. Mirrors the SQL exactly.
 */
export function resolvePortfolio(
  config: SessionConfig,
  currentWealth: number,
  amounts: number[],
  outcomes: MarketOutcome[],
): number {
  const sum = validatePortfolioAmounts(currentWealth, amounts);
  const rf = config.risk_free_rate ?? 0;
  let result = (currentWealth - sum) * (1 + rf);
  for (let i = 0; i < amounts.length; i++) {
    result += amounts[i] * riskyMultiplier(assetPayoffMode(config, i), outcomes[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Benchmark strategies (bots + end-of-game counterfactual cards).
// The single source of truth for what each fixed strategy bets, mirrored by
// the SQL in resolve_round's portfolio branch.
// ---------------------------------------------------------------------------

export type PortfolioStrategyKey =
  | "all_safe"
  | "concentrated"
  | "half_diversified"
  | "diversified";

export const PORTFOLIO_STRATEGY_KEYS: PortfolioStrategyKey[] = [
  "all_safe",
  "concentrated",
  "half_diversified",
  "diversified",
];

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split `wealth` evenly across `n` assets in whole cents without ever
 * exceeding it: the first n−1 assets get the rounded share, the LAST asset
 * absorbs the rounding remainder (e.g. $337.50 / 4 → 84.38 ×3 + 84.36).
 */
export function equalSplitAmounts(wealth: number, n: number): number[] {
  if (n <= 0 || wealth <= 0) return Array.from({ length: Math.max(n, 0) }, () => 0);
  let share = cents(wealth / n);
  let last = cents(wealth - share * (n - 1));
  if (last < 0) {
    // pathological micro-wealth (rounded share overshoots): floor the share
    share = Math.floor((wealth * 100) / n) / 100;
    last = cents(wealth - share * (n - 1));
  }
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? last : share));
}

/** Per-asset dollar amounts a strategy bets from `wealth` across `n` assets. */
export function portfolioStrategyAmounts(
  strategy: string | null | undefined,
  wealth: number,
  n: number,
): number[] {
  switch (strategy) {
    case "concentrated":
      return Array.from({ length: n }, (_, i) => (i === 0 ? wealth : 0));
    case "diversified":
      return Array.from({ length: n }, () => wealth / n);
    case "half_diversified":
      return Array.from({ length: n }, () => (wealth * 0.5) / n);
    default:
      return Array.from({ length: n }, () => 0); // all_safe / unknown
  }
}

/** Total share of wealth a portfolio strategy puts at risk (for risk meters). */
export function portfolioStrategyFraction(strategy: string | null | undefined): number {
  switch (strategy) {
    case "concentrated":
    case "diversified":
      return 1;
    case "half_diversified":
      return 0.5;
    default:
      return 0;
  }
}

/**
 * Final wealth from following one fixed strategy every round, under the
 * per-round asset outcomes that actually happened.
 */
export function portfolioStrategyFinalWealth(
  config: SessionConfig,
  startWealth: number,
  outcomesByRound: MarketOutcome[][],
  strategy: PortfolioStrategyKey,
): number {
  const n = numAssets(config);
  let w = startWealth;
  for (const outcomes of outcomesByRound) {
    w = resolvePortfolio(config, w, portfolioStrategyAmounts(strategy, w, n), outcomes);
  }
  return w;
}

/** All four reference strategies' finals for the same outcome sequence. */
export function allPortfolioStrategyOutcomes(
  config: SessionConfig,
  startWealth: number,
  outcomesByRound: MarketOutcome[][],
): Record<PortfolioStrategyKey, number> {
  return Object.fromEntries(
    PORTFOLIO_STRATEGY_KEYS.map((k) => [
      k,
      portfolioStrategyFinalWealth(config, startWealth, outcomesByRound, k),
    ]),
  ) as Record<PortfolioStrategyKey, number>;
}
