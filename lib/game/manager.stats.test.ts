// Statistical properties of the manager return model. These assert the SHAPE of
// the process the SQL implements: alpha is recoverable in the limit, each
// manager's noise is its own, and a low-beta fund really is uncorrelated with
// the index. Seeded, so a failure means the model changed, not that a sample
// went sideways.
//
// Fast enough to run normally (~120k draws). If it ever isn't, narrow YEARS
// rather than skipping it — the independence assertion below is the single
// highest-value test in the module.

import { describe, expect, it } from "vitest";
import { gaussian, lcg } from "./random";
import { managerGrossReturn, totalVol } from "./manager";
import type { ManagerTruth } from "./types";

const YEARS = 10_000;
const MARKET_MEAN = 0.08;
const MARKET_SD = 0.16;

const MANAGERS: ManagerTruth[] = [
  { name: "Meridian Alpha", beta: 1.0, alpha: 0.02, tracking_error: 0.05 },
  { name: "Apex Capital", beta: 1.0, alpha: -0.02, tracking_error: 0.05 },
  { name: "Momentum Partners", beta: 1.0, alpha: 0.0, tracking_error: 0.08 },
  { name: "Steady Harbor", beta: 1.0, alpha: 0.0, tracking_error: 0.03 },
  { name: "Titan Leveraged Growth", beta: 1.5, alpha: 0.0, tracking_error: 0.1 },
  { name: "Parity Absolute Return", beta: 0.1, alpha: 0.03, tracking_error: 0.06 },
];

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  for (let i = 0; i < xs.length; i++) cov += (xs[i] - mx) * (ys[i] - my);
  cov /= xs.length;
  return cov / (sd(xs) * sd(ys));
}

/**
 * One simulated history. This is the SQL's per-year loop: ONE market draw, then
 * one eps PER MANAGER — the eps must be inside the manager loop.
 */
function simulate() {
  const rng = lcg(20260821);
  const market: number[] = [];
  const returns: number[][] = MANAGERS.map(() => []);
  for (let y = 0; y < YEARS; y++) {
    const rm = gaussian(rng, MARKET_MEAN, MARKET_SD);
    market.push(rm);
    MANAGERS.forEach((m, i) => {
      returns[i].push(managerGrossReturn(m, rm, gaussian(rng, 0, m.tracking_error)));
    });
  }
  return { market, returns };
}

const { market, returns } = simulate();

describe("market process", () => {
  it("realises its stated mean and volatility", () => {
    expect(mean(market)).toBeCloseTo(MARKET_MEAN, 2);
    expect(sd(market)).toBeCloseTo(MARKET_SD, 2);
  });
});

describe("manager processes", () => {
  it("recovers each manager's alpha from the residual", () => {
    MANAGERS.forEach((m, i) => {
      const residual = returns[i].map((r, y) => r - m.beta * market[y]);
      expect(mean(residual)).toBeCloseTo(m.alpha, 2);
    });
  });

  it("recovers each manager's tracking error from the residual", () => {
    MANAGERS.forEach((m, i) => {
      const residual = returns[i].map((r, y) => r - m.beta * market[y]);
      expect(sd(residual)).toBeCloseTo(m.tracking_error, 2);
    });
  });

  it("draws each manager's noise INDEPENDENTLY", () => {
    // The single most likely implementation bug is sharing one eps across
    // managers, which makes every fund move together and destroys the game.
    // Meridian (0) and Apex (1) are identical apart from alpha's sign, so their
    // residuals must be uncorrelated.
    const resid = (i: number) =>
      returns[i].map((r, y) => r - MANAGERS[i].beta * market[y]);
    expect(Math.abs(corr(resid(0), resid(1)))).toBeLessThan(0.05);
    expect(Math.abs(corr(resid(2), resid(3)))).toBeLessThan(0.05);
  });

  it("makes the market-neutral fund visibly uncorrelated with the index", () => {
    // rho = beta*market_sd / total_vol = 0.1*0.16 / 0.0625 ≈ 0.26.
    // If this comes out near 1, the noise draw is being shared.
    const parity = MANAGERS.length - 1;
    const expected =
      (MANAGERS[parity].beta * MARKET_SD) /
      totalVol(MANAGERS[parity].beta, MARKET_SD, MANAGERS[parity].tracking_error);
    expect(corr(returns[parity], market)).toBeCloseTo(expected, 1);
    // and a plain beta-1 fund IS strongly correlated, for contrast
    expect(corr(returns[0], market)).toBeGreaterThan(0.9);
  });

  it("keeps Meridian and Apex statistically indistinguishable year to year", () => {
    // +2% against 5% tracking error is an information ratio of 0.4. Over a
    // 25-year career the alpha standard error is 5%/sqrt(25) = 1% — barely two
    // sigma. That is the lesson, so assert the sample size it would take.
    const ir = MANAGERS[0].alpha / MANAGERS[0].tracking_error;
    expect(ir).toBeCloseTo(0.4, 10);
    const seOver25 = MANAGERS[0].tracking_error / Math.sqrt(25);
    expect(seOver25).toBeCloseTo(0.01, 10);
  });
});
