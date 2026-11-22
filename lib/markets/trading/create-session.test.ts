import { describe, expect, it } from "vitest";
import { shrunkUniverseWarning } from "./create-session";

describe("shrunkUniverseWarning", () => {
  it("says how many companies the game got when the era had fewer", () => {
    expect(shrunkUniverseWarning(25, 19)).toBe("Only 19 companies have data for that era, so this game has 19.");
  });

  it("is silent when the game got what it asked for, or the request is unknown", () => {
    expect(shrunkUniverseWarning(25, 25)).toBeNull();
    expect(shrunkUniverseWarning(NaN, 19)).toBeNull();
  });
});
