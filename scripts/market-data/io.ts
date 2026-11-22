// File locations and JSON helpers shared by the market-data scripts.
//
//   data/raw/<source>/<SYMBOL>.json      vendor output as fetched  (gitignored)
//   data/normalized/securities/<KEY>.json  internal format           (gitignored)
//   data/normalized/rates/tbill_3m.json
//   data/normalized/manifest.json        what is there, from where, with warnings
//   data/universe/ data/names/ data/headlines/   curated by hand, committed

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NormalizedRatePoint, NormalizedSecurity } from "../../lib/markets/data/normalize";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "data");
export const RAW = join(DATA, "raw");
export const NORMALIZED = join(DATA, "normalized");
export const SECURITIES = join(NORMALIZED, "securities");
export const RATES = join(NORMALIZED, "rates");
export const MANIFEST = join(NORMALIZED, "manifest.json");
export const UNIVERSE_CSV = join(DATA, "universe", "top_by_year.csv");
export const NAME_POOL = join(DATA, "names", "name_pool.json");
export const HEADLINES = join(DATA, "headlines", "market_headlines.json");

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown, pretty = false): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, pretty ? 2 : undefined) + "\n");
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** File-system-safe form of a vendor symbol ("BRK-B", "^GSPC"). */
export const fileKey = (symbol: string) => symbol.replace(/[^A-Za-z0-9._-]/g, "_");

export function loadNormalizedSecurities(): NormalizedSecurity[] {
  if (!existsSync(SECURITIES)) return [];
  return readdirSync(SECURITIES)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson<NormalizedSecurity>(join(SECURITIES, f)));
}

export function loadShortRate(): NormalizedRatePoint[] | null {
  const p = join(RATES, "tbill_3m.json");
  return existsSync(p) ? readJson<{ points: NormalizedRatePoint[] }>(p).points : null;
}

export interface ManifestEntry {
  key: string;
  source: string;
  license: string;
  kind: string;
  first: string | null;
  last: string | null;
  bars: number;
  dividends: number;
  delisting: string | null;
  warnings: string[];
  fetchedAt: string;
}

export interface Manifest {
  note: string;
  updatedAt: string;
  securities: Record<string, ManifestEntry>;
  rates: { source: string; license: string; first: string; last: string; points: number; fetchedAt: string } | null;
}

export function readManifest(): Manifest {
  return existsSync(MANIFEST)
    ? readJson<Manifest>(MANIFEST)
    : {
        note: "Vendor data. Never commit, never load into the production database.",
        updatedAt: new Date().toISOString(),
        securities: {},
        rates: null,
      };
}
