import { describe, expect, it } from "vitest";
import { sharpeText, signedPct } from "./format";

describe("sharpeText", () => {
  it("renders two decimals", () => {
    expect(sharpeText(1.238)).toBe("1.24");
  });

  it("uses U+2212 minus, like signedMoney/signedPct", () => {
    expect(sharpeText(-0.33)).toBe("−0.33");
    expect(sharpeText(-0.33)).not.toContain("-"); // never a hyphen-minus
  });

  it("renders an em dash when undefined (all-safe, or fewer than 2 rounds)", () => {
    expect(sharpeText(null)).toBe("—");
  });
});

describe("signedPct", () => {
  it("signs positive values", () => {
    expect(signedPct(12)).toBe("+12%");
  });

  it("uses U+2212 minus for negatives, like signedMoney", () => {
    expect(signedPct(-14)).toBe("−14%");
    expect(signedPct(-14)).not.toContain("-"); // never a hyphen-minus
  });

  it("renders zero unsigned", () => {
    expect(signedPct(0)).toBe("0%");
  });

  it("supports fractional digits", () => {
    expect(signedPct(1.26, 1)).toBe("+1.3%");
    expect(signedPct(-0.44, 1)).toBe("−0.4%");
  });

  it("coerces strings and garbage defensively", () => {
    expect(signedPct("7")).toBe("+7%");
    expect(signedPct(NaN)).toBe("0%");
  });
});
