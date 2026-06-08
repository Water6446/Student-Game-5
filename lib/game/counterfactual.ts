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
 * The risky fraction each fixed strategy bets per round — the single source of
 * truth shared by the counterfactual math, the bot-allocation preview, and the
 * benchmark cards. (Mirrored, of necessity, by the SQL in resolve_round.)
 */
export const STRATEGY_FRACTIONS: Record<StrategyKey, (goodProb: number) => number> = {
  all_safe: () => 0,
  edge: (g) => edgeFraction(g),
  fifty_fifty: () => 0.5,
  all_risky: () => 1,
};

export const STRATEGY_KEYS = Object.keys(STRATEGY_FRACTIONS) as StrategyKey[];

/** The risky fraction a bot of the given strategy bets (0 for unknown). */
export function strategyFraction(strategy: string | null | undefined, goodProb: number): number {
  const f = STRATEGY_FRACTIONS[strategy as StrategyKey];
  return f ? f(goodProb) : 0;
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
  return Object.fromEntries(
    STRATEGY_KEYS.map((k) => [
      k,
      strategyFinalWealth(startWealth, outcomes, mode, STRATEGY_FRACTIONS[k](goodProb)),
    ]),
  ) as Record<StrategyKey, number>;
}
