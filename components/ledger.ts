// No "use client": plain class strings, usable from server and client alike.

/**
 * A ledger: rows ruled by hairlines between a heavy ink rule top and bottom,
 * instead of every row being its own bordered, shadowed box. Standings,
 * leaderboards and strategy lists all read like a printed scoreboard — the
 * card around them is the only raised object (DESIGN.md §4, §8).
 */
export const LEDGER = "divide-y-[1.5px] divide-ink/15 border-y-2 border-ink";

/** One ledger row: padding and a quiet hover band. Add layout per list. */
export const LEDGER_ROW = "px-2 py-2.5 transition-colors hover:bg-brand-soft/60";
