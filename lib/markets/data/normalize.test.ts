import { describe, expect, it } from "vitest";
import {
  coverage,
  fromDayKey,
  indexFundFromReturns,
  normalizeSecurity,
  normalizeShortRate,
  rateOn,
  toDayKey,
  yearOfDayKey,
} from "./normalize";
import { delistingFixtures, syntheticSecurity } from "./fixtures";
import type { SourceSecurity } from "./price-source";

const META = { key: "T1", source: "fixture", kind: "equity" as const, name: "Test", sector: "Industrials" };

const raw = (over: Partial<SourceSecurity>): SourceSecurity => ({
  symbol: "T1",
  bars: [],
  barsSplitAdjusted: true,
  dividends: [],
  dividendsSplitAdjusted: true,
  splits: [],
  ...over,
});

describe("day keys", () => {
  it("counts calendar days from 1962-01-01", () => {
    expect(toDayKey("1962-01-01")).toBe(0);
    expect(toDayKey("1962-01-02")).toBe(1);
    expect(toDayKey("1963-01-01")).toBe(365);
    expect(toDayKey("1961-12-31")).toBe(-1);
  });

  it("round-trips and handles leap days", () => {
    for (const d of ["1964-02-29", "1999-12-31", "2000-02-29", "2026-11-19"]) {
      expect(fromDayKey(toDayKey(d))).toBe(d);
    }
    expect(yearOfDayKey(toDayKey("1987-10-19"))).toBe(1987);
  });

  it("rejects non-dates", () => {
    expect(() => toDayKey("1999-02-30")).toThrow();
    expect(() => toDayKey("19990101")).toThrow();
  });
});

describe("normalizeSecurity", () => {
  it("sorts, dedupes and drops bars with no usable close", () => {
    const sec = normalizeSecurity(
      raw({
        bars: [
          { date: "1990-01-03", open: 10, high: 11, low: 9, close: 10.5 },
          { date: "1990-01-02", open: 9, high: 10, low: 8.5, close: 9.5 },
          { date: "1990-01-03", open: 10, high: 12, low: 9, close: 11 },
          { date: "1990-01-04", open: 10, high: 12, low: 9, close: null },
          { date: "1990-01-05", open: 10, high: 12, low: 9, close: 0 },
        ],
      }),
      META,
    );
    expect(sec.bars.map((b) => fromDayKey(b.day))).toEqual(["1990-01-02", "1990-01-03"]);
    expect(sec.bars[1].c).toBe(11); // the later duplicate wins
    expect(sec.warnings.join(" ")).toMatch(/dropped 2 bar/);
  });

  it("marks close-only bars and flattens them", () => {
    const sec = normalizeSecurity(
      raw({ bars: [{ date: "1970-06-01", open: null, high: null, low: null, close: 20 }] }),
      META,
    );
    expect(sec.bars[0]).toMatchObject({ o: 20, h: 20, l: 20, c: 20, closeOnly: true });
  });

  it("repairs a high/low that does not contain the open and close", () => {
    const sec = normalizeSecurity(
      raw({ bars: [{ date: "1970-06-01", open: 10, high: 10.5, low: 9.8, close: 11 }] }),
      META,
    );
    expect(sec.bars[0].h).toBe(11);
    expect(sec.bars[0].l).toBe(9.8);
    expect(sec.warnings.join(" ")).toMatch(/repaired 1/);
  });

  it("split-adjusts raw bars and dividends", () => {
    const sec = normalizeSecurity(
      raw({
        barsSplitAdjusted: false,
        dividendsSplitAdjusted: false,
        splits: [{ date: "2000-01-04", ratio: 2 }],
        bars: [
          { date: "2000-01-03", open: 100, high: 102, low: 98, close: 100 },
          { date: "2000-01-04", open: 50, high: 51, low: 49, close: 50.5 },
        ],
        dividends: [{ exDate: "2000-01-03", amount: 1 }],
      }),
      META,
    );
    expect(sec.bars[0].c).toBe(50);
    expect(sec.bars[0].h).toBe(51);
    expect(sec.bars[1].c).toBe(50.5);
    expect(sec.dividends).toEqual([{ exDay: toDayKey("2000-01-03"), amount: 0.5 }]);
    expect(sec.warnings.join(" ")).not.toMatch(/no split/);
  });

  it("flags a jump with no split instead of hiding it", () => {
    const sec = normalizeSecurity(
      raw({
        bars: [
          { date: "2000-01-03", open: 100, high: 101, low: 99, close: 100 },
          { date: "2000-01-04", open: 25, high: 26, low: 24, close: 25 },
        ],
      }),
      META,
    );
    expect(sec.warnings.join(" ")).toMatch(/×0\.25 on 2000-01-04 with no split/);
  });

  it("keeps dividends in range, merges duplicates and sums distinct same-day ones", () => {
    const sec = normalizeSecurity(
      raw({
        bars: [
          { date: "1990-01-02", open: 9, high: 10, low: 8.5, close: 9.5 },
          { date: "1990-06-01", open: 9, high: 10, low: 8.5, close: 9.5 },
        ],
        dividends: [
          { exDate: "1990-03-01", amount: 0.2 },
          { exDate: "1990-03-01", amount: 0.2 },
          { exDate: "1990-04-02", amount: 0.1 },
          { exDate: "1990-04-02", amount: 0.05 },
          { exDate: "1989-01-02", amount: 0.3 },
          { exDate: "1990-05-01", amount: -1 },
        ],
      }),
      META,
    );
    expect(sec.dividends.map((d) => [fromDayKey(d.exDay), +d.amount.toFixed(6)])).toEqual([
      ["1990-03-01", 0.2],
      ["1990-04-02", 0.15],
    ]);
  });

  it("carries each delisting type through, adjusted with the bars", () => {
    const f = delistingFixtures();
    for (const [name, src] of Object.entries(f)) {
      const sec = normalizeSecurity(src, { ...META, key: src.symbol });
      expect(sec.delisting, name).not.toBeNull();
      expect(sec.delisting!.type).toBe(src.delisting!.type);
      expect(sec.delisting!.value).toBe(src.delisting!.value);
      expect(fromDayKey(coverage(sec)!.last) <= src.delisting!.date).toBe(true);
      expect(sec.warnings.join(" ")).not.toMatch(/before the last bar/);
    }
  });

  it("warns when a delisting predates the last bar", () => {
    const sec = normalizeSecurity(
      raw({
        bars: [
          { date: "1990-01-02", open: 9, high: 10, low: 8.5, close: 9.5 },
          { date: "1990-06-01", open: 9, high: 10, low: 8.5, close: 9.5 },
        ],
        delisting: { date: "1990-03-01", type: "bankruptcy", value: 0 },
      }),
      META,
    );
    expect(sec.warnings.join(" ")).toMatch(/before the last bar/);
  });

  it("normalizes a long raw synthetic history to the adjusted one", () => {
    const spec = {
      symbol: "SYNX",
      from: "1980-01-01",
      to: "1989-12-31",
      startPrice: 30,
      seed: 99,
      dividendYield: 0.03,
      splits: [
        { date: "1983-05-02", ratio: 2 },
        { date: "1987-03-02", ratio: 3 },
      ],
    };
    const adjusted = normalizeSecurity(syntheticSecurity(spec), META);
    const fromRaw = normalizeSecurity(syntheticSecurity({ ...spec, raw: true }), META);
    expect(fromRaw.bars.length).toBe(adjusted.bars.length);
    for (let i = 0; i < adjusted.bars.length; i += 97) {
      expect(fromRaw.bars[i].c).toBeCloseTo(adjusted.bars[i].c, 9);
      expect(fromRaw.bars[i].l).toBeCloseTo(adjusted.bars[i].l, 9);
    }
    expect(fromRaw.dividends.length).toBe(adjusted.dividends.length);
    expect(fromRaw.dividends[0].amount).toBeCloseTo(adjusted.dividends[0].amount, 9);
  });

  it("handles close-only stretches in a synthetic history", () => {
    const sec = normalizeSecurity(
      syntheticSecurity({ symbol: "SYNC", from: "1965-01-01", to: "1965-12-31", startPrice: 10, seed: 3, closeOnlyEvery: 5 }),
      META,
    );
    const co = sec.bars.filter((b) => b.closeOnly);
    expect(co.length).toBeGreaterThan(40);
    for (const b of sec.bars) {
      expect(b.h).toBeGreaterThanOrEqual(Math.max(b.o, b.c));
      expect(b.l).toBeLessThanOrEqual(Math.min(b.o, b.c));
    }
  });
});

describe("short rate", () => {
  it("converts percent to decimal, drops gaps and carries the last value forward", () => {
    const s = normalizeShortRate([
      { date: "1970-01-02", percent: 7.5 },
      { date: "1970-01-05", percent: null },
      { date: "1970-01-06", percent: 7.25 },
    ]);
    expect(s).toEqual([
      { day: toDayKey("1970-01-02"), rate: 0.075 },
      { day: toDayKey("1970-01-06"), rate: 0.0725 },
    ]);
    expect(rateOn(s, toDayKey("1970-01-01"))).toBeNull();
    expect(rateOn(s, toDayKey("1970-01-05"))).toBe(0.075);
    expect(rateOn(s, toDayKey("1999-01-01"))).toBe(0.0725);
  });
});

describe("index fund", () => {
  it("compounds daily total returns net of the fee", () => {
    const fund = indexFundFromReturns(
      [
        { date: "1980-01-03", ret: -0.01 },
        { date: "1980-01-02", ret: 0.02 },
      ],
      { key: "INDEX", source: "fixture", name: "Total Market Index", sector: "Financials" },
      0.0005,
    );
    const drag = Math.pow(1 - 0.0005, 1 / 252);
    expect(fund.kind).toBe("index_fund");
    expect(fund.bars[0].c).toBeCloseTo(1.02 * drag, 12);
    expect(fund.bars[1].c).toBeCloseTo(1.02 * 0.99 * drag * drag, 12);
    expect(fund.bars.every((b) => b.closeOnly && b.o === b.c)).toBe(true);
  });

  it("with no fee, the level is the plain compounded return", () => {
    const fund = indexFundFromReturns(
      Array.from({ length: 252 }, (_, i) => ({ date: fromDayKey(toDayKey("1990-01-01") + i), ret: 0.0004 })),
      { key: "INDEX", source: "fixture", name: "Total Market Index", sector: "Financials" },
      0,
    );
    expect(fund.bars.at(-1)!.c).toBeCloseTo(Math.pow(1.0004, 252), 10);
  });
});
