import { describe, it, expect } from "vitest";
import {
  resolveAllocation,
  validateRisky,
  riskyMultiplier,
  rollMarket,
  defaultRisky,
  InvalidAllocationError,
} from "./math";

describe("riskyMultiplier", () => {
  it("moderate mode", () => {
    expect(riskyMultiplier("moderate", "good")).toBe(1.1);
    expect(riskyMultiplier("moderate", "bad")).toBe(0.9);
  });
  it("extreme mode", () => {
    expect(riskyMultiplier("extreme", "good")).toBe(2);
    expect(riskyMultiplier("extreme", "bad")).toBe(0);
  });
});

describe("resolveAllocation — worked examples from the spec", () => {
  it("Mode 1 (moderate), $100, 50% risky, Good -> 105", () => {
    const r = resolveAllocation(100, 50, "good", "moderate");
    expect(r.safe).toBe(50);
    expect(r.resultingWealth).toBeCloseTo(105, 10);
  });
  it("Mode 1 (moderate), $100, 50% risky, Bad -> 95", () => {
    const r = resolveAllocation(100, 50, "bad", "moderate");
    expect(r.resultingWealth).toBeCloseTo(95, 10);
  });
  it("Mode 2 (extreme), $100, 50% risky, Good -> 150", () => {
    const r = resolveAllocation(100, 50, "good", "extreme");
    expect(r.resultingWealth).toBeCloseTo(150, 10);
  });
  it("Mode 2 (extreme), $100, 50% risky, Bad -> 50", () => {
    const r = resolveAllocation(100, 50, "bad", "extreme");
    expect(r.resultingWealth).toBeCloseTo(50, 10);
  });
});

describe("resolveAllocation — boundaries", () => {
  it("all safe (risky=0) never changes wealth", () => {
    expect(resolveAllocation(100, 0, "good", "extreme").resultingWealth).toBe(100);
    expect(resolveAllocation(100, 0, "bad", "extreme").resultingWealth).toBe(100);
  });
  it("all risky (risky=wealth) in extreme/bad wipes out", () => {
    expect(resolveAllocation(100, 100, "bad", "extreme").resultingWealth).toBe(0);
  });
  it("all risky (risky=wealth) in extreme/good doubles", () => {
    expect(resolveAllocation(100, 100, "good", "extreme").resultingWealth).toBe(200);
  });
  it("risky === wealth is accepted (boundary inclusive)", () => {
    expect(() => resolveAllocation(100, 100, "good", "moderate")).not.toThrow();
  });
});

describe("validateRisky — server-side input validation", () => {
  it("rejects negative", () => {
    expect(() => validateRisky(100, -1)).toThrow(InvalidAllocationError);
  });
  it("rejects NaN", () => {
    expect(() => validateRisky(100, NaN)).toThrow(InvalidAllocationError);
  });
  it("rejects Infinity", () => {
    expect(() => validateRisky(100, Infinity)).toThrow(InvalidAllocationError);
  });
  it("rejects risky > current wealth", () => {
    expect(() => validateRisky(100, 100.01)).toThrow(InvalidAllocationError);
  });
  it("rejects invalid current wealth", () => {
    expect(() => validateRisky(-5, 0)).toThrow(InvalidAllocationError);
  });
  it("accepts a valid mid-range value", () => {
    expect(validateRisky(100, 42)).toBe(42);
  });
});

describe("defaultRisky", () => {
  it("non-submitters default to all safe", () => {
    expect(defaultRisky()).toBe(0);
  });
});

describe("rollMarket", () => {
  it("returns good when rng below goodProb", () => {
    expect(rollMarket(0.6, () => 0.1)).toBe("good");
  });
  it("returns bad when rng at/above goodProb", () => {
    expect(rollMarket(0.6, () => 0.9)).toBe("bad");
  });
  it("good_prob=1 always good, good_prob=0 always bad", () => {
    expect(rollMarket(1, () => 0.999)).toBe("good");
    expect(rollMarket(0, () => 0.0)).toBe("bad");
  });
  it("rejects out-of-range probabilities", () => {
    expect(() => rollMarket(1.5)).toThrow(InvalidAllocationError);
    expect(() => rollMarket(-0.1)).toThrow(InvalidAllocationError);
  });
  it("roughly matches the weighting over many draws", () => {
    let good = 0;
    const n = 20000;
    let seed = 12345;
    const lcg = () => {
      // simple deterministic LCG for a stable distribution test
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < n; i++) if (rollMarket(0.6, lcg) === "good") good++;
    expect(good / n).toBeGreaterThan(0.57);
    expect(good / n).toBeLessThan(0.63);
  });
});
