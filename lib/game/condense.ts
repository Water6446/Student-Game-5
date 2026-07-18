// Condense long ranked lists to "top N … bottom M" with collapsible gaps.
// Pure + testable; each surface renders the gap items its own way (divider,
// expander button, …). `index` is the position in the ORIGINAL array so rank
// numbers never renumber across a gap.

export type CondensedItem<T> =
  | { kind: "row"; item: T; index: number }
  | { kind: "gap"; hidden: number };

export interface CondenseOptions {
  /** rows always shown from the top (default 5) */
  top?: number;
  /** rows always shown from the bottom (default 3) */
  bottom?: number;
  /** lists at or below this length are never condensed (default 10) */
  threshold?: number;
  /** original indices that must stay visible (e.g. the viewer's own row) */
  keepIndices?: number[];
}

export function condenseRanked<T>(rows: T[], opts: CondenseOptions = {}): CondensedItem<T>[] {
  const { top = 5, bottom = 3, threshold = 10, keepIndices = [] } = opts;

  const all = (): CondensedItem<T>[] => rows.map((item, index) => ({ kind: "row", item, index }));
  if (rows.length <= threshold) return all();

  const keep = new Set<number>(keepIndices.filter((i) => i >= 0 && i < rows.length));
  for (let i = 0; i < Math.min(top, rows.length); i++) keep.add(i);
  for (let i = Math.max(rows.length - bottom, 0); i < rows.length; i++) keep.add(i);

  // Never hide a run of exactly one row — "+1 more" is sillier than the row.
  let start: number | null = null;
  for (let i = 0; i <= rows.length; i++) {
    const hidden = i < rows.length && !keep.has(i);
    if (hidden && start == null) start = i;
    if (!hidden && start != null) {
      if (i - start === 1) keep.add(start);
      start = null;
    }
  }
  if (keep.size >= rows.length) return all();

  const out: CondensedItem<T>[] = [];
  let gap = 0;
  for (let i = 0; i < rows.length; i++) {
    if (keep.has(i)) {
      if (gap > 0) {
        out.push({ kind: "gap", hidden: gap });
        gap = 0;
      }
      out.push({ kind: "row", item: rows[i], index: i });
    } else {
      gap += 1;
    }
  }
  if (gap > 0) out.push({ kind: "gap", hidden: gap });
  return out;
}
