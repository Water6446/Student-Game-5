import { describe, expect, it } from "vitest";
import { applyHiddenOdds, oddsHidden } from "./hidden-odds";
import { DEFAULT_CONFIG, type SessionConfig } from "./types";

const base: SessionConfig = { ...DEFAULT_CONFIG };

describe("oddsHidden", () => {
  it("is true while a game with hidden odds is running", () => {
    expect(oddsHidden({ ...base, show_odds_to_students: false }, "lobby")).toBe(true);
    expect(oddsHidden({ ...base, show_odds_to_students: false }, "active")).toBe(true);
  });

  it("is false once the game finishes, or when the odds are shown", () => {
    expect(oddsHidden({ ...base, show_odds_to_students: false }, "finished")).toBe(false);
    expect(oddsHidden({ ...base, show_odds_to_students: true }, "active")).toBe(false);
  });

  it("treats a missing flag as hidden, like every student screen", () => {
    const { show_odds_to_students: _omit, ...noFlag } = base;
    expect(oddsHidden(noFlag as SessionConfig, "active")).toBe(true);
  });

  it("never applies to the manager game", () => {
    expect(oddsHidden({ ...base, game_type: "manager", show_odds_to_students: false }, "active")).toBe(false);
  });
});

describe("applyHiddenOdds", () => {
  it("fills in the game-level odds", () => {
    const { good_prob: _omit, ...stripped } = base;
    expect(applyHiddenOdds(stripped, { good_prob: 0.23 }).good_prob).toBe(0.23);
  });

  it("fills in per-asset odds by position, keeping the rest of each asset", () => {
    const cfg: SessionConfig = { ...base, game_type: "portfolio", assets: [{ name: "Tech" }, { name: "Bonds" }] };
    const out = applyHiddenOdds(cfg, { assets: [0.9, null] });
    expect(out.assets).toEqual([{ name: "Tech", good_prob: 0.9 }, { name: "Bonds" }]);
  });

  it("never overwrites a value the config already has", () => {
    expect(applyHiddenOdds({ ...base, good_prob: 0.7 }, { good_prob: 0.1 }).good_prob).toBe(0.7);
  });

  it("returns the config untouched when there is nothing stashed", () => {
    expect(applyHiddenOdds(base, null)).toBe(base);
    expect(applyHiddenOdds(base, undefined)).toBe(base);
  });
});
