// The end-of-game reveal (get_trading_reveal, 0036), in words and rows: the
// trades on the real calendar, the result against buying and holding the index
// fund, and the class's turnover against return with its Barber & Odean
// takeaway. Pure; every number comes from the server.

import { toCsv } from "../../game/csv";
import type { TradingPeriod } from "../../game/types";
import type { RevealClassRow, RevealFill, TradingReveal } from "../db";
import { returnText } from "../format";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
};

/** "Oct 19, 1987" */
export function realDateText(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Oct 1987" from "1987-10" */
export function monthText(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * A period's real span: "1990" (a year), "Jan–Mar 1990" (6 months, a quarter),
 * "Mar 1990" (a month), "Mar 5–9, 1990" (a week); spans across a new year
 * name both years.
 */
export function periodSpanText(
  first: string,
  last: string,
  period: TradingPeriod,
): string {
  const a = parts(first);
  const b = parts(last);
  if (period === "year") return a.y === b.y ? `${a.y}` : `${a.y}–${b.y}`;
  if (period === "month") return `${MONTHS[a.m - 1]} ${a.y}`;
  if (period === "week") {
    if (a.y !== b.y)
      return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
    if (a.m !== b.m)
      return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
    return `${MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  }
  if (a.y !== b.y)
    return `${MONTHS[a.m - 1]} ${a.y} – ${MONTHS[b.m - 1]} ${b.y}`;
  return `${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]} ${a.y}`;
}

// ---- dates in the reveal: the real calendar, or game time ---------------------------

const relYear = (startYear: number, y: number) =>
  y - startYear + (y >= startYear ? 1 : 0);
const yearWord = (n: number) => `Year ${n < 0 ? `−${-n}` : n}`;

/**
 * A period's span in game time, for the simulated market, whose calendar
 * years mean nothing: "Year 3", "Year 2 · Apr–Jun", "Year 2 · Mar",
 * "Year 2 · Mar 5–9"; spans across a new year name both years.
 */
export function gameSpanText(
  first: string,
  last: string,
  period: TradingPeriod,
  startYear: number,
): string {
  const a = parts(first);
  const b = parts(last);
  const ya = yearWord(relYear(startYear, a.y));
  const yb = yearWord(relYear(startYear, b.y));
  if (period === "year") return a.y === b.y ? ya : `${ya} – ${yb}`;
  if (period === "month") return `${ya} · ${MONTHS[a.m - 1]}`;
  if (period === "week") {
    if (a.y !== b.y)
      return `${ya} · ${MONTHS[a.m - 1]} ${a.d} – ${yb} · ${MONTHS[b.m - 1]} ${b.d}`;
    if (a.m !== b.m)
      return `${ya} · ${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}`;
    return `${ya} · ${MONTHS[a.m - 1]} ${a.d}–${b.d}`;
  }
  if (a.y !== b.y)
    return `${ya} · ${MONTHS[a.m - 1]} – ${yb} · ${MONTHS[b.m - 1]}`;
  return `${ya} · ${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]}`;
}

/** How the reveal names a day, a month and a period. */
export interface RevealCalendar {
  date(iso: string): string;
  month(ym: string): string;
  span(first: string, last: string, period: TradingPeriod): string;
}

export const REAL_CALENDAR: RevealCalendar = {
  date: realDateText,
  month: monthText,
  span: periodSpanText,
};

/** Game time, Year 1 being `startYear`: "Year 3 · Mar 14", "Year 3 · Mar". */
export function gameCalendar(startYear: number): RevealCalendar {
  return {
    date: (iso) => {
      const { y, m, d } = parts(iso);
      return `${yearWord(relYear(startYear, y))} · ${MONTHS[m - 1]} ${d}`;
    },
    month: (ym) => {
      const [y, m] = ym.split("-").map(Number);
      return `${yearWord(relYear(startYear, y))} · ${MONTHS[m - 1]}`;
    },
    span: (first, last, period) => gameSpanText(first, last, period, startYear),
  };
}

/** The real calendar for real history; game time for the simulated market. */
export function revealCalendar(
  r: Pick<TradingReveal, "start_year">,
  simulated: boolean,
): RevealCalendar {
  return simulated ? gameCalendar(r.start_year) : REAL_CALENDAR;
}

/** "1987–1993": the years the game played. */
export function eraText(
  r: Pick<
    TradingReveal,
    "window_first_date" | "played_last_date" | "window_last_date"
  >,
): string {
  const a = r.window_first_date.slice(0, 4);
  const b = (r.played_last_date ?? r.window_last_date).slice(0, 4);
  return a === b ? a : `${a}–${b}`;
}

const VERB: Record<RevealFill["side"], string> = {
  buy: "Bought",
  sell: "Sold",
  sell_short: "Shorted",
  buy_to_cover: "Covered",
};

const dollars = (n: number) =>
  `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

/**
 * One fill in words, by dollar amount (per-share prices were rescaled for the
 * game, so they would mislead beside a real name): "Bought $5,000 of Apple
 * (AAPL)", "Margin call: sold $2,310 of IBM". A simulated market has no real
 * names, so `simulated` uses the ones the class traded under.
 */
export function fillText(
  f: RevealFill,
  inst:
    | { real_name: string; real_ticker: string; name?: string; ticker?: string }
    | undefined,
  simulated = false,
): string {
  const what = !inst
    ? `slot ${f.slot}`
    : simulated && inst.name
      ? `${inst.name} (${inst.ticker})`
      : `${inst.real_name} (${inst.real_ticker})`;
  const amount = dollars(f.notional);
  if (f.reason === "margin_call")
    return `Margin call: ${VERB[f.side].toLowerCase()} ${amount} of ${what}`;
  if (f.reason === "delisting") return `Delisted: ${amount} of ${what} settled`;
  return `${VERB[f.side]} ${amount} of ${what}`;
}

export interface TimelinePeriod {
  round: number;
  span: string;
  indexReturn: number | null;
  headlines: { month: string; text: string }[];
  fills: RevealFill[];
}

/**
 * The student's trades on the real timeline (or in game time, `cal`), period
 * by period, beside that period's headlines (the top one of each month: the
 * server sends two, best first). Periods with neither are left out unless `all`.
 */
export function revealTimeline(
  r: TradingReveal,
  period: TradingPeriod,
  all = false,
  cal: RevealCalendar = REAL_CALENDAR,
): TimelinePeriod[] {
  const byRound = new Map<number, RevealFill[]>();
  for (const f of r.my_fills) {
    if (!byRound.has(f.round)) byRound.set(f.round, []);
    byRound.get(f.round)!.push(f);
  }
  return r.periods
    .map((p) => ({
      round: p.round,
      span: cal.span(p.first_date, p.last_date, period),
      indexReturn: p.index_return == null ? null : Number(p.index_return),
      headlines: p.headlines.filter(
        (h, i, all) => all.findIndex((o) => o.month === h.month) === i,
      ),
      fills: byRound.get(p.round) ?? [],
    }))
    .filter((p) => all || p.fills.length > 0 || p.headlines.length > 0);
}

/** "You beat buying and holding the index fund by 4.2 points." */
export function vsIndexText(
  myReturn: number,
  indexReturn: number | null,
): string | null {
  if (indexReturn == null) return null;
  const gap = (myReturn - indexReturn) * 100;
  if (Math.abs(gap) < 0.05)
    return "You matched buying and holding the index fund.";
  return `You ${gap > 0 ? "beat" : "trailed"} buying and holding the index fund by ${Math.abs(gap).toFixed(1)} points.`;
}

// ---- the class: turnover against return ------------------------------------------

export interface ClassPoint {
  turnover: number;
  ret: number;
  me: boolean;
  name: string | null;
  id: string | null;
}

export function classPoints(rows: readonly RevealClassRow[]): ClassPoint[] {
  return rows.map((c) => ({
    turnover: Math.max(0, Number(c.turnover)),
    ret: Number(c.return),
    me: c.is_me,
    name: c.name,
    id: c.player_id,
  }));
}

export interface Takeaway {
  /** the one line under the chart */
  verdict: string;
  /** the figures behind it, for the line below */
  detail: string | null;
  /** "fifth" or "half": how the busiest and quietest groups were cut */
  group: "fifth" | "half" | null;
  busiest: number | null;
  quietest: number | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Barber & Odean (2000): the fifth of households that traded most earned 11.4%
 * a year against the market's 17.9%. The class's version: the mean return of
 * its busiest traders (by turnover) against its quietest, a fifth each from
 * ten students, a half each from four.
 */
export function turnoverTakeaway(
  points: readonly ClassPoint[],
  indexReturn: number | null,
): Takeaway {
  const n = points.length;
  const none: Takeaway = {
    verdict: "",
    detail: null,
    group: null,
    busiest: null,
    quietest: null,
  };
  if (n < 4)
    return {
      ...none,
      verdict:
        "Too few students to compare the busiest traders with the quietest.",
    };
  const sorted = [...points].sort((a, b) => b.turnover - a.turnover);
  if (sorted[0].turnover - sorted[n - 1].turnover < 1e-9) {
    return {
      ...none,
      verdict:
        "Everyone traded the same amount, so there is nothing to compare.",
    };
  }
  const group = n >= 10 ? "fifth" : "half";
  const k =
    group === "fifth" ? Math.max(1, Math.round(n / 5)) : Math.floor(n / 2);
  const busiest = mean(sorted.slice(0, k).map((p) => p.ret));
  const quietest = mean(sorted.slice(n - k).map((p) => p.ret));
  const gap = busiest - quietest;
  const verdict =
    gap < -0.0005
      ? "Like Barber and Odean's households, the class's busiest traders earned less."
      : gap > 0.0005
        ? "Unlike Barber and Odean's households, the busiest traders came out ahead this time."
        : "Trading more made no difference this time.";
  const detail =
    `Busiest ${group}: ${returnText(busiest, 1)} · quietest ${group}: ${returnText(quietest, 1)}` +
    (indexReturn != null ? ` · index fund: ${returnText(indexReturn, 1)}` : "");
  return { verdict, detail, group, busiest, quietest };
}

// ---- the host's CSV ------------------------------------------------------------

/** One row per student, by final value (ties share a rank). Names are the class's own. */
export function revealCsv(r: TradingReveal): string {
  const header = [
    "rank",
    "name",
    "final_value",
    "return",
    "turnover",
    "sharpe",
    "max_drawdown",
    "trades",
  ];
  let rank = 0;
  let prev: number | null = null;
  const rows = r.class.map((c, i) => {
    if (prev == null || Number(c.nlv) !== prev) rank = i + 1;
    prev = Number(c.nlv);
    return [
      rank,
      c.name ?? "",
      Number(Number(c.nlv).toFixed(2)),
      Number(Number(c.return).toFixed(6)),
      Number(Number(c.turnover).toFixed(4)),
      c.sharpe == null ? "" : Number(Number(c.sharpe).toFixed(4)),
      Number(Number(c.max_drawdown).toFixed(6)),
      Number(c.trades),
    ];
  });
  return toCsv([header, ...rows]);
}

export const revealFileName = (joinCode: string) =>
  `sharpesim-trading-${joinCode}.csv`;
