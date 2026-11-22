// A paper trading session's options in plain words, for the setup form's
// "Standard setup" box and the host's settings panel. Pure.

import { money } from "../../game/format";
import {
  FRICTION_PROFILE_TEXT,
  frictionLabel,
  frictionSummary,
  knobsFor,
  overridesFrom,
} from "../../research/friction";
import { periodNoun, periodPlural, windowLength } from "../clock";
import { percentText } from "../format";
import { isSimulatedMarket, type TradingConfig } from "./config";

// A box the host emptied reads "—" instead of NaN.
const ok = (v: number) => Number.isFinite(v);

/** "25 quarters (6.25 years of market time) · 90 s to trade each". */
export function roundsLine(c: TradingConfig): string {
  const one = periodNoun(c.period).toLowerCase();
  const many = periodPlural(c.period);
  const n = Number.isInteger(c.num_rounds) && c.num_rounds >= 1 ? c.num_rounds : null;
  return [
    n == null ? `— ${many}` : `${n} ${n === 1 ? one : many} (${windowLength(c.period, n)} of market time)`,
    `${ok(c.round_seconds) ? c.round_seconds : "—"} s to trade each`,
  ].join(" · ");
}

/** The rest of the setup, one line per topic. */
export function configSummary(c: TradingConfig): string[] {
  const leverage = ok(c.initial_margin) && c.initial_margin > 0 ? Math.round((1 / c.initial_margin) * 10) / 10 : null;
  const simulated = isSimulatedMarket(c);
  return [
    `${ok(c.starting_wealth) ? money(c.starting_wealth) : "—"} each to trade ${
      ok(c.universe_size) ? c.universe_size : "—"
    } ${simulated ? "" : "large US "}companies and an index fund`,
    // absent while the setup form is still asking which markets exist
    ...(c.market_data === undefined ? [] : [marketLine(c)]),
    c.margin_enabled
      ? `Margin up to ${leverage ?? "—"}× the account${c.shorting_enabled ? ", short selling on" : ", no short selling"}`
      : c.shorting_enabled
        ? "No margin; short sales are fully backed by cash"
        : "No margin and no short selling",
    `${ok(c.spread) ? percentText(c.spread) : "—"} spread on every trade${
      c.commission > 0 ? ` and ${money(c.commission)} per order` : ", no commission"
    }`,
    frictionLine(c),
    `${c.headlines ? "Headlines each round" : "No headlines"} · late joiners ${
      c.allow_late_join ? "can still get in" : "are locked out once it starts"
    }`,
    ...(c.research_mode ? ["Research mode: a consent screen first; only students who agree are recorded"] : []),
  ];
}

/** Where the prices come from, in one line. */
export function marketLine(c: Pick<TradingConfig, "market_data">): string {
  return isSimulatedMarket(c)
    ? "A simulated market: generated prices, with booms and crashes"
    : "Real prices from a hidden era: names and dates are revealed at the end";
}

/** "Standard friction: a review screen before every order". */
export function frictionLine(c: TradingConfig): string {
  if (c.friction_assignment === "per_player") return `Friction: ${frictionLabel(c).toLowerCase()}`;
  const custom = Object.keys(overridesFrom(c.friction_profile, knobsFor(c))).length > 0;
  return `${FRICTION_PROFILE_TEXT[c.friction_profile].label} friction${custom ? ", customized" : ""}: ${frictionSummary(
    knobsFor(c),
  )[0].toLowerCase()}`;
}
