import { describe, expect, it } from "vitest";
import { marketsEnabled } from "./flags";
import { tradeHostPath, tradePlayPath, tradePresentPath } from "./routes";

describe("marketsEnabled", () => {
  it("is on only for a literal true", () => {
    expect(marketsEnabled("true")).toBe(true);
    for (const v of [undefined, "", "false", "1", "TRUE", "yes"]) expect(marketsEnabled(v)).toBe(false);
  });
});

describe("routes", () => {
  it("keep every trading screen under /markets/trade", () => {
    expect(tradePlayPath("abc")).toBe("/markets/trade/play/abc");
    expect(tradeHostPath("abc")).toBe("/markets/trade/host/abc");
    expect(tradePresentPath("abc")).toBe("/markets/trade/host/abc/present");
  });
});
