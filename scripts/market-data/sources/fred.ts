// FRED: the 3-month Treasury bill, secondary market, discount basis (DTB3),
// daily from 1954. Published by the Federal Reserve Board (H.15) and served by
// the St. Louis Fed. Terms as read are in docs/PAPER_TRADING_DATA.md; treated as
// dev-only until confirmed for display.
//
// The CSV endpoint needs no API key. Missing days are "." (older format) or an
// empty cell (current format).

import type { RateSource } from "../../../lib/markets/data/price-source";
import { parseCsv } from "../../../lib/markets/data/universe";

export const DTB3_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3";

export function parseFredCsv(text: string): { date: string; percent: number | null }[] {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  if (header.length < 2 || !/date/i.test(header[0])) {
    throw new Error(`unexpected FRED header: ${header.join(",")}`);
  }
  return rows
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r[0]))
    .map((r) => {
      const v = r[1]?.trim();
      const n = v && v !== "." ? Number(v) : NaN;
      return { date: r[0], percent: Number.isFinite(n) ? n : null };
    });
}

export class FredTBillSource implements RateSource {
  readonly id = "fred-dtb3";
  readonly license = "dev-only" as const;

  async fetchShortRate() {
    const res = await fetch(DTB3_CSV_URL, { headers: { "user-agent": "market-data-importer" } });
    if (!res.ok) throw new Error(`FRED DTB3: HTTP ${res.status}`);
    return parseFredCsv(await res.text());
  }
}
