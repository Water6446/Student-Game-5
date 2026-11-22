import { describe, expect, it } from "vitest";
import { TRADING_DEFAULTS, tradingConfigOf, tradingConfigProblems, validateTradingConfig } from "./config";
import type { SessionConfig } from "../../game/types";

describe("TRADING_DEFAULTS", () => {
  it("match the decisions in docs/PAPER_TRADING.md (and _trading_config_defaults)", () => {
    expect(TRADING_DEFAULTS).toMatchObject({
      starting_wealth: 100_000,
      round_seconds: 90,
      universe_size: 25,
      num_rounds: 25,
      spread: 0.001,
      commission: 0,
      initial_margin: 0.5,
      maint_long: 0.25,
      maint_short: 0.3,
      friction_profile: "standard",
    });
    expect(validateTradingConfig(TRADING_DEFAULTS)).toEqual([]);
  });
});

describe("validateTradingConfig (mirrors create_trading_session)", () => {
  it("reports each out-of-range option in the server's words", () => {
    const problems = validateTradingConfig({
      period: "decade" as never,
      num_rounds: 0,
      starting_wealth: 10,
      round_seconds: 5,
      universe_size: 30,
      spread: 0.5,
      maint_long: 0.9,
      friction_profile: "extreme" as never,
      headlines: "yes" as never,
    });
    expect(problems).toEqual([
      "period must be year, half, quarter, month or week",
      "num_rounds must be 1..100",
      "starting cash must be between $1,000 and $10,000,000",
      "round_seconds must be 30..600",
      "universe_size must be 5..25",
      "maint_long must be 0.1..initial_margin",
      "spread must be 0..0.02",
      "friction_profile must be low, standard or high",
      "headlines must be true or false",
    ]);
  });
});

describe("tradingConfigProblems", () => {
  it("ties each problem to its option, for the setup form", () => {
    expect(tradingConfigProblems({ num_rounds: 2.5, maint_long: 0.6, initial_margin: 0.5 })).toEqual([
      { field: "num_rounds", message: "num_rounds must be 1..100" },
      { field: "maint_long", message: "maint_long must be 0.1..initial_margin" },
    ]);
    expect(tradingConfigProblems({ margin_enabled: 1 as never }).map((p) => p.field)).toEqual(["margin_enabled"]);
    expect(
      tradingConfigProblems({
        friction_assignment: "per_class" as never,
        friction_arms: ["low"],
        friction_overrides: { cooldown_seconds: 999 },
      }),
    ).toEqual([
      { field: "friction_assignment", message: "friction_assignment must be session or per_player" },
      { field: "friction_arms", message: "friction_arms must list two or three different friction profiles" },
      { field: "friction_overrides", message: "cooldown_seconds must be a whole number from 0 to 300" },
    ]);
  });
});

describe("tradingConfigOf", () => {
  it("fills defaults into a stored config", () => {
    const c = tradingConfigOf({ game_type: "trading", period: "month", num_rounds: 6, label: "Sec B" } as SessionConfig);
    expect(c.period).toBe("month");
    expect(c.num_rounds).toBe(6);
    expect(c.starting_wealth).toBe(100_000);
    expect(c.label).toBe("Sec B");
  });
});
