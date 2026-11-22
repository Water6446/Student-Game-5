// DEVELOPMENT-ONLY index source: the Ken French data library's daily
// Fama/French factors. Market total return = Mkt-RF + RF (both in percent).
// The library carries a copyright notice and is built from CRSP data, whose
// licence does not allow public display, so this stays dev-only; the licensed
// source supplies the index before real classes (docs/PAPER_TRADING_DATA.md).

import type { IndexSource } from "../../../lib/markets/data/price-source";
import { readZip } from "../unzip";

export const FF_DAILY_ZIP_URL =
  "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip";

/** Parse the daily factors CSV: preamble lines, a header, YYYYMMDD rows, a footer. */
export function parseFrenchDaily(text: string): { date: string; ret: number }[] {
  const out: { date: string; ret: number }[] = [];
  let mkt = -1;
  let rf = -1;
  for (const rawLine of text.split(/\r?\n/)) {
    const cells = rawLine.split(",").map((c) => c.trim());
    if (mkt < 0) {
      const i = cells.indexOf("Mkt-RF");
      const j = cells.indexOf("RF");
      if (i >= 0 && j >= 0) {
        mkt = i;
        rf = j;
      }
      continue;
    }
    if (!/^\d{8}$/.test(cells[0])) {
      if (out.length) break; // the footer, or the next (annual) table
      continue;
    }
    const m = Number(cells[mkt]);
    const r = Number(cells[rf]);
    if (!Number.isFinite(m) || !Number.isFinite(r)) continue;
    const d = cells[0];
    out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, ret: (m + r) / 100 });
  }
  if (!out.length) throw new Error("no daily rows found in the Fama/French file");
  return out;
}

export class FrenchMarketSource implements IndexSource {
  readonly id = "french-mkt";
  readonly license = "dev-only" as const;

  async fetchDailyTotalReturns() {
    const res = await fetch(FF_DAILY_ZIP_URL, { headers: { "user-agent": "market-data-importer" } });
    if (!res.ok) throw new Error(`Ken French library: HTTP ${res.status}`);
    const entries = readZip(Buffer.from(await res.arrayBuffer()));
    const csv = entries.find((e) => /\.csv$/i.test(e.name));
    if (!csv) throw new Error("no CSV inside the Fama/French zip");
    return parseFrenchDaily(csv.data.toString("latin1"));
  }
}
