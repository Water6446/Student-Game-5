import { describe, expect, it } from "vitest";
import { TRADING_DEFAULTS as DEFAULTS, type TradingConfig } from "./config";
import { configSummary, roundsLine } from "./summary";

// a created session always says which market it played
const TRADING_DEFAULTS: TradingConfig = { ...DEFAULTS, market_data: "historical" };

describe("the setup in plain words", () => {
  it("sums up the standard setup", () => {
    expect(roundsLine(TRADING_DEFAULTS)).toBe("25 quarters (6.25 years of market time) · 90 s to trade each");
    expect(configSummary(TRADING_DEFAULTS)).toEqual([
      "$100,000 each to trade 25 large US companies and an index fund",
      "Real prices from a hidden era: names and dates are revealed at the end",
      "Margin up to 2× the account, short selling on",
      "0.1% spread on every trade, no commission",
      "Standard friction: a review screen before every order",
      "Headlines each round · late joiners are locked out once it starts",
    ]);
  });

  it("follows the options", () => {
    const c = { ...TRADING_DEFAULTS, margin_enabled: false, commission: 4.95, friction_profile: "low" as const };
    const lines = configSummary(c);
    expect(lines[2]).toBe("No margin; short sales are fully backed by cash");
    expect(lines[3]).toBe("0.1% spread on every trade and $4.95 per order");
    expect(lines[4]).toBe("Low friction: orders go straight from the ticket");
    expect(configSummary({ ...c, shorting_enabled: false })[2]).toBe("No margin and no short selling");
    expect(roundsLine({ ...TRADING_DEFAULTS, period: "week", num_rounds: 1 })).toBe(
      "1 week (1 week of market time) · 90 s to trade each",
    );
    expect(configSummary({ ...TRADING_DEFAULTS, friction_overrides: { review_step: false } })[4]).toBe(
      "Standard friction, customized: orders go straight from the ticket",
    );
    expect(configSummary({ ...TRADING_DEFAULTS, friction_assignment: "per_player" })[4]).toBe(
      "Friction: low or high, assigned at random",
    );
    expect(configSummary({ ...TRADING_DEFAULTS, research_mode: true })[6]).toBe(
      "Research mode: a consent screen first; only students who agree are recorded",
    );
    expect(roundsLine({ ...TRADING_DEFAULTS, period: "half", num_rounds: 4 })).toBe(
      "4 halves (2 years of market time) · 90 s to trade each",
    );
  });

  it("names the market, or leaves it out until the setup form knows it", () => {
    const sim = configSummary({ ...TRADING_DEFAULTS, market_data: "simulated" });
    expect(sim[0]).toBe("$100,000 each to trade 25 companies and an index fund");
    expect(sim[1]).toBe("A simulated market: generated prices, with booms and crashes");
    const unknown = configSummary(DEFAULTS);
    expect(unknown).toHaveLength(5);
    expect(unknown[1]).toBe("Margin up to 2× the account, short selling on");
  });

  it("reads an emptied box as a dash, never NaN", () => {
    const lines = configSummary({ ...TRADING_DEFAULTS, starting_wealth: NaN, initial_margin: NaN });
    expect(lines[0]).toBe("— each to trade 25 large US companies and an index fund");
    expect(lines[2]).toBe("Margin up to —× the account, short selling on");
    expect(roundsLine({ ...TRADING_DEFAULTS, num_rounds: NaN })).toBe("— quarters · 90 s to trade each");
  });
});
