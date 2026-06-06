// Pure counterfactual math: "what if you'd followed one fixed strategy the whole
// game, under the market outcomes that actually happened?" Deterministic and
// testable; no DB types here (see results.ts for the row-shaped derivation).

import { riskyMultiplier } from "./math";
import type { MarketOutcome, PayoffMode } from "./types";

export type StrategyKey = "all_safe" | "fifty_fifty" | "all_risky";

export interface Strategy {
  key: StrategyKey;
  label: string;
  /** risky fraction applied every round (0 = all safe, 1 = all risky) */
  fraction: number;
}

export const STRATEGIES: readonly Strategy[] = [
  { key: "all_safe", label: "All safe", fraction: 0 },
  { key: "fifty_fifty", label: "50 / 50", fraction: 0.5 },
  { key: "all_risky", label: "All risky", fraction: 1 },
] as const;

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

/** All three reference strategies' final wealth for the same outcome sequence. */
export function allStrategyOutcomes(
  startWealth: number,
  outcomes: MarketOutcome[],
  mode: PayoffMode,
): Record<StrategyKey, number> {
  return {
    all_safe: strategyFinalWealth(startWealth, outcomes, mode, 0),
    fifty_fifty: strategyFinalWealth(startWealth, outcomes, mode, 0.5),
    all_risky: strategyFinalWealth(startWealth, outcomes, mode, 1),
  };
}
