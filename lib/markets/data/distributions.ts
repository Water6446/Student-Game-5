// Spin-offs and other non-dividend cash-equivalent payouts. Pure.
//
// A free vendor's split-adjusted prices drop on a spin-off's ex-date with
// nothing paid out (Yahoo: MO falls to 0.30× on 2008-03-31). The game pays
// such a distribution as CASH, like a special dividend, worth what the
// distributed shares were worth on the ex-date:
//
//   per raw parent share  = ratio × child's raw close on the ex-date
//   per adjusted share    = that ÷ parent's split factor after the ex-date
//
// where a raw close = the vendor's adjusted close × the child's split factor
// after the ex-date. The curated list is data/universe/distributions.csv; a
// licensed source supplies these directly (docs/PAPER_TRADING_DATA.md §6).

import { parseCsv } from "./universe";
import { fromDayKey, toDayKey, type DayKey, type NormalizedSecurity, type NormalizedSplit } from "./normalize";

export interface DistributionRow {
  /** the parent's vendor symbol */
  symbol: string;
  exDate: string;
  /** the vendor symbol of the shares paid out */
  childSymbol: string;
  /** child shares per parent share */
  ratio: number;
  note: string;
}

export const DISTRIBUTION_HEADER = ["symbol", "ex_date", "child_symbol", "ratio", "note"] as const;

export function parseDistributionsCsv(text: string): DistributionRow[] {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];
  if (header.join(",") !== DISTRIBUTION_HEADER.join(",")) {
    throw new Error(`distributions header must be: ${DISTRIBUTION_HEADER.join(",")}`);
  }
  return rows.map((r, i) => {
    const [symbol, exDate, childSymbol, ratio, note] = r;
    const row = { symbol: symbol.trim(), exDate: exDate.trim(), childSymbol: childSymbol.trim(), ratio: Number(ratio), note: (note ?? "").trim() };
    if (!row.symbol || !row.childSymbol || !(row.ratio > 0)) throw new Error(`distributions line ${i + 2}: bad row`);
    toDayKey(row.exDate); // throws on a bad date
    return row;
  });
}

const factorAfter = (day: DayKey, splits: NormalizedSplit[]) =>
  splits.reduce((f, s) => (s.day > day ? f * s.ratio : f), 1);

/** How many days after the ex-date the child's first close may be. */
const FIRST_CLOSE_WINDOW = 5;

export type DistributionResult =
  | { ok: true; exDay: DayKey; amount: number; childClose: number; childDate: string }
  | { ok: false; reason: string };

/** The cash per split-adjusted parent share a distribution is worth. */
export function distributionAmount(
  row: DistributionRow,
  parent: NormalizedSecurity,
  child: NormalizedSecurity,
): DistributionResult {
  const exDay = toDayKey(row.exDate);
  if (!parent.bars.some((b) => b.day >= exDay - FIRST_CLOSE_WINDOW && b.day <= exDay + FIRST_CLOSE_WINDOW)) {
    return { ok: false, reason: `${row.symbol} has no bars around ${row.exDate}` };
  }
  const bar = child.bars.find((b) => b.day >= exDay && b.day <= exDay + FIRST_CLOSE_WINDOW);
  if (!bar) return { ok: false, reason: `${row.childSymbol} has no close within ${FIRST_CLOSE_WINDOW} days of ${row.exDate}` };
  const childRaw = bar.c * factorAfter(bar.day, child.splits);
  const perRawParent = row.ratio * childRaw;
  const amount = perRawParent / factorAfter(exDay, parent.splits);
  return { ok: true, exDay, amount, childClose: bar.c, childDate: fromDayKey(bar.day) };
}
