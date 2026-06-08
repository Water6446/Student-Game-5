// Derive end-of-game results from DB rows: per-player ranks, wealth trajectories,
// the actual market-outcome sequence each player faced, and their counterfactual
// finals. Also builds the CSV export. Pure given its inputs (no I/O).

import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "./db";
import type { MarketOutcome, MarketScope } from "./types";
import { allStrategyOutcomes, edgeFraction, type StrategyKey } from "./counterfactual";
import { toCsv } from "./csv";

export interface PlayerResult {
  player: PlayerRow;
  rank: number;
  finalWealth: number;
  startWealth: number;
  /** wealth after each revealed round, parallel to revealedRounds() */
  wealthByRound: number[];
  /** the actual outcome sequence this player faced */
  outcomes: MarketOutcome[];
  counterfactual: Record<StrategyKey, number>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function revealedRounds(rounds: RoundRow[]): RoundRow[] {
  return rounds
    .filter((r) => r.status === "revealed")
    .sort((a, b) => a.round_number - b.round_number);
}

export function buildPlayerResults(
  session: SessionRow,
  players: PlayerRow[],
  rounds: RoundRow[],
  allocations: AllocationRow[],
): PlayerResult[] {
  const revealed = revealedRounds(rounds);
  const scope = session.config.market_scope;
  const mode = session.config.payoff_mode;
  const startWealth = session.config.starting_wealth;
  const goodProb = session.config.good_prob ?? 0.6;

  const allocByKey = new Map<string, AllocationRow>();
  for (const a of allocations) allocByKey.set(`${a.round_id}:${a.player_id}`, a);

  const results: PlayerResult[] = players.map((p) => {
    const outcomes: MarketOutcome[] = [];
    const wealthByRound: number[] = [];
    let last = startWealth;
    for (const r of revealed) {
      const a = allocByKey.get(`${r.id}:${p.id}`);
      // shared scope: the round's single outcome; independent: this player's own
      const outcome: MarketOutcome | null =
        scope === "independent" ? a?.market_outcome ?? null : r.market_outcome;
      if (outcome) outcomes.push(outcome);
      if (a?.resulting_wealth != null) last = Number(a.resulting_wealth);
      wealthByRound.push(last);
    }
    return {
      player: p,
      rank: 0,
      finalWealth: Number(p.current_wealth),
      startWealth,
      wealthByRound,
      outcomes,
      counterfactual: allStrategyOutcomes(startWealth, outcomes, mode, goodProb),
    };
  });

  // standard competition ranking (1,2,2,4) by final wealth descending
  results.sort((a, b) => b.finalWealth - a.finalWealth);
  let rank = 0;
  let prev = Number.POSITIVE_INFINITY;
  results.forEach((r, i) => {
    if (r.finalWealth < prev - 1e-9) {
      rank = i + 1;
      prev = r.finalWealth;
    }
    r.rank = rank;
  });
  return results;
}

export interface ClassCounterfactual {
  scope: MarketScope;
  /** shared: exact strategy finals (identical for everyone); independent: class averages */
  strategy: Record<StrategyKey, number>;
  isAverage: boolean;
  beatAllSafe: number;
  total: number;
  startWealth: number;
}

export function classCounterfactual(
  session: SessionRow,
  results: PlayerResult[],
): ClassCounterfactual {
  const scope = session.config.market_scope;
  const startWealth = session.config.starting_wealth;
  const empty = {
    all_safe: startWealth,
    edge: startWealth,
    fifty_fifty: startWealth,
    all_risky: startWealth,
  };

  if (results.length === 0) {
    return { scope, strategy: empty, isAverage: false, beatAllSafe: 0, total: 0, startWealth };
  }

  let strategy: Record<StrategyKey, number>;
  let isAverage: boolean;
  if (scope === "shared") {
    strategy = results[0].counterfactual; // same outcomes → same for all
    isAverage = false;
  } else {
    const avg = (k: StrategyKey) =>
      results.reduce((s, r) => s + r.counterfactual[k], 0) / results.length;
    strategy = {
      all_safe: avg("all_safe"),
      edge: avg("edge"),
      fifty_fifty: avg("fifty_fifty"),
      all_risky: avg("all_risky"),
    };
    isAverage = true;
  }

  const beatAllSafe = results.filter((r) => r.finalWealth > r.counterfactual.all_safe + 1e-9).length;
  return { scope, strategy, isAverage, beatAllSafe, total: results.length, startWealth };
}

/** Build the downloadable CSV: one row per player + a trailing round-outcome table. */
export function buildResultsCsv(
  session: SessionRow,
  results: PlayerResult[],
  rounds: RoundRow[],
): string {
  const revealed = revealedRounds(rounds);
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);
  const header: (string | number)[] = [
    "Rank",
    "Player",
    "Final wealth",
    ...revealed.map((r) => `Round ${r.round_number}`),
    "All-safe",
    `Edge (${edgePct}%)`,
    "50/50",
    "All-risky",
  ];
  const rows: (string | number)[][] = [header];
  for (const res of results) {
    rows.push([
      res.rank,
      res.player.display_name,
      round2(res.finalWealth),
      ...res.wealthByRound.map(round2),
      round2(res.counterfactual.all_safe),
      round2(res.counterfactual.edge),
      round2(res.counterfactual.fifty_fifty),
      round2(res.counterfactual.all_risky),
    ]);
  }
  // blank separator, then the market outcome per round
  rows.push([]);
  rows.push(["Round", "Market"]);
  for (const r of revealed) rows.push([r.round_number, r.market_outcome ?? "independent"]);

  return toCsv(rows);
}
