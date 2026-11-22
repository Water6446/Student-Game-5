// Friction: how much a trade costs the student in taps, time and attention.
// It is the experiment's independent variable (docs/PAPER_TRADING.md §8.2), so
// each knob is a named switch the trading screens read, never an ad-hoc
// condition. Section-level: the betting and prediction-market games will read
// the same knobs.
//
// A session picks a preset (config.friction_profile) and may override single
// knobs (config.friction_overrides). With config.friction_assignment =
// "per_player", each student is instead assigned one of config.friction_arms
// when they join, balanced across the arms; the assignment is server-only and
// a student's screens get only the resolved knobs (get_my_conditions).
//
// MIRRORS _friction_preset, _friction_knobs, _friction_problems and
// players_assign_condition in supabase/migrations/0035_research.sql.

import type { FrictionProfile } from "../game/types";

export const FRICTION_PROFILES: readonly FrictionProfile[] = ["low", "standard", "high"];

export interface FrictionKnobs {
  /** a Buy button on each market-list row places a market order for a preset amount, without the ticket */
  one_tap_buy: boolean;
  /** preset amount buttons in the ticket (25%, 50%, Max) */
  amount_chips: boolean;
  /** a review screen between the ticket and placing the order */
  review_step: boolean;
  /** the order's amount typed again to confirm it */
  typed_confirmation: boolean;
  /** seconds between orders, enforced by place_order */
  cooldown_seconds: number;
  /** a risk warning to accept before a short sale or a purchase on margin */
  risk_disclosure: boolean;
  /** confetti when your orders fill */
  celebrate_fills: boolean;
  /** the biggest risers and fallers at the top of the market list */
  show_movers: boolean;
  /** what the class is buying this round, live */
  show_class_popular: boolean;
}

export type FrictionKnob = keyof FrictionKnobs;

export const KNOB_KEYS = [
  "one_tap_buy",
  "amount_chips",
  "review_step",
  "typed_confirmation",
  "cooldown_seconds",
  "risk_disclosure",
  "celebrate_fills",
  "show_movers",
  "show_class_popular",
] as const satisfies readonly FrictionKnob[];

/** The longest wait between orders a host can set. */
export const COOLDOWN_MAX = 300;

export type FrictionAssignment = "session" | "per_player";

/**
 * Per-player assignment is built and tested (selftest and vitest) but not
 * offered in the setup form yet: v1 runs one profile per session. Flipping
 * this shows the option to hosts; nothing else changes.
 */
export const PER_PLAYER_ASSIGNMENT_OFFERED = false;

/** What each preset is called and what it is like, for the host. */
export const FRICTION_PROFILE_TEXT: Record<FrictionProfile, { label: string; line: string }> = {
  low: { label: "Low", line: "Built to make trading effortless, like a trading app" },
  standard: { label: "Standard", line: "An ordinary brokerage" },
  high: { label: "High", line: "Every order asks for a moment's thought" },
};

export const FRICTION_PRESETS: Record<FrictionProfile, FrictionKnobs> = {
  // an app built to make trading effortless
  low: {
    one_tap_buy: true,
    amount_chips: true,
    review_step: false,
    typed_confirmation: false,
    cooldown_seconds: 0,
    risk_disclosure: false,
    celebrate_fills: true,
    show_movers: true,
    show_class_popular: true,
  },
  // an ordinary brokerage
  standard: {
    one_tap_buy: false,
    amount_chips: true,
    review_step: true,
    typed_confirmation: false,
    cooldown_seconds: 0,
    risk_disclosure: false,
    celebrate_fills: false,
    show_movers: true,
    show_class_popular: false,
  },
  // every order asks for a moment's thought
  high: {
    one_tap_buy: false,
    amount_chips: false,
    review_step: true,
    typed_confirmation: true,
    cooldown_seconds: 30,
    risk_disclosure: true,
    celebrate_fills: false,
    show_movers: false,
    show_class_popular: false,
  },
};

const isProfile = (p: unknown): p is FrictionProfile => FRICTION_PROFILES.includes(p as FrictionProfile);

/** A preset with the session's overrides on top. Unknown keys are ignored. */
export function resolveKnobs(
  profile: FrictionProfile | null | undefined,
  overrides?: Partial<FrictionKnobs> | null,
): FrictionKnobs {
  const base = FRICTION_PRESETS[isProfile(profile) ? profile : "standard"];
  if (!overrides) return base;
  const out = { ...base };
  for (const k of KNOB_KEYS) {
    const v = overrides[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The preset alone (no overrides). */
export function frictionKnobs(profile: FrictionProfile | null | undefined): FrictionKnobs {
  return FRICTION_PRESETS[isProfile(profile) ? profile : "standard"];
}

/** The friction parts of a session's config. */
export interface FrictionSetup {
  friction_profile: FrictionProfile;
  friction_assignment: FrictionAssignment;
  friction_arms: FrictionProfile[];
  friction_overrides: Partial<FrictionKnobs>;
}

/** What a player in `arm` gets (the session's profile when there is no arm). */
export function knobsFor(setup: FrictionSetup, arm?: FrictionProfile | null): FrictionKnobs {
  return resolveKnobs(arm ?? setup.friction_profile, setup.friction_overrides);
}

/**
 * Every problem with the friction settings, in the server's words; empty when
 * the server would accept them. MIRRORS _friction_problems (0035).
 */
export function frictionProblems(setup: Partial<FrictionSetup>): string[] {
  const out: string[] = [];
  const assignment = setup.friction_assignment ?? "session";
  if (assignment !== "session" && assignment !== "per_player") {
    out.push("friction_assignment must be session or per_player");
  }
  const arms = setup.friction_arms ?? ["low", "high"];
  if (
    !Array.isArray(arms) ||
    arms.length < 2 ||
    arms.length > 3 ||
    !arms.every(isProfile) ||
    new Set(arms).size !== arms.length
  ) {
    out.push("friction_arms must list two or three different friction profiles");
  }
  const o = setup.friction_overrides ?? {};
  if (typeof o !== "object" || o === null || Array.isArray(o)) {
    out.push("friction_overrides must be an object");
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (!(KNOB_KEYS as readonly string[]).includes(k)) {
      out.push(`unknown friction knob: ${k}`);
    } else if (k === "cooldown_seconds") {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > COOLDOWN_MAX) {
        out.push(`cooldown_seconds must be a whole number from 0 to ${COOLDOWN_MAX}`);
      }
    } else if (typeof v !== "boolean") {
      out.push(`friction knob ${k} must be true or false`);
    }
  }
  return out;
}

/** Only the knobs that differ from the preset: what config.friction_overrides should hold. */
export function overridesFrom(profile: FrictionProfile, knobs: FrictionKnobs): Partial<FrictionKnobs> {
  const base = FRICTION_PRESETS[profile];
  const out: Partial<FrictionKnobs> = {};
  for (const k of KNOB_KEYS) {
    if (knobs[k] !== base[k]) (out as Record<string, unknown>)[k] = knobs[k];
  }
  return out;
}

/**
 * Balanced assignment: the arm with the fewest players so far, ties broken at
 * random, which is permuted-block randomization with blocks the size of the
 * arm list. MIRRORS players_assign_condition (0035). `rand` is in [0, 1).
 */
export function assignArm(
  arms: readonly FrictionProfile[],
  counts: Partial<Record<FrictionProfile, number>>,
  rand: () => number = Math.random,
): FrictionProfile {
  const n = (a: FrictionProfile) => counts[a] ?? 0;
  const least = Math.min(...arms.map(n));
  const tied = arms.filter((a) => n(a) === least);
  return tied[Math.min(tied.length - 1, Math.floor(rand() * tied.length))];
}

// ---- the knobs in words, for the host -----------------------------------------

type KnobLine = (k: FrictionKnobs) => string | null;

// In screen order: the ticket's gates first, then what the lists show. An "off"
// that is simply the ordinary default says nothing (null).
const KNOB_LINES: Record<FrictionKnob, KnobLine> = {
  review_step: (k) => (k.review_step ? "A review screen before every order" : "Orders go straight from the ticket"),
  typed_confirmation: (k) => (k.typed_confirmation ? "The amount typed again to confirm each order" : null),
  risk_disclosure: (k) => (k.risk_disclosure ? "A risk warning before short sales and margin buys" : null),
  cooldown_seconds: (k) => (k.cooldown_seconds > 0 ? `A ${k.cooldown_seconds} s wait between orders` : null),
  one_tap_buy: (k) => (k.one_tap_buy ? "One-tap Buy buttons on the market list" : null),
  amount_chips: (k) => (k.amount_chips ? "25% / 50% / Max buttons in the ticket" : "Amounts typed by hand"),
  show_movers: (k) => (k.show_movers ? "Biggest moves at the top of the market" : "No movers list"),
  show_class_popular: (k) =>
    k.show_class_popular ? "What the class is buying, live" : "Nothing about what classmates buy",
  celebrate_fills: (k) => (k.celebrate_fills ? "Confetti when an order fills" : "No celebration on fills"),
};

const LINE_ORDER: readonly FrictionKnob[] = [
  "review_step",
  "typed_confirmation",
  "risk_disclosure",
  "cooldown_seconds",
  "one_tap_buy",
  "amount_chips",
  "show_movers",
  "show_class_popular",
  "celebrate_fills",
];

/** One line per knob in force, for the host: "A review screen before every order". */
export function frictionSummary(knobs: FrictionKnobs): string[] {
  return LINE_ORDER.map((k) => KNOB_LINES[k](knobs)).filter((l): l is string => l != null);
}

/** "Standard", "Standard, customized", or "Low or High, assigned at random". */
export function frictionLabel(setup: FrictionSetup): string {
  if (setup.friction_assignment === "per_player") {
    const names = setup.friction_arms.map((a) => FRICTION_PROFILE_TEXT[a].label);
    return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}, assigned at random`;
  }
  const custom = Object.keys(overridesFrom(setup.friction_profile, knobsFor(setup))).length > 0;
  return `${FRICTION_PROFILE_TEXT[setup.friction_profile].label}${custom ? ", customized" : ""}`;
}

/** What each knob is, for the host's customize list. */
export const KNOB_TEXT: Record<FrictionKnob, string> = {
  review_step: "Review screen before each order",
  typed_confirmation: "Type the amount again to confirm",
  risk_disclosure: "Risk warning before shorts and margin buys",
  cooldown_seconds: "Wait between orders",
  one_tap_buy: "One-tap Buy on the market list",
  amount_chips: "25% / 50% / Max buttons",
  show_movers: "Biggest moves list",
  show_class_popular: "What the class is buying",
  celebrate_fills: "Confetti on fills",
};

// ---- the order flow's friction steps ---------------------------------------------

/**
 * Whole seconds until the next order is allowed (0 when it is), counted from
 * the last placed order. MIRRORS the cooldown check in place_order (0035);
 * the server's clock decides, this only drives the countdown.
 */
export function cooldownLeft(lastOrderAt: string | null | undefined, cooldownSeconds: number, now = Date.now()): number {
  if (!lastOrderAt || !(cooldownSeconds > 0)) return 0;
  const at = Date.parse(lastOrderAt);
  if (!Number.isFinite(at)) return 0;
  const left = (at + cooldownSeconds * 1000 - now) / 1000;
  return left > 0 ? Math.ceil(left) : 0;
}

/** When the next order is allowed (ISO), or null when there is no wait: a deadline for useCountdown. */
export function cooldownEndsAt(lastOrderAt: string | null | undefined, cooldownSeconds: number): string | null {
  if (!lastOrderAt || !(cooldownSeconds > 0)) return null;
  const at = Date.parse(lastOrderAt);
  return Number.isFinite(at) ? new Date(at + cooldownSeconds * 1000).toISOString() : null;
}

/** The later of two ISO times (either may be missing). */
export function laterOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * The typed confirmation lives on the review screen, so turning it on brings
 * the review screen with it even when review_step is off.
 */
export function needsReview(k: Pick<FrictionKnobs, "review_step" | "typed_confirmation">): boolean {
  return k.review_step || k.typed_confirmation;
}

/** The number a typed confirmation must match, read the way a student types it ("1,000", "$1000.00"). */
export function typedNumber(text: string): number | null {
  const t = text.replace(/[\s,$]/g, "");
  if (t === "" || !/^\d*\.?\d*$/.test(t) || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Does the typed confirmation match the order's amount? */
export function confirmationMatches(typed: string, amount: number | null): boolean {
  const n = typedNumber(typed);
  return n != null && amount != null && Math.abs(n - amount) < 1e-9;
}
