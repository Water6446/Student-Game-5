import { describe, expect, it } from "vitest";
import { decisionContext, quickBuyAmounts } from "./context";

const base = {
  from: "stock",
  ticketMs: 4200,
  reviewMs: null,
  chips: ["25%", "50%", "Max", "25%", "50%", "Max"],
  mode: "dollars" as const,
  round: 3,
  secondsLeft: 41,
  nlv: 100123.456,
  cash: 5000.004,
  buyingPower: 12000.999,
  frozen: false,
  position: 0,
  unrealized: 0,
  holdings: 2,
  last: 51.25,
  change: 0.031,
  changeBasis: "period",
  rank: 4,
  classSize: 20,
};

describe("the decision context", () => {
  it("says what the student could see, in cents, with the last five chips", () => {
    const c = decisionContext(base);
    expect(c).toMatchObject({ from: "stock", nlv: 100123.46, cash: 5000, buying_power: 12001, round: 3, rank: 4 });
    expect(c.chips).toEqual(["50%", "Max", "25%", "50%", "Max"]);
    expect(c).not.toHaveProperty("confirm_ms");
    expect(c).not.toHaveProperty("risk");
    expect(c).not.toHaveProperty("profile");
  });

  it("adds the friction steps the order went through", () => {
    const c = decisionContext({ ...base, confirmMs: 2500, risk: "margin", riskMs: 3100 });
    expect(c).toMatchObject({ confirm_ms: 2500, risk: "margin", risk_ms: 3100 });
  });

  it("stays well inside the server's 2 KB", () => {
    expect(JSON.stringify(decisionContext({ ...base, confirmMs: 1, risk: "short", riskMs: 1 })).length).toBeLessThan(600);
  });
});

describe("one-tap Buy amounts", () => {
  it("are 1%, 5% and 10% of the starting cash in whole dollars", () => {
    expect(quickBuyAmounts(100_000)).toEqual([1000, 5000, 10000]);
    expect(quickBuyAmounts(25_000)).toEqual([250, 1250, 2500]);
    expect(quickBuyAmounts(1_000)).toEqual([10, 50, 100]);
  });
});
