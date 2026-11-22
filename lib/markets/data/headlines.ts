// Market headlines: the curated file (data/headlines/market_headlines.json)
// plus plain data-derived lines for the months it leaves out. Pure.
//
// Curated entries describe real events in plain words with no company names,
// people, places, years or era-specific terms; validateHeadlineText catches the
// mechanical slips (a year, a blocked term). Judgement about subtler era
// giveaways stays with the human review (`reviewed`).

export interface HeadlineEntry {
  /** "YYYY-MM" */
  month: string;
  /** 1 = the month's lead headline (the projector shows rank 1) */
  rank: number;
  text: string;
  /** false until Max has checked it */
  reviewed: boolean;
  /** set when the draft is unsure of the facts or the wording */
  flag?: string;
}

export interface HeadlineFile {
  note: string;
  entries: HeadlineEntry[];
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Words and patterns that date a headline or name a place or person. Not a
 * complete list; it catches the obvious slips. Matching is case-insensitive
 * and on word boundaries.
 */
export const BLOCKED_TERMS = [
  // eras, coined names and dated technology
  "dot-com", "dotcom", "internet", "web", "online", "e-commerce", "smartphone", "app",
  "crypto", "bitcoin", "blockchain", "subprime", "y2k", "millennium", "baby boom",
  "cold war", "great depression", "great recession", "stagflation era",
  "pandemic", "covid", "coronavirus", "brexit", "euro", "artificial intelligence",
  "space race", "moon landing",
  // people and institutions by name
  "volcker", "greenspan", "bernanke", "yellen", "powell", "nixon", "reagan", "carter",
  "kennedy", "johnson", "clinton", "bush", "obama", "trump", "biden", "watergate",
  "opec", "fed chair", "lehman", "enron",
  // places
  "america", "american", "u.s.", "united states", "washington", "wall street", "new york",
  "china", "chinese", "japan", "japanese", "russia", "soviet", "europe", "european",
  "middle east", "gulf", "iraq", "iran", "kuwait", "vietnam", "korea", "mexico",
  "asia", "asian", "britain", "british", "germany", "london", "tokyo",
] as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BLOCKED_RE = new RegExp(
  `(?:^|[^a-z0-9])(${BLOCKED_TERMS.map(escapeRe).join("|")})(?=$|[^a-z0-9])`,
  "i",
);
const YEARISH = /\b(1[89]\d{2}|20\d{2})s?\b|\b'\d0s\b|\b\d0s\b/;

/** Problems with one headline's wording; empty when it passes. */
export function validateHeadlineText(text: string): string[] {
  const problems: string[] = [];
  const t = text.trim();
  if (!t) problems.push("empty");
  if (t.length > 140) problems.push("longer than 140 characters");
  if (YEARISH.test(t)) problems.push("contains a year or decade");
  const m = BLOCKED_RE.exec(t);
  if (m) problems.push(`contains "${m[1]}"`);
  return problems;
}

/** Problems with the whole file; empty when it passes. */
export function validateHeadlineFile(file: HeadlineFile, fromMonth = "1957-01", toMonth = "2026-12"): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of file.entries) {
    const where = `${e.month} #${e.rank}`;
    if (!MONTH.test(e.month)) problems.push(`${where}: bad month`);
    else if (e.month < fromMonth || e.month > toMonth) problems.push(`${where}: outside ${fromMonth}..${toMonth}`);
    if (!Number.isInteger(e.rank) || e.rank < 1) problems.push(`${where}: bad rank`);
    const key = `${e.month}:${e.rank}`;
    if (seen.has(key)) problems.push(`${where}: duplicate`);
    seen.add(key);
    if (typeof e.reviewed !== "boolean") problems.push(`${where}: reviewed must be a boolean`);
    for (const p of validateHeadlineText(e.text)) problems.push(`${where}: ${p}`);
  }
  return problems;
}

/**
 * A plain line for a month with no curated headline, from the market's return
 * that month. Several wordings per band, picked by the month so neighbouring
 * quiet months do not repeat word for word.
 */
export function generatedHeadline(month: string, marketReturn: number): string {
  const bands: [number, string[]][] = [
    [-0.1, [
      "Stocks plunge as selling sweeps the market",
      "A steep sell-off erases months of gains",
    ]],
    [-0.05, [
      "Stocks fall sharply in a broad sell-off",
      "Investors dump shares as prices slide",
    ]],
    [-0.02, [
      "Stocks slip as investors turn cautious",
      "Shares drift lower on thin enthusiasm",
    ]],
    [0.02, [
      "Stocks drift in a quiet month",
      "A calm month leaves prices little changed",
    ]],
    [0.05, [
      "Stocks edge higher in steady trading",
      "Shares climb as buyers return",
    ]],
    [0.1, [
      "Stocks rally broadly",
      "A strong month lifts most shares",
    ]],
    [Infinity, [
      "Stocks surge in one of the strongest months in years",
      "A powerful rally sends prices soaring",
    ]],
  ];
  const [, options] = bands.find(([upper]) => marketReturn < upper) ?? bands[bands.length - 1];
  const seed = [...month].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return options[seed % options.length];
}

export interface PeriodHeadline {
  month: string;
  text: string;
  generated: boolean;
}

/**
 * The lead headline for each month of a period. A month with a curated rank-1
 * entry uses it; any other month gets a generated line from its market return.
 * Weekly rounds pass the one containing month.
 */
export function headlinesForMonths(
  entries: HeadlineEntry[],
  months: string[],
  marketReturnOf: (month: string) => number,
): PeriodHeadline[] {
  const lead = new Map<string, HeadlineEntry>();
  for (const e of entries) {
    const cur = lead.get(e.month);
    if (!cur || e.rank < cur.rank) lead.set(e.month, e);
  }
  return months.map((month) => {
    const e = lead.get(month);
    return e
      ? { month, text: e.text, generated: false }
      : { month, text: generatedHeadline(month, marketReturnOf(month)), generated: true };
  });
}
