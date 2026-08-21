// Manager game maths. A MIRROR of the SQL in supabase/migrations/0015 —
// used for previews, the fee counter, the per-year reveal and tests, and NEVER
// to write wealth. The server is authoritative. If you change one, change the
// other and say so in MECHANICS.md.

import type { ManagerPublic, ManagerTruth, SessionConfig } from "./types";
import { roundCents } from "./math";

/** Everything the year-resolution maths needs from a session config. */
export interface ManagerMathConfig {
  riskFreeRate: number;
  borrowSpread: number;
  leverageCap: number;
  managers: ManagerPublic[];
}

export function managerMathConfig(config: SessionConfig): ManagerMathConfig {
  return {
    riskFreeRate: config.risk_free_rate ?? 0.03,
    borrowSpread: config.borrow_spread ?? 0.05,
    leverageCap: config.leverage_cap ?? 2,
    managers: config.managers ?? [],
  };
}

export function numManagers(config: SessionConfig): number {
  return config.num_managers ?? config.managers?.length ?? 5;
}

export function managerName(config: SessionConfig, i: number): string {
  return config.managers?.[i]?.name ?? `Manager ${i + 1}`;
}

/**
 * Borrowing costs the risk-free rate plus a spread. The default lands it at
 * exactly `market_mean` (0.03 + 0.05 = 0.08), which is deliberate: borrowing to
 * buy beta has zero expected edge, so only real alpha survives the carry.
 */
export function borrowRate(cfg: ManagerMathConfig): number {
  return cfg.riskFreeRate + cfg.borrowSpread;
}

/** r_i = beta_i * r_market + alpha_i + eps_i */
export function managerGrossReturn(m: ManagerTruth, rMarket: number, eps: number): number {
  return m.beta * rMarket + m.alpha + eps;
}

/**
 * Total volatility from the two INDEPENDENT sources — market exposure (beta)
 * and idiosyncratic noise (tracking error). Informational only; never collapse
 * the two into a single "vol" anywhere the maths runs.
 */
export function totalVol(beta: number, marketSd: number, te: number): number {
  return Math.sqrt((beta * marketSd) ** 2 + te ** 2);
}

/** Information ratio — alpha per unit of tracking error. Host setup form only. */
export function informationRatio(alpha: number, te: number): number | null {
  return te > 0 ? alpha / te : null;
}

/**
 * Fees for one manager for one year, in dollars.
 *
 * Management is charged on the ALLOCATED assets and always applies, including
 * in a losing year. Performance is charged on the positive GROSS return only.
 *
 * The performance fee is taken on the gross return, per the module spec.
 * Industry practice more often charges it on the return net of the management
 * fee — swapping `grossDollars` for `grossDollars - mgmt` below is the whole
 * change if the professor asks. There is no high-water mark in v1: a fund that
 * loses 20% then gains 20% charges a performance fee on the recovery.
 */
export function managerFees(
  m: Pick<ManagerPublic, "mgmt_fee" | "perf_fee">,
  allocated: number,
  grossDollars: number,
): { mgmt: number; perf: number; total: number } {
  const mgmt = allocated * m.mgmt_fee;
  const perf = m.perf_fee * Math.max(0, grossDollars);
  return { mgmt, perf, total: mgmt + perf };
}

export interface ManagerYearResult {
  endWealth: number;
  fees: number;
  feeBreakdown: { mgmt: number; perf: number }[];
  /** dollars borrowed: max(0, allocated − wealth) */
  borrowed: number;
  /** dollars left in the risk-free asset: max(0, wealth − allocated) */
  cash: number;
  /** total allocated across managers */
  allocated: number;
}

/**
 * One year for one player.
 *
 *   W' = Σ end_i + C(1 + rf) − B(1 + borrow_rate),  floored at 0
 *
 * where C is uninvested cash and B is borrowed. Amounts above `wealth` are
 * leverage; the whole book scales down if it exceeds the cap, mirroring the SQL.
 */
export function resolveManagerYear(
  cfg: ManagerMathConfig,
  wealth: number,
  amounts: number[],
  managerReturns: number[],
): ManagerYearResult {
  const n = cfg.managers.length;
  let book = Array.from({ length: n }, (_, i) => Math.max(amounts[i] ?? 0, 0));
  let allocated = book.reduce((s, a) => s + a, 0);

  const cap = cfg.leverageCap * wealth;
  if (allocated > cap && allocated > 0) {
    book = book.map((a) => (a * cap) / allocated);
    allocated = cap;
  }

  const cash = Math.max(wealth - allocated, 0);
  const borrowed = Math.max(allocated - wealth, 0);

  let end = 0;
  let fees = 0;
  const feeBreakdown: { mgmt: number; perf: number }[] = [];
  for (let i = 0; i < n; i++) {
    const gross = book[i] * (managerReturns[i] ?? 0);
    const f = managerFees(cfg.managers[i], book[i], gross);
    end += book[i] + gross - f.total;
    fees += f.total;
    feeBreakdown.push({ mgmt: f.mgmt, perf: f.perf });
  }

  const endWealth = Math.max(
    end + cash * (1 + cfg.riskFreeRate) - borrowed * (1 + borrowRate(cfg)),
    0,
  );

  return { endWealth, fees, feeBreakdown, borrowed, cash, allocated };
}

/**
 * What the index bot is worth after each year — the ghost line on the wealth
 * chart. Sourced from `rounds.market_return`, the same number the bot compounds,
 * so the line and the bot can never disagree.
 */
export function indexSeries(startWealth: number, marketReturns: number[]): number[] {
  const out: number[] = [];
  let w = startWealth;
  for (const r of marketReturns) {
    w = w * (1 + (Number.isFinite(r) ? r : 0));
    out.push(w);
  }
  return out;
}

/** Dollar amounts from percent-of-wealth inputs, rounded to cents. */
export function amountsFromPercents(wealth: number, percents: (number | null)[]): number[] {
  return percents.map((p) => roundCents(((p ?? 0) / 100) * wealth));
}
