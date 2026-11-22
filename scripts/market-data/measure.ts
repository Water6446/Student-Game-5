/**
 * measure.ts — how big is the bar table, under each candidate layout, in real
 * Postgres (PGlite)? Loads what is in data/normalized (plus a synthetic sample,
 * so it also runs with no vendor data), reports bytes per bar and per
 * instrument-year, projects the full dataset, and times a resolver-shaped read.
 *
 *   npx tsx scripts/market-data/measure.ts [--synthetic 20]
 *
 * Layouts:
 *   A  one row per instrument-day: (instrument smallint, day int, o h l c real, close_only bool)
 *   B  one row per instrument-year: day offsets smallint[] + o h l c real[] + close-only offsets
 *   B2 like B but aligned to a shared trading calendar, so no day array (gaps = NaN)
 *   C  close only, one row per instrument-day: the floor for any row layout
 */
import { PGlite } from "@electric-sql/pglite";
import { join } from "node:path";
import { normalizeSecurity, yearOfDayKey, toDayKey, type NormalizedSecurity } from "../../lib/markets/data/normalize";
import { FixtureSource } from "./sources/fixture";
import { NORMALIZED, loadNormalizedSecurities, writeJson } from "./io";

const argv = process.argv.slice(2);
const synthIdx = argv.indexOf("--synthetic");
const SYNTHETIC = synthIdx >= 0 ? Number(argv[synthIdx + 1]) : 20;

// What the production dataset is expected to hold (spec §5.7): 100-150
// companies that were ever in a top-50 list, daily from 1962, plus the index.
const PROJECT_INSTRUMENTS = 150;
const PROJECT_YEARS_HIGH = 2026 - 1962 + 1; // every instrument from 1962
const PROJECT_YEARS_TYPICAL = 45; // later listings and delistings shorten many histories
const SUPABASE_FREE_BYTES = 500 * 1024 * 1024; // 0.5 GB per active project (changelog, 2025)

const fmt = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

const realNum = (x: number) => (Number.isFinite(x) ? x.toPrecision(8) : "NaN");
const arr = (xs: (number | string)[]) => `'{${xs.join(",")}}'`;

async function main() {
  const real = loadNormalizedSecurities();
  const fixture = new FixtureSource();
  const synthetic: NormalizedSecurity[] = [];
  for (let n = 0; n < SYNTHETIC; n++) {
    const raw = await fixture.fetchSecurity({ symbol: `SYN${n}`, from: "1962-01-01", to: "2026-11-01" });
    synthetic.push(normalizeSecurity(raw, { key: `SYN${n}`, source: "fixture", kind: "equity", name: `SYN${n}`, sector: "Industrials" }));
  }
  const all = [...real, ...synthetic];
  if (!all.length) throw new Error("nothing to measure");

  const db = new PGlite();
  await db.exec(`
    create table bars_a (instrument smallint, day int, o real, h real, l real, c real, close_only boolean,
                         primary key (instrument, day));
    create table bars_b (instrument smallint, year smallint, days smallint[], o real[], h real[], l real[], c real[],
                         close_only smallint[], primary key (instrument, year));
    create table bars_b2 (instrument smallint, year smallint, o real[], h real[], l real[], c real[],
                          close_only smallint[], primary key (instrument, year));
    create table calendar (day int primary key);
    create table bars_c (instrument smallint, day int, c real, primary key (instrument, day));
  `);

  // The shared trading calendar: every day any instrument traded.
  const calendarDays = [...new Set(all.flatMap((s) => s.bars.map((b) => b.day)))].sort((a, b) => a - b);
  const calByYear = new Map<number, number[]>();
  for (const d of calendarDays) {
    const y = yearOfDayKey(d);
    if (!calByYear.has(y)) calByYear.set(y, []);
    calByYear.get(y)!.push(d);
  }
  for (let i = 0; i < calendarDays.length; i += 5000) {
    await db.exec(`insert into calendar values ${calendarDays.slice(i, i + 5000).map((d) => `(${d})`).join(",")};`);
  }

  let bars = 0;
  let instrumentYears = 0;
  for (const [id, sec] of all.entries()) {
    bars += sec.bars.length;
    // A and C: row per day, in batches
    for (let i = 0; i < sec.bars.length; i += 2000) {
      const chunk = sec.bars.slice(i, i + 2000);
      await db.exec(
        `insert into bars_a values ${chunk
          .map((b) => `(${id},${b.day},${realNum(b.o)},${realNum(b.h)},${realNum(b.l)},${realNum(b.c)},${b.closeOnly})`)
          .join(",")};` +
          `insert into bars_c values ${chunk.map((b) => `(${id},${b.day},${realNum(b.c)})`).join(",")};`,
      );
    }
    // B and B2: row per instrument-year
    const byYear = new Map<number, typeof sec.bars>();
    for (const b of sec.bars) {
      const y = yearOfDayKey(b.day);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(b);
    }
    const rowsB: string[] = [];
    const rowsB2: string[] = [];
    for (const [y, ys] of byYear) {
      instrumentYears++;
      const jan1 = toDayKey(`${y}-01-01`);
      const closeOnly = ys.filter((b) => b.closeOnly).map((b) => b.day - jan1);
      rowsB.push(
        `(${id},${y},${arr(ys.map((b) => b.day - jan1))},${arr(ys.map((b) => realNum(b.o)))},${arr(
          ys.map((b) => realNum(b.h)),
        )},${arr(ys.map((b) => realNum(b.l)))},${arr(ys.map((b) => realNum(b.c)))},${arr(closeOnly)})`,
      );
      const byDay = new Map(ys.map((b) => [b.day, b]));
      const cal = calByYear.get(y)!;
      const col = (k: "o" | "h" | "l" | "c") => arr(cal.map((d) => (byDay.has(d) ? realNum(byDay.get(d)![k]) : "NaN")));
      rowsB2.push(`(${id},${y},${col("o")},${col("h")},${col("l")},${col("c")},${arr(closeOnly)})`);
    }
    for (let i = 0; i < rowsB.length; i += 20) {
      await db.exec(`insert into bars_b values ${rowsB.slice(i, i + 20).join(",")};`);
      await db.exec(`insert into bars_b2 values ${rowsB2.slice(i, i + 20).join(",")};`);
    }
  }
  await db.exec("vacuum analyze;");

  const size = async (t: string) =>
    Number((await db.query<{ n: string }>(`select pg_total_relation_size('${t}')::text as n`)).rows[0].n);
  const layouts = {
    A: await size("bars_a"),
    B: await size("bars_b"),
    B2: (await size("bars_b2")) + (await size("calendar")),
    C: await size("bars_c"),
  };

  // A resolver-shaped read: 26 instruments, one year of bars.
  const ids = Math.min(26, all.length);
  const t0 = performance.now();
  await db.query(`select * from bars_a where instrument < ${ids} and day between ${toDayKey("1990-01-01")} and ${toDayKey("1990-12-31")}`);
  const tA = performance.now() - t0;
  const t1 = performance.now();
  await db.query(`select * from bars_b where instrument < ${ids} and year in (1990, 1991)`);
  const tB = performance.now() - t1;

  console.log(`Measured ${all.length} instruments (${real.length} real, ${synthetic.length} synthetic), ` +
    `${bars.toLocaleString()} bars, ${instrumentYears.toLocaleString()} instrument-years.\n`);
  console.log("Layout  total        per bar   per inst-year   projected 150 × 45 yrs   150 × 65 yrs   share of 0.5 GB");
  const report: Record<string, unknown> = {};
  for (const [name, bytes] of Object.entries(layouts)) {
    const perBar = bytes / bars;
    const perIY = bytes / instrumentYears;
    const typical = perIY * PROJECT_INSTRUMENTS * PROJECT_YEARS_TYPICAL;
    const high = perIY * PROJECT_INSTRUMENTS * PROJECT_YEARS_HIGH;
    report[name] = { bytes, perBar, perInstrumentYear: perIY, projectedTypical: typical, projectedHigh: high };
    console.log(
      `${name.padEnd(7)} ${fmt(bytes).padStart(10)}  ${perBar.toFixed(1).padStart(7)} B  ${fmt(perIY).padStart(13)}` +
        `   ${fmt(typical).padStart(20)}   ${fmt(high).padStart(12)}   ${((high / SUPABASE_FREE_BYTES) * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log(`\nRead 26 instruments × 1 year: A ${tA.toFixed(1)} ms, B ${tB.toFixed(1)} ms (PGlite, warm).`);
  writeJson(
    join(NORMALIZED, "size_report.json"),
    { measuredAt: new Date().toISOString(), instruments: all.length, real: real.length, synthetic: synthetic.length, bars, instrumentYears, layouts: report, readMs: { A: tA, B: tB } },
    true,
  );
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
