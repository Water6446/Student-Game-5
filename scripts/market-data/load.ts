/**
 * load.ts — load data/normalized + the curated files into a database's
 * reference tables (supabase/migrations/0031). Reference data is data, not
 * schema, so it is loaded here rather than by a migration.
 *
 *   npx tsx scripts/market-data/load.ts            the DEV project, via MARKET_DATABASE_URL
 *   npx tsx scripts/market-data/load.ts --pglite   an in-process Postgres with every
 *                                                  migration applied, then a smoke test
 *                                                  of the trading RPCs on the real data
 *
 * MARKET_DATABASE_URL lives in .env.local (the dev project's Postgres connection
 * string, Dashboard → Connect). It is a server-side secret: never NEXT_PUBLIC_.
 *
 * SAFETY: dev-only data (Yahoo, FRED, Ken French) must never reach the
 * production project. The loader refuses a connection string that names the
 * production project ref while any loaded row is dev-only
 * (docs/PAPER_TRADING_DATA.md §1).
 *
 * Idempotent: instruments are upserted by key and keep their ids (sessions
 * reference them); bars, actions, calendar, rates, the universe, headlines and
 * the name pool are replaced.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { coverage, fromDayKey, toDayKey, yearOfDayKey, type NormalizedSecurity } from "../../lib/markets/data/normalize";
import { parseUniverseCsv, type UniverseRow } from "../../lib/markets/data/universe";
import { distributionAmount, parseDistributionsCsv } from "../../lib/markets/data/distributions";
import type { HeadlineFile } from "../../lib/markets/data/headlines";
import {
  DATA,
  HEADLINES,
  MANIFEST,
  NAME_POOL,
  ROOT,
  UNIVERSE_CSV,
  fileKey,
  loadNormalizedSecurities,
  loadShortRate,
  readJson,
  readManifest,
  readText,
} from "./io";

loadEnv({ path: join(ROOT, ".env.local") });

/** The production Supabase project (package.json db:link). Dev data never goes there. */
const PRODUCTION_REF = "mftrhnwnvidxjdzenmip";

interface Exec {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface NamePool {
  index_fund: { name: string; ticker: string; about: string };
  sectors: Record<string, { about: string; names: { name: string; ticker: string }[] }>;
}

// ---- assemble ------------------------------------------------------------------
interface InstrumentRow {
  key: string;
  kind: "equity" | "index_fund";
  real_ticker: string;
  real_name: string;
  sector: string;
  source: string;
  license: "dev-only" | "display-licensed";
  first_day: number;
  last_day: number;
  delist_type: string | null;
  delist_day: number | null;
  delist_value: number | null;
  sec: NormalizedSecurity;
}

function assemble() {
  const universe = parseUniverseCsv(readText(UNIVERSE_CSV));
  const all = loadNormalizedSecurities();
  const byKey = new Map(all.map((s) => [s.key, s]));
  const manifest = existsSync(MANIFEST) ? readManifest() : null;
  const licenseOf = (key: string) =>
    (manifest?.securities[key]?.license as InstrumentRow["license"] | undefined) ??
    (byKey.get(key)?.source === "fixture" ? "display-licensed" : "dev-only");

  // The latest curated row names each history: what the company is called today.
  const latest = new Map<string, UniverseRow>();
  for (const r of universe) {
    if (!r.yahooSymbol) continue;
    const k = fileKey(r.yahooSymbol);
    const cur = latest.get(k);
    if (!cur || r.anchorYear > cur.anchorYear) latest.set(k, r);
  }

  const instruments: InstrumentRow[] = [];
  const warnings: string[] = [];
  for (const [key, row] of latest) {
    const sec = byKey.get(key);
    if (!sec) {
      warnings.push(`${key}: in the universe list but not imported (run import.ts --universe)`);
      continue;
    }
    const cov = coverage(sec);
    if (!cov) continue;
    instruments.push({
      key,
      kind: "equity",
      real_ticker: row.ticker,
      real_name: row.name,
      sector: row.sector,
      source: sec.source,
      license: licenseOf(key),
      first_day: cov.first,
      last_day: cov.last,
      delist_type: sec.delisting?.type ?? null,
      delist_day: sec.delisting?.day ?? null,
      delist_value: sec.delisting?.value ?? null,
      sec,
    });
  }
  const index = byKey.get("INDEX");
  if (index && coverage(index)) {
    const cov = coverage(index)!;
    instruments.push({
      key: "INDEX",
      kind: "index_fund",
      real_ticker: "INDEX",
      real_name: index.name,
      sector: index.sector,
      source: index.source,
      license: licenseOf("INDEX"),
      first_day: cov.first,
      last_day: cov.last,
      delist_type: null,
      delist_day: null,
      delist_value: null,
      sec: index,
    });
  } else {
    warnings.push("no index fund history (run import.ts --index)");
  }

  // Spin-offs paid as cash (lib/markets/data/distributions.ts).
  const distributions: { key: string; day: number; amount: number; note: string }[] = [];
  const distPath = join(DATA, "universe", "distributions.csv");
  if (existsSync(distPath)) {
    for (const d of parseDistributionsCsv(readText(distPath))) {
      const parent = byKey.get(fileKey(d.symbol));
      const child = byKey.get(fileKey(d.childSymbol));
      if (!parent || !instruments.some((i) => i.key === fileKey(d.symbol))) continue;
      if (!child) {
        warnings.push(`distribution ${d.symbol} ${d.exDate}: ${d.childSymbol} not imported; skipped`);
        continue;
      }
      const r = distributionAmount(d, parent, child);
      if (!r.ok) {
        warnings.push(`distribution ${d.symbol} ${d.exDate}: ${r.reason}; skipped`);
        continue;
      }
      distributions.push({ key: fileKey(d.symbol), day: r.exDay, amount: r.amount, note: d.note });
    }
  }

  const calendar = [...new Set(instruments.flatMap((i) => i.sec.bars.map((b) => b.day)))].sort((a, b) => a - b);
  const rates = loadShortRate() ?? [];
  if (!rates.length) warnings.push("no short-rate series (run import.ts --rates)");
  const pool = readJson<NamePool>(NAME_POOL);
  const headlines = readJson<HeadlineFile>(HEADLINES);
  return { universe, instruments, distributions, calendar, rates, pool, headlines, warnings };
}

// ---- write ---------------------------------------------------------------------
const arr = (xs: (number | string)[]) => `{${xs.join(",")}}`;
// The simulated market (0037) lives from this year on, in the same tables; the
// loader replaces only real history and leaves it alone. MIRRORS _market_sim_year.
const SIM_YEAR = 2100;
const SIM_FIRST_DAY = toDayKey(`${SIM_YEAR}-01-01`);
const f32 = (x: number) => (Number.isFinite(x) ? Math.fround(x).toPrecision(9) : "NaN");

/** Insert rows in batches with positional parameters. */
async function insertBatch(db: Exec, sqlHead: string, cols: string[], rows: unknown[][], batch = 200) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      const ph = r.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.map((p, j) => (cols[j] ? `${p}::${cols[j]}` : p)).join(",")})`;
    });
    await db.query(`${sqlHead} values ${values.join(",")}`, params);
  }
}

async function load(db: Exec, data: ReturnType<typeof assemble>) {
  const t0 = performance.now();
  await db.query("begin");
  try {
    // Instruments: upsert by key, keeping ids stable (sessions reference them).
    const existing = new Map(
      (await db.query("select id, key from public.market_instruments")).rows.map((r) => [String(r.key), Number(r.id)]),
    );
    let next = Math.max(0, ...existing.values()) + 1;
    const idOf = new Map<string, number>();
    for (const i of data.instruments) idOf.set(i.key, existing.get(i.key) ?? next++);
    for (const i of data.instruments) {
      await db.query(
        `insert into public.market_instruments (id, key, kind, real_ticker, real_name, sector, source, license,
           first_day, last_day, delist_type, delist_day, delist_value)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (id) do update set key = excluded.key, kind = excluded.kind,
           real_ticker = excluded.real_ticker, real_name = excluded.real_name, sector = excluded.sector,
           source = excluded.source, license = excluded.license, first_day = excluded.first_day,
           last_day = excluded.last_day, delist_type = excluded.delist_type, delist_day = excluded.delist_day,
           delist_value = excluded.delist_value, loaded_at = now()`,
        [idOf.get(i.key), i.key, i.kind, i.real_ticker, i.real_name, i.sector, i.source, i.license,
         i.first_day, i.last_day, i.delist_type, i.delist_day, i.delist_value],
      );
    }
    const ids = [...idOf.values()];

    // Bars: one row per instrument-year (layout B).
    await db.query(`delete from public.market_bars where instrument_id = any($1::int[])`, [arr(ids)]);
    const barRows: unknown[][] = [];
    for (const i of data.instruments) {
      const byYear = new Map<number, typeof i.sec.bars>();
      for (const b of i.sec.bars) {
        const y = yearOfDayKey(b.day);
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y)!.push(b);
      }
      for (const [y, bars] of byYear) {
        const jan1 = toDayKey(`${y}-01-01`);
        barRows.push([
          idOf.get(i.key), y,
          arr(bars.map((b) => b.day - jan1)),
          arr(bars.map((b) => f32(b.o))), arr(bars.map((b) => f32(b.h))),
          arr(bars.map((b) => f32(b.l))), arr(bars.map((b) => f32(b.c))),
          arr(bars.filter((b) => b.closeOnly).map((b) => b.day - jan1)),
        ]);
      }
    }
    await insertBatch(db, "insert into public.market_bars (instrument_id, year, days, o, h, l, c, close_only)",
      ["int", "smallint", "smallint[]", "real[]", "real[]", "real[]", "real[]", "smallint[]"], barRows, 40);

    // Corporate actions: dividends, splits, distributions.
    await db.query(`delete from public.market_corporate_actions where instrument_id = any($1::int[])`, [arr(ids)]);
    const actions: unknown[][] = [];
    for (const i of data.instruments) {
      for (const d of i.sec.dividends) actions.push([idOf.get(i.key), d.exDay, "dividend", d.amount, null]);
      for (const s of i.sec.splits) actions.push([idOf.get(i.key), s.day, "split", s.ratio, null]);
    }
    for (const d of data.distributions) actions.push([idOf.get(d.key), d.day, "distribution", d.amount, d.note]);
    await insertBatch(db, "insert into public.market_corporate_actions (instrument_id, day, kind, amount, note)",
      ["int", "int", "text", "float8", "text"], actions, 400);

    // Calendar and rates: real history replaced whole (the simulated years stay).
    await db.query("delete from public.market_calendar where day < $1", [SIM_FIRST_DAY]);
    await insertBatch(db, "insert into public.market_calendar (day)", ["int"], data.calendar.map((d) => [d]), 2000);
    await db.query("delete from public.market_rates where day < $1", [SIM_FIRST_DAY]);
    await insertBatch(db, "insert into public.market_rates (day, tbill)", ["int", "float8"],
      data.rates.map((r) => [r.day, r.rate]), 1000);

    // The curated universe, mapped to the histories we hold.
    await db.query("delete from public.market_universe where anchor_year < $1", [SIM_YEAR]);
    await insertBatch(db, "insert into public.market_universe (anchor_year, rank, real_name, real_ticker, sector, instrument_id)",
      ["smallint", "smallint", "text", "text", "text", "int"],
      data.universe.map((r) => [r.anchorYear, r.rank, r.name, r.ticker, r.sector,
        r.yahooSymbol ? idOf.get(fileKey(r.yahooSymbol)) ?? null : null]), 400);

    // Headlines.
    await db.query("delete from public.market_headlines where month < $1", [`${SIM_YEAR}-01`]);
    await insertBatch(db, "insert into public.market_headlines (month, rank, text, reviewed)",
      ["text", "smallint", "text", "boolean"],
      data.headlines.entries.map((e) => [e.month, e.rank, e.text, e.reviewed]), 400);

    // Sectors and the fake-name pool.
    await db.query("delete from public.market_name_pool");
    await db.query("delete from public.market_sectors");
    await insertBatch(db, "insert into public.market_sectors (sector, about)", ["text", "text"],
      Object.entries(data.pool.sectors).map(([s, v]) => [s, v.about]));
    const poolRows: unknown[][] = [[data.pool.index_fund.ticker, data.pool.index_fund.name, "index_fund", null,
      data.pool.index_fund.about]];
    for (const [sector, v] of Object.entries(data.pool.sectors)) {
      for (const n of v.names) poolRows.push([n.ticker, n.name, "equity", sector, null]);
    }
    await insertBatch(db, "insert into public.market_name_pool (ticker, name, kind, sector, about)",
      ["text", "text", "text", "text", "text"], poolRows, 400);

    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
  return performance.now() - t0;
}

// ---- PGlite: every migration, then a smoke test -----------------------------------
async function pgliteDatabase(): Promise<PGlite> {
  const fix = (s: string) => s.replace(/create extension if not exists pgcrypto;/gi, "");
  const db = new PGlite();
  await db.exec(fix(readFileSync(join(ROOT, "scripts", "_supabase_mock.sql"), "utf8")));
  const dir = join(ROOT, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(fix(readFileSync(join(dir, f), "utf8")));
  }
  return db;
}

async function smoke(db: PGlite) {
  const ms = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    const r = await fn();
    console.log(`  ${label.padEnd(44)} ${(performance.now() - t).toFixed(0).padStart(6)} ms`);
    return r;
  };
  const HOST = "11111111-0000-0000-0000-000000000001";
  const STUDENTS = ["22222222-0000-0000-0000-000000000001", "22222222-0000-0000-0000-000000000002",
    "22222222-0000-0000-0000-000000000003"];
  await db.query(`insert into auth.users (id, email, is_anonymous) values ($1, 'smoke@example.edu', false)`, [HOST]);
  for (const s of STUDENTS) await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [s]);
  const as = async (uid: string) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`,
      [JSON.stringify({ sub: uid, role: "authenticated", is_anonymous: uid !== HOST })]);
    await db.query("set role authenticated");
  };
  const one = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows[0];

  console.log("\nSmoke test on the loaded data:");
  await as(HOST);
  const created = await ms("create_trading_session (random era, 25 qtrs)", () =>
    one(`select * from public.create_trading_session('{"num_rounds":25,"period":"quarter"}'::jsonb)`));
  const sid = String(created.id);
  const truth = (await one(`select public.get_trading_truth($1) as t`, [sid])).t as {
    start_year: number; instruments: { slot: number; real_name: string; real_ticker: string; current_name: string }[];
  };
  console.log(`  era: Year 1 = ${truth.start_year}; ${created.universe_size} companies + the index fund`);
  console.log(`  ${truth.instruments.map((i) => `${i.slot}:${i.real_ticker}`).join(" ")}`);
  await db.query("reset role");

  for (const [n, s] of STUDENTS.entries()) {
    await as(s);
    await one(`select id from public.join_session($1, $2)`, [created.join_code, `Student ${n + 1}`]);
    await db.query("reset role");
  }
  await as(HOST);
  await ms("start_round", () => one(`select * from public.start_round($1)`, [sid]));
  await db.query("reset role");

  await as(STUDENTS[0]);
  const snap = await ms("get_market_snapshot", () => one(`select public.get_market_snapshot($1)::text as s`, [sid]));
  const hist = await ms("get_price_history (slot 1, daily)", () =>
    one(`select public.get_price_history($1, 1, 'daily')::text as s`, [sid]));
  const weekly = await ms("get_price_history (slot 1, weekly)", () =>
    one(`select public.get_price_history($1, 1, 'weekly')::text as s`, [sid]));
  console.log(`  payloads: snapshot ${(String(snap.s).length / 1024).toFixed(1)} KB, daily history ` +
    `${(String(hist.s).length / 1024).toFixed(1)} KB (${JSON.parse(String(hist.s)).length} bars), weekly ` +
    `${(String(weekly.s).length / 1024).toFixed(1)} KB`);
  await ms("place_order (market, $10,000)", () =>
    one(`select (public.place_order($1, '{"slot":1,"side":"buy","notional":10000}'::jsonb)).status as s`, [sid]));
  const seen = String(snap.s) + String(hist.s);
  const leaks = truth.instruments.filter(
    (i) => new RegExp(`\\b${i.real_ticker.replace(/[.]/g, "\\.")}\\b`).test(seen.replace(/"[a-z_]+":/g, "")) &&
      i.real_ticker.length > 1,
  );
  if (truth.instruments.some((i) => seen.includes(i.real_name))) throw new Error("SMOKE FAIL: a real name reached a student");
  console.log(`  identity: no real name in the student payloads${leaks.length ? `; ticker-like tokens: ${leaks.map((l) => l.real_ticker).join(",")}` : ""}`);
  await db.query("reset role");

  await db.query("reset role");
  // Student 2 goes all in on the index; student 3 shorts with a stop above; student 1 holds what they bought.
  await as(STUDENTS[1]);
  await one(`select (public.place_order($1, '{"slot":0,"side":"buy","notional":99000}'::jsonb)).status`, [sid]);
  await db.query("reset role");
  await as(STUDENTS[2]);
  const p2 = (JSON.parse(String(snap.s)).instruments as { slot: number; last: number }[]).find((x) => x.slot === 2)!.last;
  await one(`select (public.place_order($1, $2::jsonb)).status`, [sid,
    JSON.stringify({ slot: 2, side: "sell_short", quantity: Math.floor(40000 / p2) })]);
  await db.query("reset role");
  // a protective stop needs the short to exist first, so it goes in next round
  const placeStop = async () => {
    await as(STUDENTS[2]);
    const pos = await one(`select quantity from public.market_positions mp
                            join public.players p on p.id = mp.player_id
                           where p.session_id = $1 and mp.slot = 2`, [sid]);
    if (pos && Number(pos.quantity) < 0) {
      await one(`select (public.place_order($1, $2::jsonb)).status`, [sid,
        JSON.stringify({ slot: 2, side: "buy_to_cover", order_type: "stop", quantity: -Number(pos.quantity),
                         stop_price: Math.round(p2 * 130) / 100, tif: "gtc" })]);
    }
    await db.query("reset role");
    await as(HOST);
  };

  // Play the whole session: 25 quarters.
  await as(HOST);
  let worst = 0;
  const t0 = performance.now();
  for (let r = 1; r <= 25; r++) {
    if (r > 1) await one(`select (public.next_round($1)).round_number`, [sid]);
    if (r === 2) await placeStop();
    await one(`select (public.lock_round($1, $2)).status`, [sid, r]);
    const t = performance.now();
    await one(`select public.resolve_round($1, $2) as r`, [sid, r]);
    worst = Math.max(worst, performance.now() - t);
  }
  console.log(`  25 rounds resolved in ${((performance.now() - t0) / 1000).toFixed(1)} s (slowest round ${worst.toFixed(0)} ms)`);
  await one(`select (public.finish_session($1)).status`, [sid]);
  await db.query("reset role");

  const rows = (await db.query<Record<string, unknown>>(
    `select p.display_name, a.nlv, a.sharpe, a.max_drawdown, a.frozen,
            (select count(*) from public.market_fills f where f.player_id = p.id) as fills,
            (select coalesce(sum(amount), 0) from public.market_ledger l where l.player_id = p.id and l.kind = 'dividend') as divs,
            (select coalesce(sum(amount), 0) from public.market_ledger l where l.player_id = p.id and l.kind = 'interest') as interest
       from public.players p join public.market_accounts a on a.player_id = p.id
      where p.session_id = $1 order by a.nlv desc`, [sid])).rows;
  for (const r of rows) {
    console.log(`  ${String(r.display_name).padEnd(10)} $${Number(r.nlv).toFixed(2).padStart(12)}  Sharpe ${r.sharpe == null ? "  —  " : Number(r.sharpe).toFixed(2).padStart(5)}` +
      `  max DD ${(Number(r.max_drawdown) * 100).toFixed(1)}%  ${r.fills} fills  dividends $${Number(r.divs).toFixed(2)}  interest $${Number(r.interest).toFixed(2)}${r.frozen ? "  FROZEN" : ""}`);
  }
}

// ---- main ------------------------------------------------------------------------
async function main() {
  const data = assemble();
  const devOnly = data.instruments.some((i) => i.license === "dev-only");
  console.log(`Loading ${data.instruments.length} instruments (${devOnly ? "includes DEV-ONLY data" : "licensed"}), ` +
    `${data.calendar.length} calendar days, ${data.rates.length} rate points, ${data.distributions.length} distributions, ` +
    `${data.universe.length} universe rows, ${data.headlines.entries.length} headlines.`);
  for (const w of data.warnings) console.log(`  warning: ${w}`);
  for (const d of data.distributions) {
    console.log(`  distribution ${d.key.padEnd(5)} ${fromDayKey(d.day)}  $${d.amount.toFixed(4)} per share`);
  }

  if (process.argv.includes("--pglite")) {
    const t = performance.now();
    const db = await pgliteDatabase();
    console.log(`\nPGlite with every migration: ${(performance.now() - t).toFixed(0)} ms`);
    const took = await load(db, data);
    const size = (await db.query<{ n: string }>(
      `select pg_size_pretty(sum(pg_total_relation_size(c.oid))) as n from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'market\\_%'`)).rows[0].n;
    console.log(`Loaded in ${took.toFixed(0)} ms; market tables now ${size}.`);
    await smoke(db);
    await db.close();
    return;
  }

  const url = process.env.MARKET_DATABASE_URL;
  if (!url) {
    console.error("Set MARKET_DATABASE_URL in .env.local to the DEV project's connection string, or pass --pglite.");
    process.exit(2);
  }
  if (devOnly && url.includes(PRODUCTION_REF)) {
    console.error(`Refusing: this data is dev-only and MARKET_DATABASE_URL points at the production project (${PRODUCTION_REF}).`);
    process.exit(2);
  }
  // a local stack (`supabase start`) speaks no SSL; a hosted project needs it
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const took = await load(client as unknown as Exec, data);
    console.log(`Loaded in ${(took / 1000).toFixed(1)} s.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
