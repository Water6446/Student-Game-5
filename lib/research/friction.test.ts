import { describe, expect, it } from "vitest";
import {
  assignArm,
  cooldownEndsAt,
  laterOf,
  needsReview,
  confirmationMatches,
  cooldownLeft,
  typedNumber,
  FRICTION_PRESETS,
  frictionKnobs,
  frictionLabel,
  frictionProblems,
  frictionSummary,
  KNOB_KEYS,
  knobsFor,
  overridesFrom,
  resolveKnobs,
} from "./friction";

describe("friction presets", () => {
  it("every preset sets every knob", () => {
    for (const p of Object.values(FRICTION_PRESETS)) expect(Object.keys(p).sort()).toEqual([...KNOB_KEYS].sort());
  });

  it("orders the presets from least to most friction", () => {
    const { low, standard, high } = FRICTION_PRESETS;
    expect(low.review_step).toBe(false);
    expect(standard.review_step && high.review_step).toBe(true);
    expect(low.cooldown_seconds).toBeLessThanOrEqual(standard.cooldown_seconds);
    expect(standard.cooldown_seconds).toBeLessThan(high.cooldown_seconds);
    expect(high.typed_confirmation && !standard.typed_confirmation && !low.typed_confirmation).toBe(true);
    expect(high.risk_disclosure && !standard.risk_disclosure && !low.risk_disclosure).toBe(true);
    expect(low.one_tap_buy && !standard.one_tap_buy && !high.one_tap_buy).toBe(true);
    expect(low.celebrate_fills && !standard.celebrate_fills && !high.celebrate_fills).toBe(true);
  });

  // The same literal is asserted by scripts/markets_selftest.sql against
  // _friction_preset('high'): the TS and SQL presets cannot drift apart.
  it("matches the SQL preset for high friction", () => {
    expect(FRICTION_PRESETS.high).toEqual({
      one_tap_buy: false,
      amount_chips: false,
      review_step: true,
      typed_confirmation: true,
      cooldown_seconds: 30,
      risk_disclosure: true,
      celebrate_fills: false,
      show_movers: false,
      show_class_popular: false,
    });
  });

  it("falls back to standard", () => {
    expect(frictionKnobs(undefined)).toBe(FRICTION_PRESETS.standard);
    expect(frictionKnobs("high")).toBe(FRICTION_PRESETS.high);
    expect(resolveKnobs("extreme" as never)).toBe(FRICTION_PRESETS.standard);
  });
});

describe("overrides", () => {
  it("puts single knobs on top of the preset", () => {
    const k = resolveKnobs("standard", { celebrate_fills: true, cooldown_seconds: 5 });
    expect(k).toEqual({ ...FRICTION_PRESETS.standard, celebrate_fills: true, cooldown_seconds: 5 });
    expect(resolveKnobs("standard", {})).toEqual(FRICTION_PRESETS.standard);
  });

  it("applies to whichever arm a player is in", () => {
    const setup = {
      friction_profile: "standard" as const,
      friction_assignment: "per_player" as const,
      friction_arms: ["low" as const, "high" as const],
      friction_overrides: { celebrate_fills: false },
    };
    expect(knobsFor(setup, "low")).toEqual({ ...FRICTION_PRESETS.low, celebrate_fills: false });
    expect(knobsFor(setup, "high")).toEqual(FRICTION_PRESETS.high);
    expect(knobsFor(setup, null)).toEqual(FRICTION_PRESETS.standard);
  });

  it("keeps only what differs from the preset", () => {
    expect(overridesFrom("high", FRICTION_PRESETS.high)).toEqual({});
    expect(overridesFrom("high", { ...FRICTION_PRESETS.high, cooldown_seconds: 10 })).toEqual({ cooldown_seconds: 10 });
  });

  it("are checked in the server's words", () => {
    expect(frictionProblems({})).toEqual([]);
    expect(frictionProblems({ friction_overrides: { review_step: false, cooldown_seconds: 300 } })).toEqual([]);
    expect(frictionProblems({ friction_overrides: { pop_up: true } as never })).toEqual(["unknown friction knob: pop_up"]);
    expect(frictionProblems({ friction_overrides: { review_step: "yes" } as never })).toEqual([
      "friction knob review_step must be true or false",
    ]);
    for (const bad of [-1, 301, 2.5, "10"]) {
      expect(frictionProblems({ friction_overrides: { cooldown_seconds: bad } as never })).toEqual([
        "cooldown_seconds must be a whole number from 0 to 300",
      ]);
    }
    expect(frictionProblems({ friction_assignment: "per_class" as never })).toEqual([
      "friction_assignment must be session or per_player",
    ]);
    for (const arms of [["low"], ["low", "low"], ["low", "extreme"], ["low", "standard", "high", "low"]]) {
      expect(frictionProblems({ friction_arms: arms as never })).toEqual([
        "friction_arms must list two or three different friction profiles",
      ]);
    }
  });
});

describe("balanced assignment", () => {
  it("fills the arm with the fewest players, ties at random", () => {
    expect(assignArm(["low", "high"], { low: 3, high: 2 })).toBe("high");
    expect(assignArm(["low", "high"], {}, () => 0)).toBe("low");
    expect(assignArm(["low", "high"], {}, () => 0.99)).toBe("high");
  });

  it("never lets two arms differ by more than one player", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const arms = ["low", "standard", "high"] as const;
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    for (let i = 0; i < 61; i++) {
      const a = assignArm(arms, counts, rand);
      counts[a] = (counts[a] ?? 0) + 1;
      seen.add(a);
      const n = arms.map((x) => counts[x] ?? 0);
      expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(1);
    }
    expect(seen.size).toBe(3);
  });
});

describe("the knobs in words", () => {
  it("describes the knobs in force, one line each", () => {
    expect(frictionSummary(FRICTION_PRESETS.standard)).toEqual([
      "A review screen before every order",
      "25% / 50% / Max buttons in the ticket",
      "Biggest moves at the top of the market",
      "Nothing about what classmates buy",
      "No celebration on fills",
    ]);
    expect(frictionSummary(FRICTION_PRESETS.low)).toEqual([
      "Orders go straight from the ticket",
      "One-tap Buy buttons on the market list",
      "25% / 50% / Max buttons in the ticket",
      "Biggest moves at the top of the market",
      "What the class is buying, live",
      "Confetti when an order fills",
    ]);
    expect(frictionSummary(FRICTION_PRESETS.high).slice(0, 4)).toEqual([
      "A review screen before every order",
      "The amount typed again to confirm each order",
      "A risk warning before short sales and margin buys",
      "A 30 s wait between orders",
    ]);
  });

  it("names the setup", () => {
    const base = {
      friction_profile: "standard" as const,
      friction_assignment: "session" as const,
      friction_arms: ["low" as const, "high" as const],
      friction_overrides: {},
    };
    expect(frictionLabel(base)).toBe("Standard");
    expect(frictionLabel({ ...base, friction_overrides: { celebrate_fills: true } })).toBe("Standard, customized");
    expect(frictionLabel({ ...base, friction_overrides: { review_step: true } })).toBe("Standard");
    expect(frictionLabel({ ...base, friction_assignment: "per_player" })).toBe("Low or High, assigned at random");
    expect(frictionLabel({ ...base, friction_assignment: "per_player", friction_arms: ["low", "standard", "high"] })).toBe(
      "Low, Standard or High, assigned at random",
    );
  });
});

describe("the order flow's friction steps", () => {
  it("counts the cooldown down in whole seconds", () => {
    const t0 = Date.parse("2026-01-01T10:00:00Z");
    expect(cooldownLeft("2026-01-01T10:00:00Z", 30, t0)).toBe(30);
    expect(cooldownLeft("2026-01-01T10:00:00Z", 30, t0 + 29_100)).toBe(1);
    expect(cooldownLeft("2026-01-01T10:00:00Z", 30, t0 + 30_000)).toBe(0);
    expect(cooldownLeft(null, 30, t0)).toBe(0);
    expect(cooldownLeft("2026-01-01T10:00:00Z", 0, t0)).toBe(0);
    expect(cooldownLeft("not a time", 30, t0)).toBe(0);
  });

  it("reads a typed confirmation the way a student types it", () => {
    expect(confirmationMatches("1,000", 1000)).toBe(true);
    expect(confirmationMatches("$1000.00", 1000)).toBe(true);
    expect(confirmationMatches(" 12.5 ", 12.5)).toBe(true);
    expect(confirmationMatches("100", 1000)).toBe(false);
    expect(confirmationMatches("", 1000)).toBe(false);
    expect(confirmationMatches("1e3", 1000)).toBe(false);
    expect(confirmationMatches("10", null)).toBe(false);
    expect(typedNumber(".")).toBeNull();
  });
});

describe("the order flow's timing", () => {
  it("gives the cooldown's end as a deadline, or none", () => {
    expect(cooldownEndsAt("2026-01-01T10:00:00.000Z", 30)).toBe("2026-01-01T10:00:30.000Z");
    expect(cooldownEndsAt("2026-01-01T10:00:00.000Z", 0)).toBeNull();
    expect(cooldownEndsAt(null, 30)).toBeNull();
  });

  it("takes the later of the account's and the last order's time", () => {
    expect(laterOf("2026-01-01T10:00:00Z", "2026-01-01T10:00:05Z")).toBe("2026-01-01T10:00:05Z");
    expect(laterOf("2026-01-01T10:00:09Z", "2026-01-01T10:00:05Z")).toBe("2026-01-01T10:00:09Z");
    expect(laterOf(null, "x")).toBe("x");
    expect(laterOf(undefined, null)).toBeNull();
  });

  it("brings the review screen with a typed confirmation", () => {
    expect(needsReview({ review_step: false, typed_confirmation: true })).toBe(true);
    expect(needsReview({ review_step: false, typed_confirmation: false })).toBe(false);
    expect(needsReview(FRICTION_PRESETS.high)).toBe(true);
  });
});
