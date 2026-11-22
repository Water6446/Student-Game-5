import { describe, expect, it } from "vitest";
import type { AllocationRow, RoundRow } from "../../game/db";
import type { MarketPeriodResultRow } from "../db";
import { competitionRanks, indexPath, periodChanges, rankMoves } from "./host";

const round = (n: number, status: RoundRow["status"] = "revealed"): RoundRow => ({
  id: `r${n}`,
  session_id: "s",
  round_number: n,
  status,
  market_outcome: null,
  revealed_at: null,
});

// One row as resolve_round writes it for paper trading: risky + safe is the
// value at the period's start, resulting_wealth the value at its end.
const row = (n: number, player: string, start: number, end: number, exposure = 0): AllocationRow => ({
  id: `${n}${player}`,
  round_id: `r${n}`,
  player_id: player,
  risky_amount: exposure,
  safe_amount: start - exposure,
  market_outcome: null,
  resulting_wealth: end,
  submitted_at: "",
});

describe("periodChanges", () => {
  it("reads each player's change over the latest revealed period", () => {
    const rounds = [round(1), round(2), round(3, "open")];
    const allocs = [row(1, "a", 100, 110, 60), row(2, "a", 110, 104, 90), row(2, "b", 100, 120)];
    const m = periodChanges(rounds, allocs);
    expect(m.get("a")).toBeCloseTo(-6, 9);
    expect(m.get("b")).toBeCloseTo(20, 9);
    expect(periodChanges([round(1, "open")], allocs).size).toBe(0);
  });
});

describe("rank moves", () => {
  it("ranks like rank(): ties share a place and the next place is skipped", () => {
    const r = competitionRanks(new Map([["a", 5], ["b", 9], ["c", 5], ["d", 1]]));
    expect([...r.entries()]).toEqual([["a", 2], ["b", 1], ["c", 2], ["d", 4]]);
  });

  it("compares each player's place at the period's end with its start", () => {
    const rounds = [round(1), round(2)];
    const allocs = [
      row(1, "a", 100, 110),
      row(1, "b", 100, 105),
      row(1, "c", 100, 95),
      row(2, "a", 110, 100),
      row(2, "b", 105, 120),
      row(2, "c", 95, 101),
      row(2, "late", 100, 100), // joined this period, at the starting cash
    ];
    const m = rankMoves(rounds, allocs);
    expect(m.get("b")).toBe(1); // 2nd -> 1st
    expect(m.get("a")).toBe(-2); // 1st -> 3rd (tied with late)
    expect(m.get("c")).toBe(2); // 4th -> 2nd
    expect(m.get("late")).toBe(0); // 3rd -> 3rd
    expect(rankMoves(rounds, allocs, (id) => id !== "late").get("c")).toBe(1); // 3rd -> 2nd
  });

  it("is empty when everyone started the period level", () => {
    const m = rankMoves([round(1)], [row(1, "a", 100, 110), row(1, "b", 100, 90)]);
    expect(m.size).toBe(0);
  });
});

describe("indexPath", () => {
  const period = (n: number, ret: number | null) => ({ round_number: n, index_return: ret }) as MarketPeriodResultRow;

  it("compounds the index from the starting cash, period by period", () => {
    const p = indexPath([period(2, -0.1), period(1, 0.2)], 1000);
    expect(p[0]).toBeCloseTo(1200, 9);
    expect(p[1]).toBeCloseTo(1080, 9);
  });

  it("stops at the first period without a return", () => {
    expect(indexPath([period(1, 0.1), period(3, 0.1)], 100)).toHaveLength(1);
  });
});
