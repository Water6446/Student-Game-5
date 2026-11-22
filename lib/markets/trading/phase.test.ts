import { describe, expect, it } from "vitest";
import { tradingPhase } from "./phase";

describe("tradingPhase", () => {
  it("follows the session first", () => {
    expect(tradingPhase("lobby", "loading", null)).toBe("lobby");
    expect(tradingPhase("finished", "revealed", null)).toBe("finished");
  });

  it("is open until the clock runs out or the host locks", () => {
    expect(tradingPhase("active", "open", 42)).toBe("open");
    expect(tradingPhase("active", "open", null)).toBe("open");
    expect(tradingPhase("active", "open", 0)).toBe("closed");
    expect(tradingPhase("active", "locked", 30)).toBe("closed");
  });

  it("shows the reveal and the in-between load as their own phases", () => {
    expect(tradingPhase("active", "revealed", null)).toBe("revealed");
    expect(tradingPhase("active", "loading", null)).toBe("loading");
  });
});
