// Pure, deterministic game math. This is the SINGLE SOURCE OF TRUTH for how a
// round resolves and is mirrored 1:1 by the SQL resolve_round function in
// supabase/migrations. The client NEVER uses this to write wealth to the DB;
// it is used only for previews/tests. The server (SQL) is authoritative.

import type { MarketOutcome, PayoffMode } from "./types";

/**
 * Risky-asset multiplier for a given payoff mode and market outcome.
 *  - moderate: good x1.1, bad x0.9
 *  - extreme:  good x2,   bad x0
 */
export function riskyMultiplier(mode: PayoffMode, outcome: MarketOutcome): number {
  if (mode === "moderate") return outcome === "good" ? 1.1 : 0.9;
  // extreme
  return outcome === "good" ? 2 : 0;
}

export interface AllocationResult {
  /** amount kept in the safe asset (current_wealth - risky) */
  safe: number;
  /** amount placed in the risky asset (validated, clamped to [0, wealth]) */
  risky: number;
  /** wealth after the round resolves */
  resultingWealth: number;
}

export class InvalidAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAllocationError";
  }
}

/**
 * Validate a risky allocation against the player's current wealth.
 * Throws InvalidAllocationError on NaN/Infinity/negative/over-wealth.
 * Returns the (unchanged) risky amount when valid.
 *
 * This intentionally does NOT silently clamp — the server rejects bad input
 * rather than guessing intent. Use defaultRisky() for non-submitters.
 */
export function validateRisky(currentWealth: number, risky: number): number {
  if (!Number.isFinite(currentWealth) || currentWealth < 0) {
    throw new InvalidAllocationError(`invalid current wealth: ${currentWealth}`);
  }
  if (!Number.isFinite(risky)) {
    throw new InvalidAllocationError(`risky must be a finite number, got ${risky}`);
  }
  if (risky < 0) {
    throw new InvalidAllocationError(`risky must be >= 0, got ${risky}`);
  }
  // Allow a tiny epsilon for floating point so risky === wealth is accepted.
  if (risky > currentWealth + 1e-9) {
    throw new InvalidAllocationError(
      `risky (${risky}) must be <= current wealth (${currentWealth})`,
    );
  }
  return Math.min(risky, currentWealth);
}

/**
 * Resolve a single player's allocation for one round.
 * safe = currentWealth - risky; resultingWealth = safe + risky * multiplier.
 */
export function resolveAllocation(
  currentWealth: number,
  risky: number,
  outcome: MarketOutcome,
  mode: PayoffMode,
): AllocationResult {
  const validRisky = validateRisky(currentWealth, risky);
  const safe = currentWealth - validRisky;
  const mult = riskyMultiplier(mode, outcome);
  const resultingWealth = safe + validRisky * mult;
  return { safe, risky: validRisky, resultingWealth };
}

/** Non-submitters default to all-safe (risky = 0). */
export function defaultRisky(): number {
  return 0;
}

/**
 * Roll a weighted-random market outcome. Used only by the host/server in
 * 'auto' market mode. `rng` defaults to Math.random and is injectable for
 * deterministic tests. goodProb is the probability of a 'good' market.
 */
export function rollMarket(goodProb: number, rng: () => number = Math.random): MarketOutcome {
  if (!Number.isFinite(goodProb) || goodProb < 0 || goodProb > 1) {
    throw new InvalidAllocationError(`good_prob must be in [0,1], got ${goodProb}`);
  }
  return rng() < goodProb ? "good" : "bad";
}
