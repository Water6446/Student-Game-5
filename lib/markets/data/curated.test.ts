// Guards the three hand-curated, committed data files. They are data, but a
// broken one breaks every session that draws from it, so they get tests.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANCHOR_STEP, FIRST_ANCHOR, SECTORS, parseUniverseCsv } from "./universe";
import { validateHeadlineFile, type HeadlineFile } from "./headlines";

const read = (rel: string) => readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf8");

interface NamePool {
  index_fund: { name: string; ticker: string; about: string };
  sectors: Record<string, { about: string; names: { name: string; ticker: string }[] }>;
}

const universe = parseUniverseCsv(read("universe/top_by_year.csv"));
const pool = JSON.parse(read("names/name_pool.json")) as NamePool;
const headlines = JSON.parse(read("headlines/market_headlines.json")) as HeadlineFile;

const LAST_ANCHOR = 2025;
const anchors = Array.from(
  { length: (LAST_ANCHOR - FIRST_ANCHOR) / ANCHOR_STEP + 1 },
  (_, i) => FIRST_ANCHOR + i * ANCHOR_STEP,
);

describe("data/universe/top_by_year.csv", () => {
  it("has ranks 1..50 for every anchor from 1965 to 2025", () => {
    for (const a of anchors) {
      const ranks = universe.filter((r) => r.anchorYear === a).map((r) => r.rank).sort((x, y) => x - y);
      expect(ranks, `anchor ${a}`).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    }
    expect(new Set(universe.map((r) => r.anchorYear))).toEqual(new Set(anchors));
  });

  it("never lists the same company twice in one anchor", () => {
    for (const a of anchors) {
      const names = universe.filter((r) => r.anchorYear === a).map((r) => r.name);
      expect(new Set(names).size, `anchor ${a}`).toBe(names.length);
      const symbols = universe.filter((r) => r.anchorYear === a && r.yahooSymbol).map((r) => r.yahooSymbol);
      expect(new Set(symbols).size, `anchor ${a} yahoo symbols`).toBe(symbols.length);
    }
  });

  it("has a vendor symbol only for companies still listed under it", () => {
    for (const r of universe) {
      if (r.status !== "listed") {
        // a merged company can map to the survivor whose history it is (DD, COP); never a bankrupt one
        expect(r.status === "bankrupt" && r.yahooSymbol, `${r.anchorYear} ${r.name}`).toBeFalsy();
      }
    }
  });
});

describe("data/names/name_pool.json", () => {
  const all = Object.values(pool.sectors).flatMap((s) => s.names);
  const realTickers = new Set(
    universe.flatMap((r) => [r.ticker, r.yahooSymbol ?? ""]).flatMap((t) => [t, t.replace(/[.-]/g, "")]).filter(Boolean),
  );
  const realNames = new Set(universe.map((r) => r.name.toLowerCase()));

  it("covers every sector with an about line", () => {
    expect(Object.keys(pool.sectors).sort()).toEqual([...SECTORS].sort());
    for (const [sector, s] of Object.entries(pool.sectors)) {
      expect(s.about.length, sector).toBeGreaterThan(10);
    }
  });

  it("has unique names and unique, well-formed tickers", () => {
    const tickers = [...all.map((n) => n.ticker), pool.index_fund.ticker];
    expect(new Set(tickers).size).toBe(tickers.length);
    expect(new Set(all.map((n) => n.name)).size).toBe(all.length);
    for (const t of tickers) expect(t).toMatch(/^[A-Z]{3,5}$/);
  });

  it("never reuses a real ticker, vendor symbol or company name from our dataset", () => {
    for (const n of [...all, pool.index_fund]) {
      expect(realTickers.has(n.ticker), n.ticker).toBe(false);
      expect(realNames.has(n.name.toLowerCase()), n.name).toBe(false);
    }
  });

  it("has enough names per sector for any anchor's top 25", () => {
    for (const a of anchors) {
      const top = universe.filter((r) => r.anchorYear === a && r.rank <= 50);
      const bySector = new Map<string, number>();
      for (const r of top) bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + 1);
      for (const [sector, count] of bySector) {
        expect(pool.sectors[sector].names.length, `${a} ${sector}`).toBeGreaterThanOrEqual(Math.min(count, 25));
      }
    }
  });
});

describe("data/headlines/market_headlines.json", () => {
  it("passes validation: months, ranks, no years, names, places or dated terms", () => {
    expect(validateHeadlineFile(headlines)).toEqual([]);
  });

  it("has a lead headline for every month that has any", () => {
    const months = new Set(headlines.entries.map((e) => e.month));
    for (const m of months) {
      expect(headlines.entries.some((e) => e.month === m && e.rank === 1), m).toBe(true);
    }
  });
});
