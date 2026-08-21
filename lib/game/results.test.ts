import { describe, it, expect } from "vitest";
import {
  buildPlayerResults,
  buildResultsCsv,
  bustRoundByPlayer,
  classLuckSoFar,
  compareStandings,
  expectedGoodRate,
  luckStats,
  perRoundReturns,
  sharpeRatio,
  submittedHumanCount,
} from "./results";
import { sharpeText } from "./format";
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

/** Portfolio variant: the only game type that carries a risk-free rate. */
function portfolioSession(riskFree: number): SessionRow {
  return {
    ...session(),
    config: {
      ...DEFAULT_CONFIG,
      game_type: "portfolio",
      num_assets: 2,
      market_scope: "shared",
      risk_free_rate: riskFree,
    },
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

describe("submittedHumanCount", () => {
  it("excludes bots from BOTH sides even when they have allocation rows", () => {
    // resolve_round writes bot rows at reveal, which is what made the counter
    // read "5 / 1" for one network round-trip after the previous round resolved.
    const players = [
      player("stu", 100),
      player("bot1", 100, "all_safe"),
      player("bot2", 100, "all_risky"),
    ];
    const allocations = [
      alloc("r1", "stu", 10, 90, "good", 110),
      alloc("r1", "bot1", 0, 100, "good", 100),
      alloc("r1", "bot2", 100, 0, "good", 200),
    ];
    expect(submittedHumanCount(players, allocations)).toEqual({ submitted: 1, total: 1 });
  });

  it("counts humans without a row toward the total only", () => {
    const players = [player("a", 100), player("b", 100), player("c", 100)];
    const allocations = [alloc("r1", "a", 10, 90, "good", 110)];
    expect(submittedHumanCount(players, allocations)).toEqual({ submitted: 1, total: 3 });
  });

  it("never double-counts a player with more than one row", () => {
    const players = [player("a", 100)];
    const allocations = [
      alloc("r1", "a", 10, 90, "good", 110),
      { ...alloc("r1", "a", 20, 80, "good", 120), id: "dupe" },
    ];
    expect(submittedHumanCount(players, allocations)).toEqual({ submitted: 1, total: 1 });
  });

  it("is 0/0 with no players", () => {
    expect(submittedHumanCount([], [])).toEqual({ submitted: 0, total: 0 });
  });
});

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

describe("perRoundReturns", () => {
  it("computes simple per-round returns from the wealth series", () => {
    expect(perRoundReturns(100, [110, 99])).toEqual([
      expect.closeTo(0.1, 10),
      expect.closeTo(-0.1, 10),
    ]);
  });

  it("includes the wipeout −1 then stops (no 0/0 rounds)", () => {
    expect(perRoundReturns(100, [200, 0, 0])).toEqual([1, -1]);
  });

  it("returns [] for a non-positive starting wealth", () => {
    expect(perRoundReturns(0, [10, 20])).toEqual([]);
  });
});

describe("sharpeRatio", () => {
  it("is mean/popStdev of returns", () => {
    // mean 0, population stdev 0.1 → 0; with rf 0.05 → −0.5
    expect(sharpeRatio([0.1, -0.1])).toBe(0);
    expect(sharpeRatio([0.1, -0.1], 0.05)).toBeCloseTo(-0.5, 10);
  });

  it("is null for constant returns (all-safe) or short series", () => {
    expect(sharpeRatio([0.05, 0.05, 0.05])).toBeNull();
    expect(sharpeRatio([0.1])).toBeNull();
    expect(sharpeRatio([])).toBeNull();
  });
});

describe("returns + sharpe on PlayerResult", () => {
  it("populates totalReturn, perRoundReturn and sharpe", () => {
    const human = player("stu", 121);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 50, 50, "good", 110),
      alloc("r2", "stu", 55, 55, "good", 121),
    ];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.totalReturn).toBeCloseTo(0.21, 10);
    expect(res.perRoundReturn).toBeCloseTo(0.1, 10);
    // geometric identity: (1+g)^n = 1 + totalReturn
    expect(Math.pow(1 + res.perRoundReturn!, 2)).toBeCloseTo(1 + res.totalReturn!, 10);
    // both rounds returned exactly +10% → no variance → sharpe null
    expect(res.sharpe).toBeNull();
  });

  it("an all-safe player has 0 return and null sharpe", () => {
    const human = player("stu", 100);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 0, 100, "bad", 100),
      alloc("r2", "stu", 0, 100, "bad", 100),
    ];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.totalReturn).toBe(0);
    expect(res.sharpe).toBeNull();
  });

  it("a wiped-out player reads −100% with a finite negative sharpe", () => {
    const human = player("stu", 0);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 10, 90, "good", 110), // +10%
      alloc("r2", "stu", 110, 0, "bad", 0), // −100%, wiped out
    ];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.totalReturn).toBe(-1);
    expect(res.perRoundReturn).toBe(-1);
    // returns [0.1, −1] → mean −0.45, popStdev 0.55 → ≈ −0.818
    expect(res.sharpe).toBeCloseTo(-0.45 / 0.55, 10);
  });
});

describe("sharpe ratio audit", () => {
  // Series [0.2, 0, -0.1]: mean 1/30, sum of squared deviations 7/150.
  // Population variance 7/450 → sd 0.124721…; the SAMPLE answer would use 7/300.
  const series = [0.2, 0, -0.1];

  it("divides by n (population stdev), not n−1", () => {
    expect(sharpeRatio(series)!).toBeCloseTo(1 / 30 / Math.sqrt(7 / 450), 12);
    expect(sharpeRatio(series)!).toBeCloseTo(0.2672612, 6);
    // the sample-stdev answer is materially different — lock the right one
    expect(sharpeRatio(series)!).not.toBeCloseTo(1 / 30 / Math.sqrt(7 / 300), 3);
  });

  it("matches the documented wipeout example: +10% then −100% → ≈ −0.82", () => {
    // MECHANICS.md § Sharpe ratio: mean −0.45, stdev 0.55
    expect(sharpeRatio([0.1, -1])!).toBeCloseTo(-0.818, 3);
  });

  it("portfolio: an all-safe player earning exactly the risk-free rate is '—'", () => {
    // rf = 2%/round and nothing at risk → every return is exactly 0.02 → no
    // variance → undefined, not 0.
    const human = player("stu", 104.04);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 0, 100, "good", 102),
      alloc("r2", "stu", 0, 102, "good", 104.04),
    ];
    const [res] = buildPlayerResults(portfolioSession(0.02), [human], rounds, allocations);
    expect(res.sharpe).toBeNull();
    expect(sharpeText(res.sharpe)).toBe("—");
  });

  it("basic: the config carries no risk_free_rate, so rf is 0", () => {
    // CreateSessionForm sends risk_free_rate: undefined for basic games, JSON
    // drops undefined keys, and create_session's defaults never add it.
    const s = session();
    expect("risk_free_rate" in s.config).toBe(false);

    const human = player("stu", 108);
    const rounds = [round("r1", 1), round("r2", 2), round("r3", 3)];
    const allocations = [
      alloc("r1", "stu", 100, 0, "good", 120), // +20%
      alloc("r2", "stu", 0, 120, "bad", 120), // 0%
      alloc("r3", "stu", 120, 0, "bad", 108), // −10%
    ];
    const [res] = buildPlayerResults(s, [human], rounds, allocations);
    expect(res.wealthByRound).toEqual([120, 120, 108]);
    // equals sharpeRatio(series, 0); any non-zero rf would shift it
    expect(res.sharpe).toBeCloseTo(sharpeRatio(series, 0)!, 12);
  });

  it("a 1-round game is null, not 0", () => {
    const human = player("stu", 150);
    const rounds = [round("r1", 1)];
    const allocations = [alloc("r1", "stu", 50, 50, "good", 150)];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.wealthByRound).toEqual([150]);
    expect(res.sharpe).toBeNull();
  });

  it("a late joiner's missed rounds count as 0% returns", () => {
    // wealthByRound carries the last value forward, so a round with no
    // allocation reads as flat and drags the stdev down. Documented behaviour —
    // asserted so it cannot change silently.
    const human = player("late", 120);
    const rounds = [round("r1", 1), round("r2", 2), round("r3", 3)];
    const allocations = [
      alloc("r2", "late", 100, 0, "good", 120),
      alloc("r3", "late", 0, 120, "bad", 120),
    ];
    const [res] = buildPlayerResults(session(), [human], rounds, allocations);
    expect(res.wealthByRound).toEqual([100, 120, 120]);
    expect(perRoundReturns(100, res.wealthByRound)).toEqual([
      0,
      expect.closeTo(0.2, 10),
      0,
    ]);
    expect(res.sharpe).toBeCloseTo(sharpeRatio([0, 0.2, 0])!, 12);
  });

  it("CSV: blank Sharpe cell for an all-safe player, at a stable column", () => {
    const human = player("safe", 100);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "safe", 0, 100, "bad", 100),
      alloc("r2", "safe", 0, 100, "bad", 100),
    ];
    const results = buildPlayerResults(session(), [human], rounds, allocations);
    const csv = buildResultsCsv(results, rounds, false, 0.6);
    const [header, row] = csv.split("\r\n");
    const h = header.split(",");
    expect(h.indexOf("Sharpe")).toBe(9);
    expect(row.split(",")[h.indexOf("Sharpe")]).toBe("");
  });
});

describe("expectedGoodRate", () => {
  it("basic game: the session good_prob", () => {
    expect(expectedGoodRate({ ...DEFAULT_CONFIG, good_prob: 0.55 })).toBe(0.55);
  });

  it("portfolio: mean of per-asset probs, falling back to good_prob", () => {
    expect(
      expectedGoodRate({
        ...DEFAULT_CONFIG,
        game_type: "portfolio",
        num_assets: 2,
        assets: [{ good_prob: 0.8 }, { good_prob: 0.4 }],
      }),
    ).toBeCloseTo(0.6, 10);
    // missing per-asset entries fall back to the game-level prob
    expect(
      expectedGoodRate({ ...DEFAULT_CONFIG, game_type: "portfolio", num_assets: 3 }),
    ).toBeCloseTo(0.6, 10);
  });
});

describe("luckStats", () => {
  it("signs the delta both ways and computes the ±1σ band", () => {
    const lucky = luckStats(18, 25, 0.6)!;
    expect(lucky.delta).toBeCloseTo(0.12, 10);
    expect(lucky.sigma).toBeCloseTo(Math.sqrt((0.6 * 0.4) / 25), 10);
    const unlucky = luckStats(2, 4, 0.6)!;
    expect(unlucky.delta).toBeCloseTo(-0.1, 10);
  });

  it("is null with no draws", () => {
    expect(luckStats(0, 0, 0.6)).toBeNull();
  });
});

describe("classLuckSoFar", () => {
  it("counts shared draws across revealed rounds", () => {
    const rounds: RoundRow[] = [
      { ...round("r1", 1), market_outcome: "good" },
      { ...round("r2", 2), market_outcome: "bad" },
      { ...round("r3", 3), market_outcome: "good" },
    ];
    const stats = classLuckSoFar({ ...DEFAULT_CONFIG, good_prob: 0.6 }, rounds)!;
    expect(stats.good).toBe(2);
    expect(stats.total).toBe(3);
    expect(stats.delta).toBeCloseTo(2 / 3 - 0.6, 10);
  });

  it("is null when rounds carry no shared outcome (independent scope)", () => {
    expect(classLuckSoFar(DEFAULT_CONFIG, [round("r1", 1)])).toBeNull();
  });
});

describe("bust ordering", () => {
  it("records each player's first $0 round and orders later busts higher", () => {
    const rounds = [round("r1", 1), round("r2", 2), round("r3", 3)];
    const allocations = [
      alloc("r1", "early", 100, 0, "bad", 0), // busts round 1
      alloc("r2", "late", 100, 0, "bad", 0), // busts round 2
      alloc("r3", "early", 0, 0, "bad", 0), // still 0 — not a new bust
    ];
    const bust = bustRoundByPlayer(rounds, allocations);
    expect(bust.get("early")).toBe(1);
    expect(bust.get("late")).toBe(2);

    const a = { id: "early", current_wealth: 0 };
    const b = { id: "late", current_wealth: 0 };
    const sorted = [a, b].sort((x, y) => compareStandings(x, y, bust));
    expect(sorted.map((p) => p.id)).toEqual(["late", "early"]); // first to bust sits last
    // wealth still dominates; equal non-busted wealth is a stable tie
    expect(compareStandings({ id: "x", current_wealth: 50 }, a, bust)).toBeLessThan(0);
    expect(compareStandings({ id: "x", current_wealth: 50 }, { id: "y", current_wealth: 50 }, bust)).toBe(0);
  });
});

describe("buildResultsCsv new columns", () => {
  it("appends return/sharpe/luck columns after Avg bet, blank-safe", () => {
    const human = player("stu", 121);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 50, 50, "good", 110),
      alloc("r2", "stu", 55, 55, "good", 121),
    ];
    const results = buildPlayerResults(session(), [human], rounds, allocations);
    const csv = buildResultsCsv(results, rounds, false, 0.6);
    const [header, row] = csv.split("\r\n");
    expect(header).toContain("Avg bet,Total return %,Per-round %,Sharpe,Luck vs expected %");
    const cells = row.split(",");
    const h = header.split(",");
    expect(cells[h.indexOf("Total return %")]).toBe("21");
    expect(cells[h.indexOf("Per-round %")]).toBe("10");
    expect(cells[h.indexOf("Sharpe")]).toBe(""); // constant returns → null → blank
    expect(cells[h.indexOf("Luck vs expected %")]).toBe("40"); // 2/2 good vs 0.6 → +40
  });
});

describe("buildResultsCsv — manager game", () => {
  function managerSession(): SessionRow {
    return {
      ...session(),
      config: {
        ...DEFAULT_CONFIG,
        game_type: "manager",
        market_scope: "shared",
        num_managers: 2,
        risk_free_rate: 0.03,
      },
    };
  }

  function managerRound(id: string, n: number, market: number, mgrs: number[]): RoundRow {
    return { ...round(id, n), market_return: market, manager_returns: mgrs };
  }

  function feeAlloc(
    roundId: string,
    playerId: string,
    risky: number,
    safe: number,
    resulting: number,
    fees: number,
  ): AllocationRow {
    return { ...alloc(roundId, playerId, risky, safe, "good", resulting), fees_paid: fees };
  }

  it("swaps the luck column for fees and the index comparison", () => {
    const human = player("stu", 118);
    const rounds = [
      managerRound("r1", 1, 0.1, [0.12, 0.08]),
      managerRound("r2", 2, -0.05, [-0.04, -0.06]),
    ];
    const allocations = [
      feeAlloc("r1", "stu", 100, 0, 111, 1),
      feeAlloc("r2", "stu", 111, 0, 118, 1.11),
    ];
    const results = buildPlayerResults(managerSession(), [human], rounds, allocations);
    const csv = buildResultsCsv(results, rounds, false, 0.6, true, 104.5);
    const lines = csv.split("\r\n");
    const h = lines[0].split(",");
    const cells = lines[1].split(",");

    expect(h).toContain("Total fees");
    expect(h).toContain("vs Index");
    expect(h).not.toContain("Luck vs expected %"); // no good/bad draws here
    expect(cells[h.indexOf("Total fees")]).toBe("2.11");
    expect(cells[h.indexOf("Index final")]).toBe("104.5");
    expect(cells[h.indexOf("vs Index")]).toBe("13.5");
    // per-year columns are YEARS, and carry the fee
    expect(h).toContain("Y1 exposure %");
    expect(cells[h.indexOf("Y2 fees $")]).toBe("1.11");
  });

  it("appends a per-year block of the index and manager returns", () => {
    const human = player("stu", 100);
    const rounds = [managerRound("r1", 1, 0.1, [0.12, 0.08])];
    const results = buildPlayerResults(managerSession(), [human], rounds, []);
    const lines = buildResultsCsv(results, rounds, false, undefined, true, 110).split("\r\n");

    // blank separator, then a second header, then one row per year
    const sep = lines.findIndex((l) => l === "");
    expect(sep).toBeGreaterThan(0);
    expect(lines[sep + 1]).toBe("Year,Index return %,Manager 1 return %,Manager 2 return %");
    expect(lines[sep + 2]).toBe("1,10,12,8");
  });

  it("leaves the other two games' CSV untouched", () => {
    const human = player("stu", 121);
    const rounds = [round("r1", 1), round("r2", 2)];
    const allocations = [
      alloc("r1", "stu", 50, 50, "good", 110),
      alloc("r2", "stu", 55, 55, "good", 121),
    ];
    const results = buildPlayerResults(session(), [human], rounds, allocations);
    const h = buildResultsCsv(results, rounds, false, 0.6).split("\r\n")[0].split(",");
    expect(h).toContain("Luck vs expected %");
    expect(h).not.toContain("Total fees");
    expect(h).toContain("R1 risk %");
  });
});

describe("manager games have no good/bad draws", () => {
  it("produces empty outcomes, which makes the strategy counterfactual degenerate", () => {
    // resolve_round writes market_outcome = null for a manager round — returns
    // are continuous. So `outcomes` is empty, every strategy replays zero draws,
    // and all four counterfactual cards come out at the starting wealth. That is
    // why HostSummary suppresses the card for this game type rather than showing
    // four identical $100s.
    const s: SessionRow = {
      ...session(),
      config: { ...DEFAULT_CONFIG, game_type: "manager", market_scope: "shared" },
    };
    const human = player("stu", 118);
    const rounds = [
      { ...round("r1", 1), market_return: 0.1, manager_returns: [0.12] },
      { ...round("r2", 2), market_return: -0.05, manager_returns: [-0.04] },
    ];
    const allocations = [
      alloc("r1", "stu", 100, 0, "good", 111),
      alloc("r2", "stu", 111, 0, "good", 118),
    ];
    const [res] = buildPlayerResults(s, [human], rounds, allocations);

    expect(res.outcomes).toEqual([]);
    // every strategy returns the untouched starting wealth
    const values = Object.values(res.counterfactual ?? {});
    expect(values).toHaveLength(4);
    for (const v of values) expect(v).toBe(s.config.starting_wealth);
    // meanwhile the real wealth series is fine — the game itself works
    expect(res.wealthByRound).toEqual([111, 118]);
    expect(res.totalReturn).toBeCloseTo(0.18, 10);
  });

  it("leaves luck undefined, so the Luck card would read 'no draws'", () => {
    expect(luckStats(0, 0, 0.6)).toBeNull();
  });
});
