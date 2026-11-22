import { describe, expect, it } from "vitest";
import { hostPath, playPath, presentPath } from "./routes";
import type { SessionConfig } from "../game/types";

const cfg = (game_type?: SessionConfig["game_type"]) => ({ config: { game_type } as SessionConfig });

describe("screen paths by game type", () => {
  it("sends paper trading to the Markets screens", () => {
    expect(playPath("s1", cfg("trading"))).toBe("/markets/trade/play/s1");
    expect(hostPath("s1", cfg("trading"))).toBe("/markets/trade/host/s1");
    expect(presentPath("s1", cfg("trading"))).toBe("/markets/trade/host/s1/present");
  });

  it("keeps the three classroom games, and sessions with no type, where they were", () => {
    for (const t of ["basic", "portfolio", "manager", undefined] as const) {
      expect(playPath("s1", cfg(t))).toBe("/play/s1");
      expect(hostPath("s1", cfg(t))).toBe("/host/s1");
      expect(presentPath("s1", cfg(t))).toBe("/host/s1/present");
    }
  });

  it("falls back to the classroom routes when the config is missing (they redirect)", () => {
    expect(playPath("s1", { config: null })).toBe("/play/s1");
    expect(hostPath("s1", { config: undefined })).toBe("/host/s1");
  });
});
