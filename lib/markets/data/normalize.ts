// Vendor output -> the one internal market-data format. Pure: no I/O, no vendor
// knowledge beyond the Source* shapes in price-source.ts. The importer writes
// what this returns to data/normalized/; the loader (Phase 2) reads it back.
//
// Internal conventions, relied on everywhere downstream:
//   * Dates are DAY KEYS: whole calendar days since 1962-01-01 (UTC). They are
//     small ints, sort like dates, and carry no time zone.
//   * Prices and dividends are SPLIT-ADJUSTED and NOT dividend-adjusted.
//     Dividends stay separate cash events, because the game pays them as cash.
//   * A bar the vendor only has a close for is flagged closeOnly, with
//     open = high = low = close, so fill rules can fall back to the close.

import type {
  DelistingType,
  SourceDividend,
  SourceSecurity,
  SourceSplit,
} from "./price-source";

export const DAY_KEY_EPOCH = "1962-01-01";
const EPOCH_MS = Date.UTC(1962, 0, 1);
const DAY_MS = 86_400_000;

export type DayKey = number;

export type InstrumentKind = "equity" | "index_fund";

export interface NormalizedBar {
  day: DayKey;
  o: number;
  h: number;
  l: number;
  c: number;
  closeOnly: boolean;
}

export interface NormalizedDividend {
  exDay: DayKey;
  /** cash per split-adjusted share */
  amount: number;
}

export interface NormalizedSplit {
  day: DayKey;
  /** new shares per old share; informational only, the bars are already adjusted */
  ratio: number;
}

export interface NormalizedDelisting {
  day: DayKey;
  type: DelistingType;
  /** per split-adjusted share, see SourceDelisting.value */
  value: number;
}

export interface NormalizedSecurity {
  /** our stable id for this history, e.g. "IBM" */
  key: string;
  /** the vendor that produced it, e.g. "yahoo" */
  source: string;
  kind: InstrumentKind;
  name: string;
  sector: string;
  bars: NormalizedBar[];
  dividends: NormalizedDividend[];
  splits: NormalizedSplit[];
  delisting: NormalizedDelisting | null;
  marketCap: { day: DayKey; value: number }[];
  /** everything the normalizer repaired or dropped, for the import report */
  warnings: string[];
}

export interface SecurityMeta {
  key: string;
  source: string;
  kind: InstrumentKind;
  name: string;
  sector: string;
}

// ---------------------------------------------------------------------------
// Day keys
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "1962-01-02" -> 1. Throws on anything that is not a real calendar date. */
export function toDayKey(iso: string): DayKey {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new Error(`not a calendar date: ${iso}`);
  }
  return Math.round((ms - EPOCH_MS) / DAY_MS);
}

/** 1 -> "1962-01-02". */
export function fromDayKey(day: DayKey): string {
  return new Date(EPOCH_MS + day * DAY_MS).toISOString().slice(0, 10);
}

/** The calendar year of a day key. */
export function yearOfDayKey(day: DayKey): number {
  return new Date(EPOCH_MS + day * DAY_MS).getUTCFullYear();
}

// ---------------------------------------------------------------------------
// Securities
// ---------------------------------------------------------------------------

/**
 * A daily move bigger than this (either way) with no split on that day is
 * flagged: it is usually an unadjusted split or a bad tick. Flagged, not fixed;
 * a real crash can do it too.
 */
const JUMP_FACTOR = 3;

const positive = (x: number | null | undefined): x is number =>
  typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * Cumulative split factor in effect for a date: the product of every split
 * AFTER it. Dividing a raw price by it gives the split-adjusted price.
 */
function splitFactorAfter(day: DayKey, splits: NormalizedSplit[]): number {
  let f = 1;
  for (const s of splits) if (s.day > day) f *= s.ratio;
  return f;
}

function normalizeSplits(raw: SourceSplit[], warnings: string[]): NormalizedSplit[] {
  const out: NormalizedSplit[] = [];
  for (const s of raw) {
    if (!positive(s.ratio)) {
      warnings.push(`dropped split with bad ratio on ${s.date}`);
      continue;
    }
    out.push({ day: toDayKey(s.date), ratio: s.ratio });
  }
  out.sort((a, b) => a.day - b.day);
  return out;
}

function normalizeDividends(
  raw: SourceDividend[],
  adjusted: boolean,
  splits: NormalizedSplit[],
  firstDay: DayKey,
  lastDay: DayKey,
  warnings: string[],
): NormalizedDividend[] {
  const byDay = new Map<DayKey, number>();
  for (const d of raw) {
    if (!positive(d.amount)) {
      warnings.push(`dropped dividend with bad amount on ${d.exDate}`);
      continue;
    }
    const day = toDayKey(d.exDate);
    if (day < firstDay || day > lastDay) {
      warnings.push(`dropped dividend outside the bar range on ${d.exDate}`);
      continue;
    }
    const amount = adjusted ? d.amount : d.amount / splitFactorAfter(day, splits);
    const prev = byDay.get(day);
    if (prev !== undefined) {
      if (Math.abs(prev - amount) < 1e-9) continue; // a duplicate row
      warnings.push(`two dividends on ${d.exDate}; summed`);
      byDay.set(day, prev + amount);
    } else {
      byDay.set(day, amount);
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([exDay, amount]) => ({ exDay, amount }));
}

export function normalizeSecurity(src: SourceSecurity, meta: SecurityMeta): NormalizedSecurity {
  const warnings: string[] = [];
  const splits = normalizeSplits(src.splits, warnings);

  // Bars: drop unusable rows, sort, dedupe (the later row for a date wins).
  const byDay = new Map<DayKey, NormalizedBar>();
  let dropped = 0;
  let repaired = 0;
  let closeOnly = 0;
  for (const b of src.bars) {
    if (!positive(b.close)) {
      dropped++;
      continue;
    }
    const day = toDayKey(b.date);
    const f = src.barsSplitAdjusted ? 1 : splitFactorAfter(day, splits);
    const c = b.close / f;
    let bar: NormalizedBar;
    if (positive(b.open) && positive(b.high) && positive(b.low)) {
      const o = b.open / f;
      let h = b.high / f;
      let l = b.low / f;
      if (h < Math.max(o, c) || l > Math.min(o, c) || h < l) {
        h = Math.max(h, l, o, c);
        l = Math.min(l, o, c);
        repaired++;
      }
      bar = { day, o, h, l, c, closeOnly: false };
    } else {
      bar = { day, o: c, h: c, l: c, c, closeOnly: true };
      closeOnly++;
    }
    byDay.set(day, bar);
  }
  const bars = [...byDay.values()].sort((a, b) => a.day - b.day);
  if (dropped) warnings.push(`dropped ${dropped} bar(s) with no usable close`);
  if (repaired) warnings.push(`repaired ${repaired} bar(s) whose high/low did not contain open/close`);
  if (closeOnly) warnings.push(`${closeOnly} close-only bar(s)`);
  if (src.bars.length - dropped !== bars.length) {
    warnings.push(`merged ${src.bars.length - dropped - bars.length} duplicate date(s)`);
  }

  const splitDays = new Set(splits.map((s) => s.day));
  for (let i = 1; i < bars.length; i++) {
    const r = bars[i].c / bars[i - 1].c;
    if ((r > JUMP_FACTOR || r < 1 / JUMP_FACTOR) && !splitDays.has(bars[i].day)) {
      warnings.push(
        `close moved ×${r.toFixed(2)} on ${fromDayKey(bars[i].day)} with no split: check it`,
      );
    }
  }

  const firstDay = bars.length ? bars[0].day : 0;
  const lastDay = bars.length ? bars[bars.length - 1].day : 0;
  const dividends = bars.length
    ? normalizeDividends(src.dividends, src.dividendsSplitAdjusted, splits, firstDay, lastDay, warnings)
    : [];

  let delisting: NormalizedDelisting | null = null;
  if (src.delisting) {
    const day = toDayKey(src.delisting.date);
    if (!(src.delisting.value >= 0) || !Number.isFinite(src.delisting.value)) {
      warnings.push(`delisting value must be >= 0; ignored`);
    } else {
      if (bars.length && day < lastDay) {
        warnings.push(
          `delisting on ${src.delisting.date} is before the last bar (${fromDayKey(lastDay)})`,
        );
      }
      const f = src.barsSplitAdjusted ? 1 : splitFactorAfter(day, splits);
      delisting = { day, type: src.delisting.type, value: src.delisting.value / f };
    }
  }

  const marketCap = (src.marketCap ?? [])
    .filter((m) => positive(m.value))
    .map((m) => ({ day: toDayKey(m.date), value: m.value }))
    .sort((a, b) => a.day - b.day);

  if (!bars.length) warnings.push("no usable bars");

  return {
    key: meta.key,
    source: meta.source,
    kind: meta.kind,
    name: meta.name,
    sector: meta.sector,
    bars,
    dividends,
    splits,
    delisting,
    marketCap,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Rates and the market index
// ---------------------------------------------------------------------------

export interface NormalizedRatePoint {
  day: DayKey;
  /** annual rate as a decimal (0.05 = 5%/yr), as published (discount basis for DTB3) */
  rate: number;
}

/** Percent -> decimal, missing observations dropped (lookups carry the last value forward). */
export function normalizeShortRate(
  points: { date: string; percent: number | null }[],
): NormalizedRatePoint[] {
  const byDay = new Map<DayKey, number>();
  for (const p of points) {
    if (p.percent === null || !Number.isFinite(p.percent)) continue;
    byDay.set(toDayKey(p.date), p.percent / 100);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, rate]) => ({ day, rate }));
}

/** The rate in force on `day`: the latest observation at or before it, else null. */
export function rateOn(series: NormalizedRatePoint[], day: DayKey): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].day <= day) {
      found = series[mid].rate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Trading days per year, for turning an annual fee into a daily drag. */
export const TRADING_DAYS_PER_YEAR = 252;

/**
 * Daily total returns -> an index fund priced like a stock. Its level starts at
 * 1 on the day before the first return and compounds each return, less the
 * fund's annual fee spread evenly over trading days. Total return, so it pays no
 * separate dividends. Bars are close-only (one level per day).
 */
export function indexFundFromReturns(
  points: { date: string; ret: number }[],
  meta: Omit<SecurityMeta, "kind">,
  annualFee = 0.0005,
): NormalizedSecurity {
  const warnings: string[] = [];
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.ret) && p.ret > -1)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length !== points.length) {
    warnings.push(`dropped ${points.length - sorted.length} unusable return(s)`);
  }
  const drag = Math.pow(1 - annualFee, 1 / TRADING_DAYS_PER_YEAR);
  let level = 1;
  const bars: NormalizedBar[] = [];
  let lastDay = -Infinity;
  for (const p of sorted) {
    const day = toDayKey(p.date);
    if (day === lastDay) {
      warnings.push(`duplicate return on ${p.date}; kept the first`);
      continue;
    }
    lastDay = day;
    level = level * (1 + p.ret) * drag;
    bars.push({ day, o: level, h: level, l: level, c: level, closeOnly: true });
  }
  return {
    key: meta.key,
    source: meta.source,
    kind: "index_fund",
    name: meta.name,
    sector: meta.sector,
    bars,
    dividends: [],
    splits: [],
    delisting: null,
    marketCap: [],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** First and last bar days, or null for an empty history. */
export function coverage(sec: NormalizedSecurity): { first: DayKey; last: DayKey } | null {
  if (!sec.bars.length) return null;
  return { first: sec.bars[0].day, last: sec.bars[sec.bars.length - 1].day };
}
