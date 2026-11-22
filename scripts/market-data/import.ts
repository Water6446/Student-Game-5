/**
 * import.ts — fetch market data from a vendor, keep the raw response, normalize
 * it, and report what a session could trade. Local files only: nothing here
 * touches a database. Vendor data lands in gitignored folders (see io.ts).
 *
 *   npx tsx scripts/market-data/import.ts --symbols IBM,KO,GE
 *   npx tsx scripts/market-data/import.ts --universe            every Yahoo symbol in the curated list
 *   npx tsx scripts/market-data/import.ts --rates --index       T-bill (FRED DTB3) and the market index (Ken French)
 *   npx tsx scripts/market-data/import.ts --source fixture --symbols SYN0,SYN1,SYNBK
 *   flags: --refresh (ignore the raw cache)  --from 1962-01-01  --to 2026-11-19  --report (eligibility only)
 *
 * The Yahoo, FRED and Ken French adapters are DEVELOPMENT ONLY
 * (docs/PAPER_TRADING_DATA.md). A licensed source is one more adapter here.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PriceSource, SourceSecurity } from "../../lib/markets/data/price-source";
import {
  coverage,
  fromDayKey,
  indexFundFromReturns,
  normalizeSecurity,
  normalizeShortRate,
  toDayKey,
  type NormalizedSecurity,
} from "../../lib/markets/data/normalize";
import { parseUniverseCsv, selectUniverse, type UniverseRow } from "../../lib/markets/data/universe";
import { FixtureSource } from "./sources/fixture";
import { FredTBillSource } from "./sources/fred";
import { FrenchMarketSource } from "./sources/french";
import { YahooSource } from "./sources/yahoo";
import {
  RATES,
  RAW,
  SECURITIES,
  UNIVERSE_CSV,
  fileKey,
  loadNormalizedSecurities,
  readJson,
  readManifest,
  readText,
  writeJson,
  MANIFEST,
  type ManifestEntry,
} from "./io";

// ---- args --------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const today = new Date().toISOString().slice(0, 10);
const SOURCE = opt("source", "yahoo");
const FROM = opt("from", "1962-01-01");
const TO = opt("to", today);
const REFRESH = flag("refresh");

const universe: UniverseRow[] = existsSync(UNIVERSE_CSV) ? parseUniverseCsv(readText(UNIVERSE_CSV)) : [];

function wantedSymbols(): string[] {
  const list = opt("symbols", "");
  const out = new Set(list ? list.split(",").map((s) => s.trim()).filter(Boolean) : []);
  if (flag("universe")) for (const r of universe) if (r.yahooSymbol) out.add(r.yahooSymbol);
  return [...out];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Latest curated row for a vendor symbol: its name and sector label. */
function curatedFor(symbol: string): UniverseRow | undefined {
  return universe
    .filter((r) => r.yahooSymbol === symbol)
    .sort((a, b) => b.anchorYear - a.anchorYear)[0];
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !["inc", "corp", "corporation", "company", "the", "co", "ltd", "group", "holdings"].includes(t)),
  );

/** Does the vendor's name for a symbol look like the company we curated? */
function namesAgree(curated: string, vendor: string | undefined): boolean {
  if (!vendor) return false;
  const a = tokens(curated);
  for (const t of tokens(vendor)) if (a.has(t)) return true;
  return false;
}

// ---- securities ----------------------------------------------------------------
async function importSecurities(source: PriceSource, symbols: string[]) {
  const manifest = readManifest();
  const nameChecks: string[] = [];
  let fetched = 0;
  for (const symbol of symbols) {
    const rawPath = join(RAW, source.id, `${fileKey(symbol)}.json`);
    let raw: SourceSecurity;
    let fetchedAt: string;
    if (!REFRESH && existsSync(rawPath)) {
      ({ raw, fetchedAt } = readJson<{ raw: SourceSecurity; fetchedAt: string }>(rawPath));
    } else {
      if (fetched++ && source.id === "yahoo") await sleep(400); // be polite
      try {
        raw = await source.fetchSecurity({ symbol, from: FROM, to: TO });
      } catch (e) {
        console.log(`  ${symbol.padEnd(8)} FAILED: ${(e as Error).message}`);
        continue;
      }
      fetchedAt = new Date().toISOString();
      writeJson(rawPath, { raw, fetchedAt });
    }
    const row = curatedFor(symbol);
    const sec = normalizeSecurity(raw, {
      key: fileKey(symbol),
      source: source.id,
      kind: "equity",
      name: row?.name ?? raw.name ?? symbol,
      sector: row?.sector ?? "Industrials",
    });
    if (!row) sec.warnings.push("not in data/universe/top_by_year.csv; sector defaulted");
    else if (source.id === "yahoo" && !namesAgree(row.name, raw.name)) {
      nameChecks.push(`  ${symbol.padEnd(8)} curated "${row.name}" vs vendor "${raw.name ?? "?"}"`);
    }
    writeJson(join(SECURITIES, `${sec.key}.json`), sec);
    const cov = coverage(sec);
    const entry: ManifestEntry = {
      key: sec.key,
      source: source.id,
      license: source.license,
      kind: sec.kind,
      first: cov ? fromDayKey(cov.first) : null,
      last: cov ? fromDayKey(cov.last) : null,
      bars: sec.bars.length,
      dividends: sec.dividends.length,
      delisting: sec.delisting ? `${sec.delisting.type} ${fromDayKey(sec.delisting.day)}` : null,
      warnings: sec.warnings,
      fetchedAt,
    };
    manifest.securities[sec.key] = entry;
    console.log(
      `  ${symbol.padEnd(8)} ${entry.first} .. ${entry.last}  ${String(entry.bars).padStart(6)} bars  ` +
        `${String(entry.dividends).padStart(4)} divs  ${sec.warnings.length} warning(s)`,
    );
  }
  manifest.updatedAt = new Date().toISOString();
  writeJson(MANIFEST, manifest, true);
  if (nameChecks.length) {
    console.log("\nName check — the vendor's name does not obviously match the curated one:");
    console.log(nameChecks.join("\n"));
  }
}

// ---- rates and index ---------------------------------------------------------------
async function importRates() {
  const src = new FredTBillSource();
  const raw = await src.fetchShortRate();
  writeJson(join(RAW, src.id, "DTB3.json"), { raw, fetchedAt: new Date().toISOString() });
  const points = normalizeShortRate(raw);
  writeJson(join(RATES, "tbill_3m.json"), { source: src.id, series: "DTB3", points });
  const manifest = readManifest();
  manifest.rates = {
    source: src.id,
    license: src.license,
    first: fromDayKey(points[0].day),
    last: fromDayKey(points[points.length - 1].day),
    points: points.length,
    fetchedAt: new Date().toISOString(),
  };
  manifest.updatedAt = new Date().toISOString();
  writeJson(MANIFEST, manifest, true);
  console.log(`  DTB3     ${manifest.rates.first} .. ${manifest.rates.last}  ${points.length} points`);
}

async function importIndex() {
  const src = new FrenchMarketSource();
  const raw = await src.fetchDailyTotalReturns();
  writeJson(join(RAW, src.id, "FF_daily.json"), { raw, fetchedAt: new Date().toISOString() });
  const fund = indexFundFromReturns(raw, {
    key: "INDEX",
    source: src.id,
    name: "Total Market Index",
    sector: "Financials",
  });
  writeJson(join(SECURITIES, "INDEX.json"), fund);
  const cov = coverage(fund)!;
  const manifest = readManifest();
  manifest.securities.INDEX = {
    key: "INDEX",
    source: src.id,
    license: src.license,
    kind: fund.kind,
    first: fromDayKey(cov.first),
    last: fromDayKey(cov.last),
    bars: fund.bars.length,
    dividends: 0,
    delisting: null,
    warnings: fund.warnings,
    fetchedAt: new Date().toISOString(),
  };
  manifest.updatedAt = new Date().toISOString();
  writeJson(MANIFEST, manifest, true);
  console.log(`  INDEX    ${fromDayKey(cov.first)} .. ${fromDayKey(cov.last)}  ${fund.bars.length} bars`);
}

// ---- eligibility report ---------------------------------------------------------------
/**
 * For each anchor, how many curated companies a session starting in that year
 * could trade, given what is in data/normalized. Uses the default session shape
 * (5 years of history, 25 quarterly rounds = a 6.25-year window).
 */
function eligibilityReport(secs: NormalizedSecurity[]) {
  if (!universe.length) return;
  const byKey = new Map(secs.map((s) => [s.key, s]));
  const anchors = [...new Set(universe.map((r) => r.anchorYear))].sort((a, b) => a - b);
  const lastData = Math.max(...secs.map((s) => coverage(s)?.last ?? 0));
  console.log("\nEligible companies by window start (5 yrs history, 25 quarterly rounds):");
  const FIRST_START = 1962 + 5; // daily data begins 1962; Year 1 needs 5 years before it
  for (const anchor of anchors) {
    const startYear = Math.max(anchor, FIRST_START);
    const windowEndDay = Math.min(toDayKey(`${startYear + 6}-03-31`), lastData);
    const pick = selectUniverse(
      universe,
      (r) => {
        const s = r.yahooSymbol ? byKey.get(fileKey(r.yahooSymbol)) : undefined;
        const cov = s && coverage(s);
        return cov ? { first: cov.first, last: cov.last, delistDay: s!.delisting?.day ?? null } : undefined;
      },
      { startYear, historyYears: 5, windowEndDay },
      25,
    );
    const reasons = pick.skipped.reduce<Record<string, number>>((m, s) => {
      m[s.reason] = (m[s.reason] ?? 0) + 1;
      return m;
    }, {});
    const skipped = Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(
      `  ${startYear}  ${String(pick.picked.length).padStart(2)}/25 eligible` +
        `${pick.picked.length < 25 ? "  (short)" : ""}  skipped: ${skipped || "none"}`,
    );
  }
}

// ---- main ---------------------------------------------------------------------------------
async function main() {
  const symbols = wantedSymbols();
  const source: PriceSource | null =
    SOURCE === "yahoo" ? new YahooSource() : SOURCE === "fixture" ? new FixtureSource() : null;
  if (!source) throw new Error(`unknown --source ${SOURCE} (yahoo | fixture)`);

  if (!flag("report")) {
    if (symbols.length) {
      console.log(`Securities from ${source.id} (${source.license}), ${FROM} .. ${TO}:`);
      await importSecurities(source, symbols);
    }
    if (flag("rates")) {
      console.log("\nShort rate:");
      await importRates();
    }
    if (flag("index")) {
      console.log("\nMarket index:");
      await importIndex();
    }
    if (!symbols.length && !flag("rates") && !flag("index")) {
      console.log("Nothing to do. Pass --symbols, --universe, --rates, --index or --report.");
    }
  }
  eligibilityReport(loadNormalizedSecurities());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
