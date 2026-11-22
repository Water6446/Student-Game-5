// The curated universe list (data/universe/top_by_year.csv) and the rule for
// which of its companies a session may trade. Pure.
//
// The list ranks the ~50 largest US companies by market cap at each 5-year
// ANCHOR (1965, 1970, …). A session starting in year S uses the latest anchor
// at or before S and walks down the ranks, taking the first N companies that
// are ELIGIBLE: real history from the start of pre-window history, and either
// data through the end of the window or a known delisting inside it.

import { toDayKey, type DayKey } from "./normalize";

export type UniverseStatus = "listed" | "acquired" | "merged" | "bankrupt" | "delisted";
export type Confidence = "high" | "medium" | "low";

export interface UniverseRow {
  anchorYear: number;
  rank: number;
  /** the real company name at the time (never shown to students before the end) */
  name: string;
  /** the real ticker it traded under at the time */
  ticker: string;
  sector: string;
  /** the Yahoo symbol whose history is THIS company, or null when Yahoo has none */
  yahooSymbol: string | null;
  /** what happened to it later */
  status: UniverseStatus;
  /** true once Max has checked the row */
  verified: boolean;
  /** how sure the draft is of the rank */
  confidence: Confidence;
  note: string;
}

export const UNIVERSE_HEADER = [
  "anchor_year",
  "rank",
  "name",
  "ticker",
  "sector",
  "yahoo_symbol",
  "status",
  "verified",
  "confidence",
  "note",
] as const;

/** Broad sector labels, the only industry detail a student ever sees. */
export const SECTORS = [
  "Communications",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Materials",
  "Technology",
  "Utilities",
  "Real Estate",
] as const;
export type Sector = (typeof SECTORS)[number];

export const ANCHOR_STEP = 5;
export const FIRST_ANCHOR = 1965;

const STATUSES: readonly UniverseStatus[] = ["listed", "acquired", "merged", "bankrupt", "delisted"];
const CONFIDENCES: readonly Confidence[] = ["high", "medium", "low"];

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Parse and validate the universe CSV. Throws with every problem listed. */
export function parseUniverseCsv(text: string): UniverseRow[] {
  const rows = parseCsv(text);
  const problems: string[] = [];
  const header = rows.shift() ?? [];
  if (header.join(",") !== UNIVERSE_HEADER.join(",")) {
    throw new Error(`universe header must be: ${UNIVERSE_HEADER.join(",")}`);
  }
  const out: UniverseRow[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    if (r.length !== UNIVERSE_HEADER.length) {
      problems.push(`line ${line}: ${r.length} fields, expected ${UNIVERSE_HEADER.length}`);
      return;
    }
    const [anchor, rank, name, ticker, sector, yahoo, status, verified, confidence, note] = r;
    const row: UniverseRow = {
      anchorYear: Number(anchor),
      rank: Number(rank),
      name: name.trim(),
      ticker: ticker.trim(),
      sector: sector.trim(),
      yahooSymbol: yahoo.trim() ? yahoo.trim() : null,
      status: status.trim() as UniverseStatus,
      verified: verified.trim() === "true",
      confidence: confidence.trim() as Confidence,
      note: note.trim(),
    };
    if (!Number.isInteger(row.anchorYear) || (row.anchorYear - FIRST_ANCHOR) % ANCHOR_STEP !== 0) {
      problems.push(`line ${line}: bad anchor year ${anchor}`);
    }
    if (!Number.isInteger(row.rank) || row.rank < 1) problems.push(`line ${line}: bad rank ${rank}`);
    if (!row.name) problems.push(`line ${line}: missing name`);
    if (!row.ticker) problems.push(`line ${line}: missing ticker`);
    if (!(SECTORS as readonly string[]).includes(row.sector)) {
      problems.push(`line ${line}: unknown sector ${sector}`);
    }
    if (!STATUSES.includes(row.status)) problems.push(`line ${line}: unknown status ${status}`);
    if (!CONFIDENCES.includes(row.confidence)) {
      problems.push(`line ${line}: unknown confidence ${confidence}`);
    }
    if (verified.trim() !== "true" && verified.trim() !== "false") {
      problems.push(`line ${line}: verified must be true or false`);
    }
    out.push(row);
  });
  const seen = new Set<string>();
  for (const row of out) {
    const k = `${row.anchorYear}:${row.rank}`;
    if (seen.has(k)) problems.push(`duplicate rank ${row.rank} in ${row.anchorYear}`);
    seen.add(k);
  }
  if (problems.length) throw new Error(`universe CSV:\n  ${problems.join("\n  ")}`);
  return out;
}

/** The anchor a session starting in `startYear` uses: the latest at or before it. */
export function anchorFor(startYear: number, anchors: number[]): number | null {
  let best: number | null = null;
  for (const a of anchors) if (a <= startYear && (best === null || a > best)) best = a;
  return best;
}

/** What the universe rule needs to know about one security's history. */
export interface Availability {
  first: DayKey;
  last: DayKey;
  delistDay: DayKey | null;
}

export interface WindowSpec {
  startYear: number;
  /** years of real history shown before Year 1 */
  historyYears: number;
  /** last day key of the window (inclusive) */
  windowEndDay: DayKey;
}

/** A history starting within this many days of Jan 1 counts as "from Jan 1". */
const START_TOLERANCE_DAYS = 10;

export type IneligibleReason = "no_history" | "starts_too_late" | "ends_too_early";

/** null = eligible; otherwise why not. */
export function ineligibility(a: Availability | undefined, w: WindowSpec): IneligibleReason | null {
  if (!a) return "no_history";
  const historyStart = toDayKey(`${w.startYear - w.historyYears}-01-01`);
  const windowStart = toDayKey(`${w.startYear}-01-01`);
  if (a.first > historyStart + START_TOLERANCE_DAYS) return "starts_too_late";
  // a known delisting inside the window is fine (and wanted: survivorship)
  if (a.delistDay !== null && a.delistDay >= windowStart && a.delistDay <= w.windowEndDay) return null;
  // the end of the window can fall on a weekend or holiday
  if (a.last < w.windowEndDay - START_TOLERANCE_DAYS) return "ends_too_early";
  return null;
}

export interface UniversePick {
  anchor: number | null;
  picked: UniverseRow[];
  skipped: { row: UniverseRow; reason: IneligibleReason }[];
}

/**
 * The first `n` eligible companies of the anchor for `w.startYear`, in rank
 * order. `resolve` maps a row to its availability (by Yahoo symbol in dev).
 */
export function selectUniverse(
  rows: UniverseRow[],
  resolve: (row: UniverseRow) => Availability | undefined,
  w: WindowSpec,
  n: number,
): UniversePick {
  const anchors = [...new Set(rows.map((r) => r.anchorYear))];
  const anchor = anchorFor(w.startYear, anchors);
  const picked: UniverseRow[] = [];
  const skipped: UniversePick["skipped"] = [];
  if (anchor === null) return { anchor, picked, skipped };
  const ranked = rows.filter((r) => r.anchorYear === anchor).sort((a, b) => a.rank - b.rank);
  for (const row of ranked) {
    if (picked.length >= n) break;
    const reason = ineligibility(resolve(row), w);
    if (reason) skipped.push({ row, reason });
    else picked.push(row);
  }
  return { anchor, picked, skipped };
}
