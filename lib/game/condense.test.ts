import { describe, expect, it } from "vitest";
import { condenseRanked, type CondensedItem } from "./condense";

const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

function shape<T>(items: CondensedItem<T>[]): (T | number)[] {
  return items.map((c) => (c.kind === "row" ? c.item : -c.hidden));
}

describe("condenseRanked", () => {
  it("leaves short lists alone", () => {
    const rows = letters(10);
    const out = condenseRanked(rows);
    expect(shape(out)).toEqual(rows);
    expect(out.every((c) => c.kind === "row")).toBe(true);
  });

  it("condenses >threshold to top 5 + gap + bottom 3", () => {
    const out = condenseRanked(letters(11));
    expect(shape(out)).toEqual(["A", "B", "C", "D", "E", -3, "I", "J", "K"]);
  });

  it("preserves original indices across the gap", () => {
    const out = condenseRanked(letters(20));
    const lastRows = out.filter((c) => c.kind === "row").slice(-3);
    expect(lastRows.map((c) => c.kind === "row" && c.index)).toEqual([17, 18, 19]);
    const hidden = out.filter((c) => c.kind === "gap").reduce((s, c) => s + (c.kind === "gap" ? c.hidden : 0), 0);
    expect(hidden + out.filter((c) => c.kind === "row").length).toBe(20);
  });

  it("keepIndices splits the gap around the kept row", () => {
    const out = condenseRanked(letters(15), { keepIndices: [8] });
    expect(shape(out)).toEqual(["A", "B", "C", "D", "E", -3, "I", -3, "M", "N", "O"]);
  });

  it("never hides a run of exactly one row", () => {
    // keeping index 6 leaves index 5 as a lone hidden row → it gets shown
    const out = condenseRanked(letters(15), { keepIndices: [6] });
    expect(shape(out)).toEqual(["A", "B", "C", "D", "E", "F", "G", -5, "M", "N", "O"]);
  });

  it("custom top/bottom/threshold", () => {
    const out = condenseRanked(letters(8), { top: 2, bottom: 1, threshold: 4 });
    expect(shape(out)).toEqual(["A", "B", -5, "H"]);
  });
});
