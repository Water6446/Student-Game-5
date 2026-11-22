// Synthetic market data for tests and size measurement. Deterministic (seeded),
// shaped like a vendor's output (SourceSecurity), and covering what a free dev
// source cannot: bankruptcies, cash acquisitions and stock mergers. Never
// mistaken for real data: every key starts with "SYN".

import type { SourceBar, SourceDelisting, SourceSecurity, SourceSplit } from "./price-source";

/** mulberry32: a small, fast, seedable PRNG. Returns floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, from a uniform source. */
export function normalFrom(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Every Monday-Friday from `from` to `to` inclusive (no holidays: synthetic). */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface SyntheticSpec {
  symbol: string;
  from: string;
  to: string;
  startPrice: number;
  /** annual drift and volatility of the log price */
  drift?: number;
  vol?: number;
  seed: number;
  /** quarterly dividend yield per year (0.03 = 3%/yr); 0 = none */
  dividendYield?: number;
  /** splits; with `raw: true` the bars are emitted UNADJUSTED around them */
  splits?: SourceSplit[];
  raw?: boolean;
  /** every k-th bar is emitted close-only */
  closeOnlyEvery?: number;
  /** the history stops at this date and the security delists */
  delisting?: SourceDelisting;
}

/**
 * A geometric-random-walk price history with plausible daily ranges, optional
 * quarterly dividends, splits and a delisting. Prices are split-adjusted unless
 * `raw`, in which case they are what a raw (unadjusted) vendor would send.
 */
export function syntheticSecurity(spec: SyntheticSpec): SourceSecurity {
  const rand = seededRandom(spec.seed);
  const drift = spec.drift ?? 0.07;
  const vol = spec.vol ?? 0.25;
  const dt = 1 / 252;
  const end = spec.delisting ? spec.delisting.date : spec.to;
  const dates = weekdays(spec.from, end);
  const splits = [...(spec.splits ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const factorAfter = (date: string) =>
    splits.reduce((f, s) => (s.date > date ? f * s.ratio : f), 1);

  const bars: SourceBar[] = [];
  const dividends: SourceSecurity["dividends"] = [];
  let price = spec.startPrice;
  dates.forEach((date, i) => {
    const prevClose = price;
    price = prevClose * Math.exp((drift - (vol * vol) / 2) * dt + vol * Math.sqrt(dt) * normalFrom(rand));
    const open = prevClose * Math.exp(0.3 * vol * Math.sqrt(dt) * normalFrom(rand));
    const range = Math.abs(normalFrom(rand)) * vol * Math.sqrt(dt) * 0.8;
    const high = Math.max(open, price) * (1 + range);
    const low = Math.min(open, price) * (1 - range);
    const f = spec.raw ? factorAfter(date) : 1;
    const closeOnly = spec.closeOnlyEvery ? i % spec.closeOnlyEvery === spec.closeOnlyEvery - 1 : false;
    bars.push({
      date,
      open: closeOnly ? null : open * f,
      high: closeOnly ? null : high * f,
      low: closeOnly ? null : low * f,
      close: price * f,
    });
    // a quarterly dividend on the first weekday of Feb/May/Aug/Nov
    if (spec.dividendYield && i > 0 && date.slice(5, 7) !== dates[i - 1].slice(5, 7)) {
      const m = Number(date.slice(5, 7));
      if (m % 3 === 2) {
        dividends.push({ exDate: date, amount: ((price * spec.dividendYield) / 4) * f });
      }
    }
  });

  return {
    symbol: spec.symbol,
    name: `Synthetic ${spec.symbol}`,
    bars,
    barsSplitAdjusted: !spec.raw,
    dividends,
    dividendsSplitAdjusted: !spec.raw,
    splits,
    delisting: spec.delisting ?? null,
  };
}

/** The three delisting paths the engine must support, as small fixtures. */
export function delistingFixtures(): Record<"bankruptcy" | "cashAcquisition" | "stockMerger", SourceSecurity> {
  return {
    bankruptcy: syntheticSecurity({
      symbol: "SYNBK",
      from: "1980-01-01",
      to: "1985-12-31",
      startPrice: 40,
      drift: -0.6,
      vol: 0.5,
      seed: 11,
      delisting: { date: "1983-06-30", type: "bankruptcy", value: 0 },
    }),
    cashAcquisition: syntheticSecurity({
      symbol: "SYNCA",
      from: "1980-01-01",
      to: "1985-12-31",
      startPrice: 25,
      seed: 12,
      dividendYield: 0.03,
      delisting: { date: "1982-03-31", type: "cash_acquisition", value: 31.5 },
    }),
    stockMerger: syntheticSecurity({
      symbol: "SYNSM",
      from: "1980-01-01",
      to: "1985-12-31",
      startPrice: 60,
      seed: 13,
      delisting: { date: "1984-09-28", type: "stock_merger", value: 58.25 },
    }),
  };
}
