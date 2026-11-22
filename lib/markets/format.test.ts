import { describe, expect, it } from "vitest";
import {
  centsText,
  compactMoney,
  orderSummary,
  percentText,
  priceText,
  returnText,
  sharesText,
  signedCents,
} from "./format";

describe("trading display formats", () => {
  it("shows shares to at most four places, shorts with a true minus", () => {
    expect(sharesText(12)).toBe("12");
    expect(sharesText(19.980021)).toBe("19.98");
    expect(sharesText(3.14159265)).toBe("3.1416");
    expect(sharesText(-50)).toBe("−50");
    expect(sharesText(1234.5)).toBe("1,234.5");
  });

  it("prices to the cent, four places under a dollar, a dash when missing", () => {
    expect(priceText(52.3)).toBe("$52.30");
    expect(priceText(0.4567)).toBe("$0.4567");
    expect(priceText(null)).toBe("—");
  });

  it("money to the cent, signed when asked", () => {
    expect(centsText(100290.952466)).toBe("$100,290.95");
    expect(centsText(-999)).toBe("−$999.00");
    expect(signedCents(12.5)).toBe("+$12.50");
    expect(signedCents(-3)).toBe("−$3.00");
    expect(signedCents(0.004)).toBe("$0.00");
  });

  it("returns as signed percentages, with no sign on a rounded zero", () => {
    expect(returnText(0.0523)).toBe("+5.23%");
    expect(returnText(-0.1749)).toBe("−17.49%");
    expect(returnText(0.00001)).toBe("0.00%");
    expect(returnText(null)).toBe("—");
    expect(percentText(0.25)).toBe("25%");
    expect(percentText(0.0312)).toBe("3.12%");
  });

  it("keeps chart axis money short", () => {
    expect(compactMoney(950)).toBe("$950");
    expect(compactMoney(12_400)).toBe("$12.4k");
    expect(compactMoney(103_000)).toBe("$103k");
    expect(compactMoney(1_250_000)).toBe("$1.25M");
    expect(compactMoney(-20_040)).toBe("−$20k");
  });

  it("says an order in one line", () => {
    const base = { quantity: null, notional: null, limit_price: null, stop_price: null };
    expect(orderSummary({ ...base, side: "buy", order_type: "market", quantity: 10 }, "ACME")).toBe(
      "Buy 10 ACME at market",
    );
    expect(orderSummary({ ...base, side: "buy", order_type: "market", notional: 1000 }, "ACME")).toBe(
      "Buy $1,000 of ACME at market",
    );
    expect(orderSummary({ ...base, side: "sell", order_type: "stop", quantity: 5, stop_price: 48 }, "ACME")).toBe(
      "Sell 5 ACME · stop $48.00",
    );
    expect(
      orderSummary(
        { ...base, side: "buy_to_cover", order_type: "stop_limit", quantity: 20, stop_price: 51, limit_price: 51.5 },
        "ACME",
      ),
    ).toBe("Buy to cover 20 ACME · stop $51.00, limit $51.50");
  });
});
