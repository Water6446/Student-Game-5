// Pure counterfactual math: "what if you'd followed one fixed strategy the whole
// game, under the market outcomes that actually happened?" Deterministic and
// testable; no DB types here (see results.ts for the row-shaped derivation).

import { riskyMultiplier } from "./math";
import type { MarketOutcome, PayoffMode } from "./types";

export type StrategyKey = "all_safe" | "edge" | "fifty_fifty" | "all_risky";

/**
 * The "betting edge" = P(good) − P(bad) = 2·goodProb − 1, clamped to [0, 1].
 * In the base 60/40 game this is 0.20 (bet 20% of wealth each round). Purely
 * probability-based — it does not depend on the payoff multipliers.
 */
export function edgeFraction(goodProb: number): number {
  return Math.min(1, Math.max(0, 2 * goodProb - 1));
}

/**
 * Final wealth from applying a FIXED risky fraction every round under `outcomes`.
 * Each round: W' = safe + risky*m = W*((1-f) + f*m), so
 *   W_final = W0 * Π ((1-f) + f*m_round).
 */
export function strategyFinalWealth(
  startWealth: number,
  outcomes: MarketOutcome[],
  mode: PayoffMode,
  fraction: number,
): number {
  let w = startWealth;
  for (const o of outcomes) {
    const m = riskyMultiplier(mode, o);
    w = w * (1 - fraction + fraction * m);
  }
  return w;
}

/**
 * The four reference strategies' final wealth for the same outcome sequence.
 * The "edge" strategy bets edgeFraction(goodProb) of wealth each round.
 */
export function allStrategyOutcomes(
  startWealth: number,
  outcomes: MarketOutcome[],
  mode: PayoffMode,
  goodProb: number,
): Record<StrategyKey, number> {
  return {
    all_safe: strategyFinalWealth(startWealth, outcomes, mode, 0),
    edge: strategyFinalWealth(startWealth, outcomes, mode, edgeFraction(goodProb)),
    fifty_fifty: strategyFinalWealth(startWealth, outcomes, mode, 0.5),
    all_risky: strategyFinalWealth(startWealth, outcomes, mode, 1),
  };
}
