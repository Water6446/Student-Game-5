import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distributionAmount, parseDistributionsCsv, type DistributionRow } from "./distributions";
import { toDayKey, type NormalizedSecurity } from "./normalize";

const sec = (key: string, bars: [string, number][], splits: [string, number][] = []): NormalizedSecurity => ({
  key,
  source: "fixture",
  kind: "equity",
  name: key,
  sector: "Industrials",
  bars: bars.map(([d, c]) => ({ day: toDayKey(d), o: c, h: c, l: c, c, closeOnly: false })),
  dividends: [],
  splits: splits.map(([d, ratio]) => ({ day: toDayKey(d), ratio })),
  delisting: null,
  marketCap: [],
  warnings: [],
});

const row = (over: Partial<DistributionRow> = {}): DistributionRow => ({
  symbol: "PAR",
  exDate: "2008-03-31",
  childSymbol: "KID",
  ratio: 1,
  note: "",
  ...over,
});

describe("distributionAmount", () => {
  it("is ratio × the child's close on the ex-date", () => {
    const parent = sec("PAR", [["2008-03-28", 74], ["2008-03-31", 22]]);
    const child = sec("KID", [["2008-03-31", 50.58]]);
    expect(distributionAmount(row(), parent, child)).toMatchObject({ ok: true, amount: 50.58, childDate: "2008-03-31" });
    expect(distributionAmount(row({ ratio: 0.25 }), parent, child)).toMatchObject({ ok: true, amount: 12.645 });
  });

  it("uses the child's first close within a few days when it starts later", () => {
    const parent = sec("PAR", [["2008-03-31", 22]]);
    const child = sec("KID", [["2008-04-02", 40]]);
    expect(distributionAmount(row(), parent, child)).toMatchObject({ ok: true, amount: 40 });
    expect(distributionAmount(row(), parent, sec("KID", [["2008-05-01", 40]])).ok).toBe(false);
  });

  it("undoes later splits on both sides", () => {
    // the child later split 2:1, so its adjusted close is half its raw one;
    // the parent later split 3:1, so one old parent share is three adjusted ones
    const parent = sec("PAR", [["2008-03-31", 22]], [["2010-01-04", 3]]);
    const child = sec("KID", [["2008-03-31", 25]], [["2012-06-01", 2]]);
    expect(distributionAmount(row(), parent, child)).toMatchObject({ ok: true, amount: (25 * 2) / 3 });
  });

  it("refuses when the parent has no prices then", () => {
    expect(distributionAmount(row(), sec("PAR", [["2001-01-02", 10]]), sec("KID", [["2008-03-31", 1]])).ok).toBe(false);
  });
});

describe("data/universe/distributions.csv", () => {
  it("parses", () => {
    const rows = parseDistributionsCsv(readFileSync(new URL("../../../data/universe/distributions.csv", import.meta.url), "utf8"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.symbol === "MO")).toMatchObject({ childSymbol: "PM", ratio: 1, exDate: "2008-03-31" });
  });
});
