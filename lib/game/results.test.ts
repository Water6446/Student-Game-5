import { describe, it, expect } from "vitest";
import { buildPlayerResults } from "./results";
import { DEFAULT_CONFIG } from "./types";
import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "./db";

// Minimal row factories — only the fields buildPlayerResults reads matter.
function session(): SessionRow {
  return {
    id: "s1",
    join_code: "ABCD",
    host_id: "h1",
    status: "finished",
    current_round: 3,
    config: { ...DEFAULT_CONFIG, payoff_mode: "extreme", market_scope: "independent" },
    created_at: "",
  };
}

function player(id: string, wealth: number, strategy: string | null = null): PlayerRow {
  return {
    id,
    session_id: "s1",
    auth_uid: strategy ? null : id,
    display_name: id,
    current_wealth: wealth,
    is_active: true,
    is_bot: strategy != null,
    strategy,
    joined_at: "",
  };
}

function round(id: string, n: number): RoundRow {
  return { id, session_id: "s1", round_number: n, status: "revealed", market_outcome: null, revealed_at: "" };
}

function alloc(
  roundId: string,
  playerId: string,
  risky: number,
  safe: number,
  outcome: "good" | "bad",
  resulting: number,
): AllocationRow {
  return {
    id: `${roundId}:${playerId}`,
    round_id: roundId,
    player_id: playerId,
    risky_amount: risky,
    safe_amount: safe,
    market_outcome: outcome,
    resulting_wealth: resulting,
    submitted_at: "",
  };
}

describe("buildPlayerResults riskByRound", () => {
  it("keeps a wiped-out all-risky bot at 100% risk, not 0%", () => {
    const bot = player("bot", 0, "all_risky");
    const rounds = [round("r1", 1), round("r2", 2), round("r3", 3)];
    const allocations = [
      alloc("r1", "bot", 100, 0, "good", 200), // all-in, doubles
      alloc("r2", "bot", 200, 0, "bad", 0), // all-in, wiped out
      alloc("r3", "bot", 0, 0, "bad", 0), // $0 left — 0/0 round
    ];
    const [res] = buildPlayerResults(session(), [bot], rounds, allocations);
    expect(res.riskByRound).toEqual([1, 1, 1]);
  });

  it("reports null (not 0%) for a wiped-out human", () => {
    const human = player("stu", 0);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 50, 0, "bad", 0), // bet half… of everything? risky=50, safe=0
      alloc("r2", "stu", 0, 0, "bad", 0), // nothing left to bet
    ];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.riskByRound).toEqual([1, null]);
  });

  it("still computes normal shares for funded rounds", () => {
    const human = player("stu", 105);
    const rounds = [round("r1", 1)];
    const allocations = [alloc("r1", "stu", 25, 75, "good", 125)];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.riskByRound).toEqual([0.25]);
    expect(res.avgBet).toBe(25);
  });
});
