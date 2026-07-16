import { describe, it, expect } from "vitest";
import {
  assetGoodProb,
  assetName,
  assetPayoffMode,
  allPortfolioStrategyOutcomes,
  equalSplitAmounts,
  portfolioStrategyAmounts,
  portfolioStrategyFinalWealth,
  resolvePortfolio,
  validatePortfolioAmounts,
} from "./portfolio";
import { DEFAULT_CONFIG, type MarketOutcome, type SessionConfig } from "./types";

function cfg(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    ...DEFAULT_CONFIG,
    game_type: "portfolio",
    payoff_mode: "extreme",
    num_assets: 2,
    risk_free_rate: 0,
    ...overrides,
  };
}

describe("resolvePortfolio", () => {
  it("extreme: doubles good assets, zeroes bad ones", () => {
    // 100 wealth, 25 on each of 2 assets, 50 safe. A good, B bad.
    expect(resolvePortfolio(cfg(), 100, [25, 25], ["good", "bad"])).toBe(100); // 50 + 50 + 0
    expect(resolvePortfolio(cfg(), 100, [25, 25], ["good", "good"])).toBe(150);
    expect(resolvePortfolio(cfg(), 100, [25, 25], ["bad", "bad"])).toBe(50);
  });

  it("moderate: ×1.1 / ×0.9 per asset", () => {
    const c = cfg({ payoff_mode: "moderate" });
    // 50 safe + 25·1.1 + 25·0.9 = 100
    expect(resolvePortfolio(c, 100, [25, 25], ["good", "bad"])).toBeCloseTo(100, 9);
  });

  it("risk-free rate pays interest on the safe bucket only", () => {
    const c = cfg({ risk_free_rate: 0.05 });
    // 50·1.05 + 25·2 + 0 = 102.5
    expect(resolvePortfolio(c, 100, [25, 25], ["good", "bad"])).toBeCloseTo(102.5, 9);
  });

  it("per-asset payoff overrides beat the game-level mode", () => {
    const c = cfg({
      payoff_mode: "extreme",
      assets: [{ payoff_mode: "moderate" }, {}],
    });
    // asset 1 moderate good ×1.1, asset 2 extreme bad ×0 → 50 + 27.5 + 0
    expect(resolvePortfolio(c, 100, [25, 25], ["good", "bad"])).toBeCloseTo(77.5, 9);
  });

  it("diversification tames the extreme wipeout", () => {
    // all-in one asset that goes bad = wiped out; split across two, one good = survive
    expect(resolvePortfolio(cfg(), 100, [100, 0], ["bad", "good"])).toBe(0);
    expect(resolvePortfolio(cfg(), 100, [50, 50], ["bad", "good"])).toBe(100);
  });

  it("rejects negative amounts and over-allocation", () => {
    expect(() => validatePortfolioAmounts(100, [-1, 50])).toThrow();
    expect(() => validatePortfolioAmounts(100, [60, 50])).toThrow();
    expect(validatePortfolioAmounts(100, [50, 50])).toBe(100); // exact fit ok
  });
});

describe("portfolio strategies", () => {
  it("bets the documented per-asset amounts", () => {
    expect(portfolioStrategyAmounts("all_safe", 100, 4)).toEqual([0, 0, 0, 0]);
    expect(portfolioStrategyAmounts("concentrated", 100, 4)).toEqual([100, 0, 0, 0]);
    expect(portfolioStrategyAmounts("diversified", 100, 4)).toEqual([25, 25, 25, 25]);
    expect(portfolioStrategyAmounts("half_diversified", 100, 4)).toEqual([
      12.5, 12.5, 12.5, 12.5,
    ]);
  });

  it("all-safe is flat without interest, compounds with it", () => {
    const rounds: MarketOutcome[][] = [
      ["bad", "bad"],
      ["bad", "bad"],
    ];
    expect(portfolioStrategyFinalWealth(cfg(), 100, rounds, "all_safe")).toBe(100);
    expect(
      portfolioStrategyFinalWealth(cfg({ risk_free_rate: 0.05 }), 100, rounds, "all_safe"),
    ).toBeCloseTo(110.25, 9);
  });

  it("concentrated lives and dies with asset A", () => {
    const rounds: MarketOutcome[][] = [
      ["good", "bad"],
      ["bad", "good"],
    ];
    // ×2 then ×0
    expect(portfolioStrategyFinalWealth(cfg(), 100, rounds, "concentrated")).toBe(0);
    // diversified: (½·2 + ½·0) = ×1 each round → survives at 100
    expect(portfolioStrategyFinalWealth(cfg(), 100, rounds, "diversified")).toBe(100);
  });

  it("computes all four finals at once", () => {
    const all = allPortfolioStrategyOutcomes(cfg(), 100, [["good", "good"]]);
    expect(all.all_safe).toBe(100);
    expect(all.concentrated).toBe(200);
    expect(all.diversified).toBe(200);
    expect(all.half_diversified).toBe(150);
  });
});

describe("equalSplitAmounts", () => {
  it("gives the rounding remainder to the LAST asset, never exceeding wealth", () => {
    // the reported bug: $337.50 / 4 = 84.375 → naive rounding hit $337.52
    expect(equalSplitAmounts(337.5, 4)).toEqual([84.38, 84.38, 84.38, 84.36]);
    const total = equalSplitAmounts(337.5, 4).reduce((s, a) => s + a, 0);
    expect(total).toBeCloseTo(337.5, 9);
  });

  it("splits clean divisions exactly", () => {
    expect(equalSplitAmounts(100, 4)).toEqual([25, 25, 25, 25]);
    expect(equalSplitAmounts(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it("never goes negative on micro-wealth", () => {
    for (const [w, n] of [
      [0.02, 4],
      [0.01, 3],
      [0.05, 8],
    ] as const) {
      const parts = equalSplitAmounts(w, n);
      expect(parts.every((a) => a >= 0)).toBe(true);
      expect(parts.reduce((s, a) => s + a, 0)).toBeLessThanOrEqual(w + 1e-9);
    }
  });

  it("returns zeros for zero wealth", () => {
    expect(equalSplitAmounts(0, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("asset config helpers", () => {
  it("names default to letters and honor overrides", () => {
    expect(assetName(cfg(), 0)).toBe("Asset A");
    expect(assetName(cfg(), 3)).toBe("Asset D");
    expect(assetName(cfg({ assets: [{ name: "Tech" }, {}] }), 0)).toBe("Tech");
    expect(assetName(cfg({ assets: [{ name: "  " }, {}] }), 0)).toBe("Asset A");
  });

  it("per-asset odds/payoff fall back to game level", () => {
    const c = cfg({ good_prob: 0.7, assets: [{ good_prob: 0.4 }, {}] });
    expect(assetGoodProb(c, 0)).toBe(0.4);
    expect(assetGoodProb(c, 1)).toBe(0.7);
    expect(assetPayoffMode(c, 0)).toBe("extreme");
  });
});
