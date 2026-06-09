// Derive end-of-game results from DB rows: per-player ranks, wealth trajectories,
// the actual market-outcome sequence each player faced, and their counterfactual
// finals. Also builds the CSV export. Pure given its inputs (no I/O).

import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "./db";
import type { MarketOutcome, MarketScope } from "./types";
import { allStrategyOutcomes, STRATEGY_KEYS, type StrategyKey } from "./counterfactual";
import { toCsv } from "./csv";

export interface PlayerResult {
  player: PlayerRow;
  rank: number;
  finalWealth: number;
  startWealth: number;
  /** wealth after each revealed round, parallel to revealedRounds() */
  wealthByRound: number[];
  /** fraction of wealth put at risk each revealed round (null if no allocation) */
  riskByRound: (number | null)[];
  /** average dollars bet per round, ignoring rounds where the player had $0 */
  avgBet: number;
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

/** Count of GOOD outcomes in a sequence. */
export function goodCount(outcomes: MarketOutcome[]): number {
  return outcomes.reduce((n, o) => (o === "good" ? n + 1 : n), 0);
}

/**
 * The ordered market outcomes each player faced across the revealed rounds,
 * keyed by player id. Builds the allocation lookup once, so reading every
 * player's sequence (e.g. for live standings) is cheap.
 */
export function playerOutcomesMap(
  session: SessionRow,
  players: PlayerRow[],
  rounds: RoundRow[],
  allocations: AllocationRow[],
): Map<string, MarketOutcome[]> {
  const revealed = revealedRounds(rounds);
  const scope = session.config.market_scope;
  const byKey = new Map(allocations.map((a) => [`${a.round_id}:${a.player_id}`, a]));
  const result = new Map<string, MarketOutcome[]>();
  for (const p of players) {
    const out: MarketOutcome[] = [];
    for (const r of revealed) {
      const a = byKey.get(`${r.id}:${p.id}`);
      const o: MarketOutcome | null =
        scope === "independent" ? a?.market_outcome ?? null : r.market_outcome;
      if (o) out.push(o);
    }
    result.set(p.id, out);
  }
  return result;
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
    const riskByRound: (number | null)[] = [];
    let last = startWealth;
    let betSum = 0;
    let betRounds = 0;
    for (const r of revealed) {
      const a = allocByKey.get(`${r.id}:${p.id}`);
      // shared scope: the round's single outcome; independent: this player's own
      const outcome: MarketOutcome | null =
        scope === "independent" ? a?.market_outcome ?? null : r.market_outcome;
      if (outcome) outcomes.push(outcome);

      if (a) {
        const risky = Number(a.risky_amount);
        const wealthThatRound = risky + Number(a.safe_amount);
        riskByRound.push(wealthThatRound > 0 ? risky / wealthThatRound : 0);
        if (wealthThatRound > 0) {
          betSum += risky;
          betRounds += 1;
        }
      } else {
        riskByRound.push(null);
      }

      if (a?.resulting_wealth != null) last = Number(a.resulting_wealth);
      wealthByRound.push(last);
    }
    return {
      player: p,
      rank: 0,
      finalWealth: Number(p.current_wealth),
      startWealth,
      wealthByRound,
      riskByRound,
      avgBet: betRounds > 0 ? betSum / betRounds : 0,
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
  const empty = Object.fromEntries(
    STRATEGY_KEYS.map((k) => [k, startWealth]),
  ) as Record<StrategyKey, number>;

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
    strategy = Object.fromEntries(STRATEGY_KEYS.map((k) => [k, avg(k)])) as Record<
      StrategyKey,
      number
    >;
    isAverage = true;
  }

  const beatAllSafe = results.filter((r) => r.finalWealth > r.counterfactual.all_safe + 1e-9).length;
  return { scope, strategy, isAverage, beatAllSafe, total: results.length, startWealth };
}

/**
 * Build the downloadable CSV — player data only (no counterfactual columns):
 * rank, final wealth, good-rounds count + %, average bet, and per-round
 * resulting wealth + risk %.
 */
export function buildResultsCsv(results: PlayerResult[], rounds: RoundRow[]): string {
  const revealed = revealedRounds(rounds);
  const header: (string | number)[] = [
    "Rank",
    "Player",
    "Final wealth",
    "Good rounds",
    "Total rounds",
    "Good %",
    "Avg bet",
    ...revealed.flatMap((r) => [`R${r.round_number} $`, `R${r.round_number} risk %`]),
  ];
  const rows: (string | number)[][] = [header];
  for (const res of results) {
    const good = goodCount(res.outcomes);
    const total = res.outcomes.length;
    const perRound = revealed.flatMap((_, i) => {
      const risk = res.riskByRound[i];
      return [round2(res.wealthByRound[i]), risk == null ? "" : Math.round(risk * 100)];
    });
    rows.push([
      res.rank,
      res.player.display_name,
      round2(res.finalWealth),
      good,
      total,
      total ? Math.round((100 * good) / total) : 0,
      round2(res.avgBet),
      ...perRound,
    ]);
  }
  return toCsv(rows);
}
