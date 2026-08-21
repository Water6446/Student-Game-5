// Deterministic pseudo-randomness for TESTS ONLY.
//
// The app never calls this: the SQL owns every real draw, because the server is
// authoritative for anything that touches wealth. What it buys us is the ability
// to assert statistical properties of the manager game (alpha recovers, manager
// residuals are independent, the market-neutral fund really is uncorrelated)
// against a fixed seed instead of a flaky sample.

/** Small LCG — the Numerical Recipes constants. Fine for test fixtures. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/**
 * Box-Muller, matching the SQL `_rand_normal`. Returns one draw per call
 * (the second variate is discarded, exactly as the SQL does).
 */
export function gaussian(rng: () => number, mean = 0, sd = 1): number {
  const u1 = Math.max(rng(), 1e-12); // ln(0) is -Infinity
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
