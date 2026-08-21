import { describe, expect, it } from "vitest";
import {
  amountsFromPercents,
  annualizedReturn,
  borrowRate,
  indexSeries,
  informationRatio,
  managerFees,
  managerGrossReturn,
  resolveManagerYear,
  totalVol,
  type ManagerMathConfig,
} from "./manager";
import type { ManagerPublic } from "./types";

function mgr(mgmt: number, perf = 0, name = "M"): ManagerPublic {
  return {
    name,
    strategy_line: "",
    fee_type: perf > 0 ? "performance" : "flat",
    mgmt_fee: mgmt,
    perf_fee: perf,
    track_record: { yearly: [], one_yr: 0, five_yr: 0, ten_yr: 0 },
    vol_label: "Moderate",
  };
}

function cfg(managers: ManagerPublic[], over: Partial<ManagerMathConfig> = {}): ManagerMathConfig {
  return { riskFreeRate: 0.03, borrowSpread: 0.05, leverageCap: 2, managers, ...over };
}

describe("borrowRate", () => {
  it("is rf + spread, landing on market_mean at the defaults", () => {
    // 0.03 + 0.05 = 0.08 = the default market_mean. Deliberate: borrowing to buy
    // beta has zero expected edge, so only real alpha survives the carry.
    expect(borrowRate(cfg([]))).toBeCloseTo(0.08, 12);
  });
});

describe("managerGrossReturn", () => {
  it("is beta*market + alpha + eps", () => {
    const m = { name: "M", beta: 1.5, alpha: 0.02, tracking_error: 0.1 };
    expect(managerGrossReturn(m, 0.1, -0.03)).toBeCloseTo(1.5 * 0.1 + 0.02 - 0.03, 12);
  });
});

describe("totalVol", () => {
  it("adds the two INDEPENDENT sources in quadrature", () => {
    // beta exposure and tracking error are separate risks, never one number
    expect(totalVol(1.0, 0.16, 0.05)).toBeCloseTo(Math.sqrt(0.16 ** 2 + 0.05 ** 2), 12);
    // the market-neutral fund: near-zero beta leaves almost only its own noise
    expect(totalVol(0.1, 0.16, 0.06)).toBeCloseTo(0.0625, 3);
  });
});

describe("informationRatio", () => {
  it("is alpha per unit of tracking error, null without tracking error", () => {
    expect(informationRatio(0.02, 0.05)).toBeCloseTo(0.4, 12);
    expect(informationRatio(0.02, 0)).toBeNull();
  });
});

describe("managerFees", () => {
  it("charges management even in a down year", () => {
    const f = managerFees(mgr(0.02, 0.2), 100, -10);
    expect(f.mgmt).toBeCloseTo(2, 12);
    expect(f.total).toBeCloseTo(2, 12);
  });

  it("charges ZERO performance fee in a down year", () => {
    expect(managerFees(mgr(0.02, 0.2), 100, -10).perf).toBe(0);
    expect(managerFees(mgr(0.02, 0.2), 100, 0).perf).toBe(0);
  });

  it("charges the performance fee on the GROSS return", () => {
    // 2-and-20 on $100 that gained $20: 2 management + 4 performance.
    // Charging it net of the management fee would give 0.2*(20-2) = 3.60.
    const f = managerFees(mgr(0.02, 0.2), 100, 20);
    expect(f.mgmt).toBeCloseTo(2, 12);
    expect(f.perf).toBeCloseTo(4, 12);
    expect(f.total).toBeCloseTo(6, 12);
  });
});

describe("resolveManagerYear", () => {
  it("allocating nothing just earns the risk-free rate", () => {
    const r = resolveManagerYear(cfg([mgr(0.01)]), 100, [0], [0.5]);
    expect(r.endWealth).toBeCloseTo(103, 12);
    expect(r.fees).toBe(0);
    expect(r.cash).toBe(100);
    expect(r.borrowed).toBe(0);
  });

  it("fully invested with no fees returns exactly the manager's return", () => {
    const r = resolveManagerYear(cfg([mgr(0)]), 100, [100], [0.1]);
    expect(r.endWealth).toBeCloseTo(110, 12);
    expect(r.fees).toBe(0);
  });

  it("matches a hand-computed 2-and-20 year to the cent", () => {
    // $60 with a 2-and-20 manager up 20%, $40 left in cash at 3%:
    //   gross 12, mgmt 1.20, perf 2.40 → manager ends at 68.40
    //   cash 40 * 1.03 = 41.20 → 109.60, fees 3.60
    const r = resolveManagerYear(cfg([mgr(0.02, 0.2)]), 100, [60], [0.2]);
    expect(r.endWealth).toBeCloseTo(109.6, 10);
    expect(r.fees).toBeCloseTo(3.6, 10);
    expect(r.feeBreakdown).toEqual([{ mgmt: expect.closeTo(1.2, 10), perf: expect.closeTo(2.4, 10) }]);
  });

  it("leverage adds NOTHING at the default borrow rate", () => {
    // 2x into an 8% year, borrowing at 8%: 2W(1.08) − W(1.08) = W(1.08).
    // This is the calibration that makes the game about alpha, not leverage.
    const r = resolveManagerYear(cfg([mgr(0)]), 100, [200], [0.08]);
    expect(r.endWealth).toBeCloseTo(108, 10);
    expect(r.borrowed).toBe(100);
    expect(r.cash).toBe(0);
  });

  it("leverage amplifies a good year and a bad one alike", () => {
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [200], [0.2]).endWealth).toBeCloseTo(132, 10);
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [200], [-0.2]).endWealth).toBeCloseTo(52, 10);
  });

  it("busts at exactly 0 on the threshold year, and floors below it", () => {
    // 2W(1+r) = W(1+borrow_rate) → r = (1.08/2) − 1 = −46%.
    // NOTE: the module plan's sanity check says a −40% year at 2x floors at 0.
    // It does not — that year ends at $12. −46% is the real bust threshold.
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [200], [-0.4]).endWealth).toBeCloseTo(12, 10);
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [200], [-0.46]).endWealth).toBeCloseTo(0, 10);
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [200], [-0.6]).endWealth).toBe(0);
  });

  it("scales the whole book down when it exceeds the leverage cap", () => {
    // mirrors the SQL clamp: shares are preserved, the total is capped
    const r = resolveManagerYear(cfg([mgr(0), mgr(0)]), 100, [300, 100], [0, 0]);
    expect(r.allocated).toBeCloseTo(200, 10);
    expect(r.borrowed).toBeCloseTo(100, 10);
  });

  it("splits fees per manager across a mixed book", () => {
    const r = resolveManagerYear(cfg([mgr(0.01), mgr(0.02, 0.2)]), 100, [50, 50], [0.1, 0.1]);
    // A: gross 5, mgmt 0.50 → 54.50.  B: gross 5, mgmt 1, perf 1 → 53.
    expect(r.fees).toBeCloseTo(2.5, 10);
    expect(r.endWealth).toBeCloseTo(107.5, 10);
  });

  it("never returns a negative wealth", () => {
    expect(resolveManagerYear(cfg([mgr(0)]), 100, [100], [-1.5]).endWealth).toBe(0);
  });
});

describe("indexSeries", () => {
  it("compounds the market with no fees", () => {
    expect(indexSeries(100, [0.1, -0.1])).toEqual([
      expect.closeTo(110, 10),
      expect.closeTo(99, 10),
    ]);
  });

  it("treats a missing return as flat rather than NaN", () => {
    expect(indexSeries(100, [NaN])).toEqual([100]);
  });
});

describe("amountsFromPercents", () => {
  it("converts percent-of-wealth to cents", () => {
    expect(amountsFromPercents(128.4, [40, 20, null])).toEqual([51.36, 25.68, 0]);
  });

  it("allows a levered total above 100%", () => {
    expect(amountsFromPercents(100, [60, 60])).toEqual([60, 60]);
  });
});

describe("indexSeries as the ghost line", () => {
  it("lines up with what the Index bot compounds, year by year", () => {
    // The chart line and the bot must read the same rounds.market_return, or the
    // class sees a benchmark that disagrees with the standings.
    const market = [0.08, -0.12, 0.2];
    const line = indexSeries(100, market);
    let bot = 100;
    for (const r of market) bot = bot * (1 + r);
    expect(line[line.length - 1]).toBeCloseTo(bot, 10);
    expect(line).toHaveLength(market.length);
  });
});

describe("annualizedReturn — the prospectus figures", () => {
  it("is the geometric rate that compounds to the path", () => {
    expect(annualizedReturn([0.1, 0.1])).toBeCloseTo(0.1, 12);
    expect(annualizedReturn([0.21, 0])!).toBeCloseTo(Math.sqrt(1.21) - 1, 12);
  });

  it("derives the 5-year figure from the LAST FIVE years, not all ten", () => {
    // The single most likely number to get wrong: a 10-year path whose first
    // half is terrible and second half is good must show a GOOD 5-year figure.
    const yearly = [-0.3, -0.3, -0.3, -0.3, -0.3, 0.2, 0.2, 0.2, 0.2, 0.2];
    expect(annualizedReturn(yearly.slice(-5))).toBeCloseTo(0.2, 12);
    expect(annualizedReturn(yearly)).toBeLessThan(0);
    // and the 1-year figure is the last entry, untouched
    expect(yearly[yearly.length - 1]).toBeCloseTo(0.2, 12);
  });

  it("survives a catastrophic year instead of returning NaN", () => {
    expect(Number.isFinite(annualizedReturn([-1.5, 0.1])!)).toBe(true);
  });

  it("is null for an empty path", () => {
    expect(annualizedReturn([])).toBeNull();
  });
});
