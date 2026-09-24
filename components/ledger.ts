// No "use client": plain class strings, usable from server and client alike.

/**
 * A ledger: rows ruled by hairlines, instead of every row being its own
 * bordered, shadowed box. Standings, leaderboards and strategy lists read like
 * a printed scoreboard. It usually sits under a Section's heavy rule and
 * heading, so its own top and bottom rules are hairlines too (DESIGN.md §8).
 */
export const LEDGER = "divide-y-[1.5px] divide-ink/15 border-y-[1.5px] border-ink/15";

/** One ledger row: padding and a quiet hover band. Add layout per list. */
export const LEDGER_ROW = "px-2 py-2.5 transition-colors hover:bg-brand-soft/60";

/**
 * An open section's rule: an ink line across the top, then the heading,
 * then content on the page — the container the game screens use instead of a
 * card. `Section` in ui.tsx wraps it; raw <section>s use this string.
 */
export const SECTION = "border-t-2 border-ink pt-3";
