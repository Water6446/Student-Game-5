import { describe, it, expect } from "vitest";
import { strategyFinalWealth, allStrategyOutcomes } from "./counterfactual";
import { csvEscape, toCsv } from "./csv";
import type { MarketOutcome } from "./types";

describe("strategyFinalWealth", () => {
  it("all-safe never changes wealth", () => {
    const outcomes: MarketOutcome[] = ["good", "bad", "good", "bad"];
    expect(strategyFinalWealth(100, outcomes, "moderate", 0)).toBe(100);
    expect(strategyFinalWealth(100, outcomes, "extreme", 0)).toBe(100);
  });

  it("moderate all-risky compounds 1.1 / 0.9", () => {
    expect(strategyFinalWealth(100, ["good", "good"], "moderate", 1)).toBeCloseTo(121, 6);
    expect(strategyFinalWealth(100, ["good", "bad"], "moderate", 1)).toBeCloseTo(99, 6); // 1.1*0.9
  });

  it("moderate 50/50 uses the blended multiplier", () => {
    // each good round: 0.5 + 0.5*1.1 = 1.05
    expect(strategyFinalWealth(100, ["good", "good"], "moderate", 0.5)).toBeCloseTo(110.25, 6);
  });

  it("extreme all-risky doubles on good, zeroes on bad", () => {
    expect(strategyFinalWealth(100, ["good", "good"], "extreme", 1)).toBeCloseTo(400, 6);
    expect(strategyFinalWealth(100, ["good", "bad"], "extreme", 1)).toBe(0);
  });

  it("extreme 50/50 worked example", () => {
    // good: 0.5 + 0.5*2 = 1.5 ; bad: 0.5 + 0.5*0 = 0.5
    expect(strategyFinalWealth(100, ["good", "bad"], "extreme", 0.5)).toBeCloseTo(75, 6);
  });

  it("empty outcome sequence returns the starting wealth", () => {
    expect(strategyFinalWealth(100, [], "moderate", 1)).toBe(100);
  });
});

describe("allStrategyOutcomes", () => {
  it("bundles the three reference strategies", () => {
    const cf = allStrategyOutcomes(100, ["good", "good"], "moderate");
    expect(cf.all_safe).toBe(100);
    expect(cf.fifty_fifty).toBeCloseTo(110.25, 6);
    expect(cf.all_risky).toBeCloseTo(121, 6);
  });
});

describe("csv", () => {
  it("escapes commas, quotes and newlines per RFC 4180", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(42)).toBe("42");
  });

  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], [1, 2]])).toBe("a,b\r\n1,2");
  });
});
