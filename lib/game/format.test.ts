import { describe, expect, it } from "vitest";
import { cost, money, sharpeText, signedMoney, signedPct } from "./format";

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

describe("money", () => {
  it("prints both cents or neither — never a lone tenth", () => {
    // "$33.6" and "$204.2" read as truncated and made a host distrust the sums
    expect(money(33.6)).toBe("$33.60");
    expect(money(204.2)).toBe("$204.20");
    expect(money(106.3)).toBe("$106.30");
  });

  it("leaves whole dollars clean", () => {
    expect(money(100)).toBe("$100");
    expect(money(0)).toBe("$0");
  });

  it("still rounds to cents and coerces defensively", () => {
    expect(money(1.005)).toBe("$1.01");
    expect(money("12.5")).toBe("$12.50");
    expect(money(NaN)).toBe("$0");
  });

  it("keeps signedMoney's sign handling intact", () => {
    expect(signedMoney(2.4)).toBe("+$2.40");
    expect(signedMoney(-2.4)).toBe("−$2.40");
    expect(signedMoney(0)).toBe("$0");
  });
});

describe("cost", () => {
  it("writes a charge as a charge, never as a negative", () => {
    // "Fees this year −$2.56" read as a rebate; colour carries the direction
    expect(cost(2.56)).toBe("$2.56");
    expect(cost(-2.56)).toBe("$2.56");
    expect(cost(0)).toBe("$0");
  });
});
