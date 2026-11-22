// Paper trading statistics: Sharpe (annualized), drawdown, turnover. Pure.
// The Sharpe and drawdown stored on market_accounts are computed in SQL by
// _resolve_trading (0034) with the same formulas; this is their mirror.

import type { TradingPeriod } from "../../game/types";

export const PERIODS_PER_YEAR: Record<TradingPeriod, number> = {
  year: 1,
  half: 2,
  quarter: 4,
  month: 12,
  week: 52,
};

/**
 * Per-round excess returns: r_k = NLV_k / NLV_(k-1) − 1, floored at −100%,
 * minus that period's T-bill return. The series stops after the account is
 * wiped out (a return from $0 or below means nothing).
 *   nlvs: [value before round 1, after round 1, …]   rfs: [rf of round 1, …]
 */
export function excessReturns(nlvs: number[], rfs: number[]): number[] {
  const out: number[] = [];
  for (let k = 1; k < nlvs.length; k++) {
    const prev = nlvs[k - 1];
    if (!(prev > 0)) break;
    const r = Math.max(-1, nlvs[k] / prev - 1);
    out.push(r - (rfs[k - 1] ?? 0));
  }
  return out;
}

/**
 * Below this standard deviation of per-round excess returns an account took no
 * real risk (an all-cash account differs from the T-bill only by rounding), and
 * "return per unit of risk" means nothing.
 */
export const SHARPE_MIN_SD = 1e-6;

/**
 * Annualized Sharpe: mean / population stdev of the excess returns, times
 * √(periods per year). Null with fewer than two returns or no real variation.
 * MIRRORS the Sharpe block in _resolve_trading.
 */
export function annualizedSharpe(nlvs: number[], rfs: number[], period: TradingPeriod): number | null {
  const xs = excessReturns(nlvs, rfs);
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  if (!(sd >= SHARPE_MIN_SD)) return null;
  return (mean / sd) * Math.sqrt(PERIODS_PER_YEAR[period]);
}

/** Largest peak-to-trough fall of a value series, as a fraction (capped at 1). */
export function maxDrawdown(values: number[], startPeak = 0): number {
  let peak = startPeak;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, Math.min(1, (peak - v) / peak));
  }
  return worst;
}

/**
 * Annual turnover: half the dollars traded (buys and sells both count once),
 * over the average account value, per year of market time. 1.0 = the whole
 * portfolio replaced once a year. (Barber & Odean measure it monthly as the
 * average of buy and sell turnover; this is the same idea on round totals.)
 */
export function annualTurnover(tradedPerRound: number[], nlvs: number[], period: TradingPeriod): number {
  const rounds = tradedPerRound.length;
  if (!rounds) return 0;
  const vals = nlvs.filter((v) => v > 0);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  if (!(avg > 0)) return 0;
  const traded = tradedPerRound.reduce((a, b) => a + b, 0);
  const years = rounds / PERIODS_PER_YEAR[period];
  return traded / 2 / avg / years;
}
