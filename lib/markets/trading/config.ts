// Paper trading session options: defaults and validation. Pure.
// MIRRORS _trading_config_defaults and the checks in create_trading_session
// (supabase/migrations/0033_trading_rpcs.sql). The server is the authority;
// this lets the setup form show the same limits before it submits.

import type { FrictionProfile, SessionConfig, TradingPeriod } from "../../game/types";
import { frictionProblems, type FrictionAssignment, type FrictionKnobs } from "../../research/friction";
import { PERIODS } from "../clock";

/** Real history (dev data until a licence), or the simulated market of 0037. */
export type MarketData = "historical" | "simulated";

export interface TradingConfig {
  game_type: "trading";
  label?: string;
  /** absent: real history when the database holds any, else simulated (the server decides) */
  market_data?: MarketData;
  num_rounds: number;
  period: TradingPeriod;
  starting_wealth: number;
  round_seconds: number;
  universe_size: number;
  allow_late_join: boolean;
  show_full_leaderboard_to_students: boolean;
  margin_enabled: boolean;
  initial_margin: number;
  maint_long: number;
  maint_short: number;
  shorting_enabled: boolean;
  borrow_fee: number;
  borrow_spread: number;
  spread: number;
  commission: number;
  headlines: boolean;
  friction_profile: FrictionProfile;
  /** one profile for everyone, or each student assigned one of friction_arms on joining */
  friction_assignment: FrictionAssignment;
  friction_arms: FrictionProfile[];
  /** single knobs set on top of the profile (or of each arm) */
  friction_overrides: Partial<FrictionKnobs>;
  /** consent screen before play; only consenting students are logged and exported */
  research_mode: boolean;
}

export const TRADING_DEFAULTS: TradingConfig = {
  game_type: "trading",
  num_rounds: 25,
  period: "quarter",
  starting_wealth: 100_000,
  round_seconds: 90,
  universe_size: 25,
  allow_late_join: false,
  show_full_leaderboard_to_students: true,
  margin_enabled: true,
  initial_margin: 0.5,
  maint_long: 0.25,
  maint_short: 0.3,
  shorting_enabled: true,
  borrow_fee: 0.003,
  borrow_spread: 0.05,
  spread: 0.001,
  commission: 0,
  headlines: true,
  friction_profile: "standard",
  friction_assignment: "session",
  friction_arms: ["low", "high"],
  friction_overrides: {},
  research_mode: false,
};

/** Years of real history shown before Year 1 (fixed; the server sets it). */
export const HISTORY_YEARS = 5;

const between = (x: unknown, lo: number, hi: number) =>
  typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

export interface ConfigProblem {
  field: keyof TradingConfig;
  /** the server's words */
  message: string;
}

/**
 * Every problem with a config, each tied to its option and in the server's
 * words; empty when the server would accept it. (The server also checks the
 * data covers the window.)
 */
export function tradingConfigProblems(input: Partial<TradingConfig>): ConfigProblem[] {
  const c = { ...TRADING_DEFAULTS, ...input };
  const problems: ConfigProblem[] = [];
  const bad = (field: keyof TradingConfig, message: string) => problems.push({ field, message });
  if (!PERIODS.includes(c.period)) bad("period", "period must be year, half, quarter, month or week");
  if (!Number.isInteger(c.num_rounds) || !between(c.num_rounds, 1, 100)) bad("num_rounds", "num_rounds must be 1..100");
  if (!between(c.starting_wealth, 1000, 10_000_000)) {
    bad("starting_wealth", "starting cash must be between $1,000 and $10,000,000");
  }
  if (!Number.isInteger(c.round_seconds) || !between(c.round_seconds, 30, 600)) {
    bad("round_seconds", "round_seconds must be 30..600");
  }
  if (!Number.isInteger(c.universe_size) || !between(c.universe_size, 5, 25)) {
    bad("universe_size", "universe_size must be 5..25");
  }
  if (!between(c.initial_margin, 0.25, 1)) bad("initial_margin", "initial_margin must be 0.25..1");
  if (!between(c.maint_long, 0.1, c.initial_margin)) bad("maint_long", "maint_long must be 0.1..initial_margin");
  if (!between(c.maint_short, 0.1, 1)) bad("maint_short", "maint_short must be 0.1..1");
  if (!between(c.borrow_fee, 0, 0.5)) bad("borrow_fee", "borrow_fee must be 0..0.5");
  if (!between(c.borrow_spread, 0, 0.2)) bad("borrow_spread", "borrow_spread must be 0..0.2");
  if (!between(c.spread, 0, 0.02)) bad("spread", "spread must be 0..0.02");
  if (!between(c.commission, 0, 100)) bad("commission", "commission must be 0..100");
  if (c.market_data !== undefined && c.market_data !== "historical" && c.market_data !== "simulated") {
    bad("market_data", "market_data must be historical or simulated");
  }
  if (!["low", "standard", "high"].includes(c.friction_profile)) {
    bad("friction_profile", "friction_profile must be low, standard or high");
  }
  for (const message of frictionProblems(c)) {
    bad(
      message.startsWith("friction_assignment")
        ? "friction_assignment"
        : message.startsWith("friction_arms")
          ? "friction_arms"
          : "friction_overrides",
      message,
    );
  }
  for (const k of [
    "allow_late_join",
    "show_full_leaderboard_to_students",
    "margin_enabled",
    "shorting_enabled",
    "headlines",
    "research_mode",
  ] as const) {
    if (typeof c[k] !== "boolean") bad(k, `${k} must be true or false`);
  }
  return problems;
}

/** The same problems as plain messages. */
export function validateTradingConfig(input: Partial<TradingConfig>): string[] {
  return tradingConfigProblems(input).map((p) => p.message);
}

/** A stored session config read as trading options, defaults filled in. */
export function tradingConfigOf(config: SessionConfig): TradingConfig {
  const pick = <K extends keyof TradingConfig>(k: K): TradingConfig[K] =>
    ((config as unknown as Partial<TradingConfig>)[k] ?? TRADING_DEFAULTS[k]) as TradingConfig[K];
  const out = { ...TRADING_DEFAULTS };
  for (const k of Object.keys(TRADING_DEFAULTS) as (keyof TradingConfig)[]) {
    (out as Record<string, unknown>)[k] = pick(k);
  }
  out.game_type = "trading";
  if (config.label) out.label = config.label;
  // every session before 0037 played real history
  out.market_data = config.market_data === "simulated" ? "simulated" : "historical";
  return out;
}

/** A game on the simulated market: no real era, companies or calendar to reveal. */
export function isSimulatedMarket(config: { market_data?: string }): boolean {
  return config.market_data === "simulated";
}
