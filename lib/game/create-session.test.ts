import { describe, expect, it } from "vitest";
import { configForRerun } from "./create-session";
import type { SessionConfig } from "./types";

describe("configForRerun", () => {
  it("drops the manager line-up so the server rebuilds it with a fresh alpha", () => {
    const out = configForRerun({
      game_type: "manager",
      num_rounds: 10,
      managers: [{ name: "A" }],
    } as unknown as SessionConfig);
    expect(out).not.toHaveProperty("managers");
    expect(out.num_rounds).toBe(10);
  });

  it("keeps a paper trading game's settings and drops what the server writes", () => {
    const out = configForRerun({
      game_type: "trading",
      num_rounds: 25,
      period: "quarter",
      universe_size: 22,
      label: "Section B",
      friction_profile: "high",
      data_source: "yahoo-dev",
      data_license: "dev-only",
      history_years: 5,
    } as SessionConfig);
    expect(out).toEqual({
      game_type: "trading",
      num_rounds: 25,
      period: "quarter",
      universe_size: 22,
      label: "Section B",
      friction_profile: "high",
    });
  });
});
