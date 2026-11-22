// The section's round clock: what a round covers, how a game date reads, and
// how long trading has left. Pure. MIRRORS _trading_period_range and
// _trading_label in supabase/migrations/0033_trading_rpcs.sql.
//
// Game dates never carry the real year. The server sends each date as a
// GameLabel [game_day, year, month, day]:
//   game_day  calendar days from Jan 1 of Year 1 (negative before it)
//   year      "Year N": Year 1 is the first game year, and there is no Year 0,
//             so the year before Year 1 is Year -1

import type { TradingPeriod } from "../game/types";
import { fromDayKey, toDayKey, type DayKey } from "./data/normalize";

export type GameLabel = [number, number, number, number];

export const PERIODS: readonly TradingPeriod[] = ["year", "half", "quarter", "month", "week"];

const MONTHS_PER: Record<Exclude<TradingPeriod, "week">, number> = {
  year: 12,
  half: 6,
  quarter: 3,
  month: 1,
};

/** Add whole months to a UTC date, clamping the day like Postgres does. */
function addMonths(y: number, m0: number, d: number, months: number): Date {
  const total = m0 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last)));
}

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

/**
 * The calendar days round `round` covers, inclusive, counted from Jan 1 of
 * the start year: 12/6/3/1 months per round, or 7 days for weekly rounds.
 */
export function periodRange(
  startYear: number,
  period: TradingPeriod,
  round: number,
): { from: string; to: string; fromDay: DayKey; toDay: DayKey } {
  let from: string;
  let to: string;
  if (period === "week") {
    const jan1 = toDayKey(`${startYear}-01-01`);
    from = fromDayKey(jan1 + (round - 1) * 7);
    to = fromDayKey(jan1 + round * 7 - 1);
  } else {
    const n = MONTHS_PER[period];
    from = iso(addMonths(startYear, 0, 1, (round - 1) * n));
    to = fromDayKey(toDayKey(iso(addMonths(startYear, 0, 1, round * n))) - 1);
  }
  return { from, to, fromDay: toDayKey(from), toDay: toDayKey(to) };
}

/** [game_day, year, month, day] for a real day key. The server's view of a date. */
export function gameLabel(startYear: number, day: DayKey): GameLabel {
  const [y, m, d] = fromDayKey(day).split("-").map(Number);
  const rel = y - startYear + (y >= startYear ? 1 : 0);
  return [day - toDayKey(`${startYear}-01-01`), rel, m, d];
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Year 3 · Mar 14", "Year −2 · Jun 3" (a true minus sign, like every signed figure). */
export function formatGameDate(label: GameLabel): string {
  const [, y, m, d] = label;
  return `Year ${y < 0 ? `−${-y}` : y} · ${MONTH_ABBR[m - 1]} ${d}`;
}

/** "Year 3 · Mar" (a month without a day, for headlines). */
export function formatGameMonth(y: number, m: number): string {
  return `Year ${y < 0 ? `−${-y}` : y} · ${MONTH_ABBR[m - 1]}`;
}

const NOUN: Record<TradingPeriod, string> = {
  year: "Year",
  half: "Half",
  quarter: "Quarter",
  month: "Month",
  week: "Week",
};

/** What one round is called: "Quarter", "Year" … */
export function periodNoun(period: TradingPeriod): string {
  return NOUN[period];
}

const PLURAL: Record<TradingPeriod, string> = {
  year: "years",
  half: "halves",
  quarter: "quarters",
  month: "months",
  week: "weeks",
};

/** Several rounds, in running text: "quarters", "halves" … */
export function periodPlural(period: TradingPeriod): string {
  return PLURAL[period];
}

/** "Quarter 7 of 25". */
export function roundLabel(period: TradingPeriod, round: number, total: number): string {
  return `${NOUN[period]} ${round} of ${total}`;
}

/**
 * The months a round covers, in game time: "Year 2 · Apr–Jun", "Year 1 · Mar".
 * Pure arithmetic from Jan 1 of Year 1, so it needs no real year. Null for
 * yearly rounds ("Year 3 of 25" already says it) and weekly ones (a week's
 * month depends on the real calendar).
 */
export function periodSpan(period: TradingPeriod, round: number): string | null {
  if (period === "week" || period === "year" || round < 1) return null;
  const n = MONTHS_PER[period];
  const first = (round - 1) * n;
  const m0 = first % 12;
  const months = n === 1 ? MONTH_ABBR[m0] : `${MONTH_ABBR[m0]}–${MONTH_ABBR[m0 + n - 1]}`;
  return `Year ${Math.floor(first / 12) + 1} · ${months}`;
}

/** Total market time a session covers: "6.25 years", "25 weeks". */
export function windowLength(period: TradingPeriod, rounds: number): string {
  if (period === "week") return `${rounds} week${rounds === 1 ? "" : "s"}`;
  const years = (rounds * MONTHS_PER[period]) / 12;
  if (years < 1) {
    const months = rounds * MONTHS_PER[period];
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const text = Number.isInteger(years) ? String(years) : years.toFixed(2).replace(/0$/, "");
  return `${text} year${years === 1 ? "" : "s"}`;
}

/** Whole seconds of trading left (0 once closed; null when the round has no deadline). */
export function secondsLeft(closesAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!closesAt) return null;
  const t = Date.parse(closesAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 1000));
}

/** "1:05", "0:09". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
