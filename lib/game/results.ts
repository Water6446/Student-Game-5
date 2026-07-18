// Derive end-of-game results from DB rows: per-player ranks, wealth trajectories,
// the actual market-outcome sequence each player faced, and their counterfactual
// finals. Also builds the CSV export. Pure given its inputs (no I/O).

import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "./db";
import { isPortfolio, type MarketOutcome, type MarketScope } from "./types";
import {
  allStrategyOutcomes,
  strategyFraction,
  STRATEGY_KEYS,
  type StrategyKey,
} from "./counterfactual";
import {
  allPortfolioStrategyOutcomes,
  assetGoodProb,
  numAssets,
  portfolioStrategyFraction,
  PORTFOLIO_STRATEGY_KEYS,
  type PortfolioStrategyKey,
} from "./portfolio";
import type { SessionConfig } from "./types";
import { toCsv } from "./csv";

export interface PlayerResult {
  player: PlayerRow;
  rank: number;
  finalWealth: number;
  startWealth: number;
  /** wealth after each revealed round, parallel to revealedRounds() */
  wealthByRound: number[];
  /**
   * fraction of wealth put at risk each revealed round. A wiped-out ($0) round
   * has no meaningful share: a bot keeps its fixed strategy share (all-risky
   * stays 100%), a human is null. Also null when there is no allocation row.
   */
  riskByRound: (number | null)[];
  /** average dollars bet per round, ignoring rounds where the player had $0 */
  avgBet: number;
  /**
   * the actual outcome sequence this player faced. Basic game: one draw per
   * round. Portfolio game: every asset draw, flattened round by round (so
   * goodCount/length still read as the player's luck).
   */
  outcomes: MarketOutcome[];
  /** finalWealth/startWealth − 1 (−1 when wiped out); null with no revealed rounds */
  totalReturn: number | null;
  /** geometric per-round rate: (finalWealth/startWealth)^(1/n) − 1; null with no revealed rounds */
  perRoundReturn: number | null;
  /** mean(r − rf) / population stdev(r) over per-round returns; null when <2
   *  usable returns or stdev ≈ 0 (e.g. an all-safe player) */
  sharpe: number | null;
  /** basic game only */
  counterfactual?: Record<StrategyKey, number>;
  /** portfolio game only */
  portfolioCounterfactual?: Record<PortfolioStrategyKey, number>;
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
 * Portfolio game: the per-round asset-outcome vectors a player faced across
 * revealed rounds (shared scope: the class-wide draws; independent: their own).
 */
export function portfolioOutcomeMatrix(
  session: SessionRow,
  rounds: RoundRow[],
  allocations: AllocationRow[],
  playerId: string,
): MarketOutcome[][] {
  const revealed = revealedRounds(rounds);
  const independent = session.config.market_scope === "independent";
  const byKey = new Map(allocations.map((a) => [`${a.round_id}:${a.player_id}`, a]));
  const out: MarketOutcome[][] = [];
  for (const r of revealed) {
    const arr = independent
      ? byKey.get(`${r.id}:${playerId}`)?.asset_outcomes
      : r.market_outcomes;
    if (arr && arr.length > 0) out.push(arr);
  }
  return out;
}

/**
 * Per-round wealth-change chips for the standings when there is no single
 * market outcome (portfolio game): "good" = gained that round, "bad" = lost.
 * Flat rounds (all-safe, wiped-out) add no chip.
 */
export function playerDeltaChipsMap(
  rounds: RoundRow[],
  allocations: AllocationRow[],
): Map<string, MarketOutcome[]> {
  const revealed = revealedRounds(rounds);
  const result = new Map<string, MarketOutcome[]>();
  for (const r of revealed) {
    for (const a of allocations) {
      if (a.round_id !== r.id || a.resulting_wealth == null) continue;
      const before = Number(a.risky_amount) + Number(a.safe_amount);
      const delta = Number(a.resulting_wealth) - before;
      if (Math.abs(delta) < 1e-9) continue;
      const list = result.get(a.player_id) ?? [];
      list.push(delta > 0 ? "good" : "bad");
      result.set(a.player_id, list);
    }
  }
  return result;
}

/** GOOD draws across a whole outcome matrix (portfolio luck numerator). */
export function goodCountMatrix(matrix: MarketOutcome[][]): { good: number; total: number } {
  let good = 0;
  let total = 0;
  for (const row of matrix) {
    for (const o of row) {
      total += 1;
      if (o === "good") good += 1;
    }
  }
  return { good, total };
}

/**
 * Per-round simple returns r_i = w_i / w_{i-1} − 1 with w_0 = startWealth.
 * A wipeout contributes its −1 and then the series STOPS (later rounds are 0/0).
 * Note: wealthByRound carries the last value forward for rounds without an
 * allocation row, so a missed round reads as a 0% return.
 */
export function perRoundReturns(startWealth: number, wealthByRound: number[]): number[] {
  if (!(startWealth > 0)) return [];
  const returns: number[] = [];
  let prev = startWealth;
  for (const w of wealthByRound) {
    returns.push(w / prev - 1);
    if (w <= 0) break;
    prev = w;
  }
  return returns;
}

/**
 * Sharpe ratio of a per-round return series: mean(r − riskFree) / popStdev(r).
 * Null when fewer than 2 returns or the returns don't vary (all-safe player).
 * Unannualized — rounds are the natural period of the game.
 */
export function sharpeRatio(returns: number[], riskFree = 0): number | null {
  if (returns.length < 2) return null;
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-12) return null;
  return (mean - riskFree) / sd;
}

/**
 * Expected GOOD probability per draw — the luck benchmark. Basic: good_prob.
 * Portfolio: the mean of each asset's good_prob (every revealed round faces one
 * draw per asset, so this is exactly the expected rate of the draws faced).
 */
export function expectedGoodRate(config: SessionConfig): number {
  if (!isPortfolio(config)) return config.good_prob ?? 0.6;
  const n = numAssets(config);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += assetGoodProb(config, i);
  return n > 0 ? sum / n : config.good_prob ?? 0.6;
}

export interface LuckStats {
  good: number;
  total: number;
  /** good/total */
  observed: number;
  /** the benchmark rate (expectedGoodRate) */
  expected: number;
  /** observed − expected, signed fraction ("+0.12 lucky" / "−0.14") */
  delta: number;
  /** ±1σ binomial band on the observed rate: sqrt(expected·(1−expected)/total) */
  sigma: number;
}

/** Signed luck vs the benchmark. Null when there are no draws yet. */
export function luckStats(good: number, total: number, expected: number): LuckStats | null {
  if (total <= 0) return null;
  const observed = good / total;
  return {
    good,
    total,
    observed,
    expected,
    delta: observed - expected,
    sigma: Math.sqrt((expected * (1 - expected)) / total),
  };
}

/**
 * Class-level luck so far from the SHARED draws (basic: one per revealed round;
 * portfolio: one per asset per round). Null in independent scope (rounds carry
 * no shared outcome there) or before any reveal.
 */
export function classLuckSoFar(config: SessionConfig, rounds: RoundRow[]): LuckStats | null {
  let good = 0;
  let total = 0;
  for (const r of revealedRounds(rounds)) {
    if (r.market_outcomes) {
      for (const o of r.market_outcomes) {
        total += 1;
        if (o === "good") good += 1;
      }
    } else if (r.market_outcome) {
      total += 1;
      if (r.market_outcome === "good") good += 1;
    }
  }
  return luckStats(good, total, expectedGoodRate(config));
}

/**
 * The round number each player busted (first revealed round ending at $0),
 * for ordering $0-tied players in standings. Host screens only — students
 * can't read other players' allocations.
 */
export function bustRoundByPlayer(
  rounds: RoundRow[],
  allocations: AllocationRow[],
): Map<string, number> {
  const byRound = new Map<string, AllocationRow[]>();
  for (const a of allocations) {
    const list = byRound.get(a.round_id) ?? [];
    list.push(a);
    byRound.set(a.round_id, list);
  }
  const bust = new Map<string, number>();
  for (const r of revealedRounds(rounds)) {
    for (const a of byRound.get(r.id) ?? []) {
      if (a.resulting_wealth != null && Number(a.resulting_wealth) <= 0 && !bust.has(a.player_id)) {
        bust.set(a.player_id, r.round_number);
      }
    }
  }
  return bust;
}

const NEVER_BUSTED = Number.MAX_SAFE_INTEGER;

/**
 * Standings comparator: wealth descending; players tied at the same wealth
 * (busted at $0) order by WHEN they busted — the later you busted, the higher
 * you rank; the first to bust sits last.
 */
export function compareStandings(
  a: { id: string; current_wealth: number | string },
  b: { id: string; current_wealth: number | string },
  bust: Map<string, number>,
): number {
  const dw = Number(b.current_wealth) - Number(a.current_wealth);
  if (Math.abs(dw) > 1e-9) return dw;
  return (bust.get(b.id) ?? NEVER_BUSTED) - (bust.get(a.id) ?? NEVER_BUSTED);
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
  const portfolio = isPortfolio(session.config);
  const scope = session.config.market_scope;
  const mode = session.config.payoff_mode;
  const startWealth = session.config.starting_wealth;
  const goodProb = session.config.good_prob ?? 0.6;

  const allocByKey = new Map<string, AllocationRow>();
  for (const a of allocations) allocByKey.set(`${a.round_id}:${a.player_id}`, a);

  const results: PlayerResult[] = players.map((p) => {
    const outcomes: MarketOutcome[] = [];
    const matrix: MarketOutcome[][] = [];
    const wealthByRound: number[] = [];
    const riskByRound: (number | null)[] = [];
    let last = startWealth;
    let betSum = 0;
    let betRounds = 0;
    for (const r of revealed) {
      const a = allocByKey.get(`${r.id}:${p.id}`);
      if (portfolio) {
        // one outcome per ASSET: the class-wide draws, or this player's own
        const arr =
          scope === "independent" ? a?.asset_outcomes ?? null : r.market_outcomes ?? null;
        if (arr && arr.length > 0) {
          matrix.push(arr);
          outcomes.push(...arr);
        }
      } else {
        // shared scope: the round's single outcome; independent: this player's own
        const outcome: MarketOutcome | null =
          scope === "independent" ? a?.market_outcome ?? null : r.market_outcome;
        if (outcome) outcomes.push(outcome);
      }

      if (a) {
        const risky = Number(a.risky_amount);
        const wealthThatRound = risky + Number(a.safe_amount);
        if (wealthThatRound > 0) {
          riskByRound.push(risky / wealthThatRound);
          betSum += risky;
          betRounds += 1;
        } else {
          // wiped out — 0/0 is undefined, so report the bot's strategy share
          // (the all-risky bot is still "100% at risk"), nothing for a human
          riskByRound.push(
            p.is_bot
              ? portfolio
                ? portfolioStrategyFraction(p.strategy)
                : strategyFraction(p.strategy, goodProb)
              : null,
          );
        }
      } else {
        riskByRound.push(null);
      }

      if (a?.resulting_wealth != null) last = Number(a.resulting_wealth);
      wealthByRound.push(last);
    }
    const finalWealth = Number(p.current_wealth);
    const nRounds = wealthByRound.length;
    const rf = session.config.risk_free_rate ?? 0;
    return {
      player: p,
      rank: 0,
      finalWealth,
      startWealth,
      wealthByRound,
      riskByRound,
      avgBet: betRounds > 0 ? betSum / betRounds : 0,
      totalReturn: nRounds > 0 ? finalWealth / startWealth - 1 : null,
      perRoundReturn:
        nRounds > 0 ? Math.pow(Math.max(finalWealth, 0) / startWealth, 1 / nRounds) - 1 : null,
      sharpe: sharpeRatio(perRoundReturns(startWealth, wealthByRound), rf),
      outcomes,
      counterfactual: portfolio
        ? undefined
        : allStrategyOutcomes(startWealth, outcomes, mode, goodProb),
      portfolioCounterfactual: portfolio
        ? allPortfolioStrategyOutcomes(session.config, startWealth, matrix)
        : undefined,
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
    strategy = results[0].counterfactual ?? empty; // same outcomes → same for all
    isAverage = false;
  } else {
    const avg = (k: StrategyKey) =>
      results.reduce((s, r) => s + (r.counterfactual?.[k] ?? startWealth), 0) / results.length;
    strategy = Object.fromEntries(STRATEGY_KEYS.map((k) => [k, avg(k)])) as Record<
      StrategyKey,
      number
    >;
    isAverage = true;
  }

  const beatAllSafe = results.filter(
    (r) => r.finalWealth > (r.counterfactual?.all_safe ?? startWealth) + 1e-9,
  ).length;
  return { scope, strategy, isAverage, beatAllSafe, total: results.length, startWealth };
}

export interface ClassPortfolioCounterfactual {
  scope: MarketScope;
  /** shared: exact strategy finals (identical for everyone); independent: class averages */
  strategy: Record<PortfolioStrategyKey, number>;
  isAverage: boolean;
  beatAllSafe: number;
  total: number;
  startWealth: number;
}

/** Portfolio-game counterpart of classCounterfactual. */
export function classPortfolioCounterfactual(
  session: SessionRow,
  results: PlayerResult[],
): ClassPortfolioCounterfactual {
  const scope = session.config.market_scope;
  const startWealth = session.config.starting_wealth;
  const empty = Object.fromEntries(
    PORTFOLIO_STRATEGY_KEYS.map((k) => [k, startWealth]),
  ) as Record<PortfolioStrategyKey, number>;

  if (results.length === 0) {
    return { scope, strategy: empty, isAverage: false, beatAllSafe: 0, total: 0, startWealth };
  }

  let strategy: Record<PortfolioStrategyKey, number>;
  let isAverage: boolean;
  if (scope === "shared") {
    strategy = results[0].portfolioCounterfactual ?? empty; // same draws → same for all
    isAverage = false;
  } else {
    const avg = (k: PortfolioStrategyKey) =>
      results.reduce((s, r) => s + (r.portfolioCounterfactual?.[k] ?? startWealth), 0) /
      results.length;
    strategy = Object.fromEntries(
      PORTFOLIO_STRATEGY_KEYS.map((k) => [k, avg(k)]),
    ) as Record<PortfolioStrategyKey, number>;
    isAverage = true;
  }

  const beatAllSafe = results.filter(
    (r) => r.finalWealth > (r.portfolioCounterfactual?.all_safe ?? startWealth) + 1e-9,
  ).length;
  return { scope, strategy, isAverage, beatAllSafe, total: results.length, startWealth };
}

/**
 * Build the downloadable CSV — player data only (no counterfactual columns):
 * rank, final wealth, good-draw count + %, average bet, and per-round
 * resulting wealth + risk %. Portfolio games count DRAWS (rounds × assets).
 */
export function buildResultsCsv(
  results: PlayerResult[],
  rounds: RoundRow[],
  portfolio = false,
  /** benchmark GOOD rate (expectedGoodRate) — adds a signed "Luck vs expected %" column */
  expectedRate?: number,
): string {
  const revealed = revealedRounds(rounds);
  const header: (string | number)[] = [
    "Rank",
    "Player",
    "Final wealth",
    portfolio ? "Good draws" : "Good rounds",
    portfolio ? "Total draws" : "Total rounds",
    "Good %",
    "Avg bet",
    "Total return %",
    "Per-round %",
    "Sharpe",
    ...(expectedRate != null ? ["Luck vs expected %"] : []),
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
      res.totalReturn == null ? "" : Math.round(res.totalReturn * 1000) / 10,
      res.perRoundReturn == null ? "" : Math.round(res.perRoundReturn * 1000) / 10,
      res.sharpe == null ? "" : round2(res.sharpe),
      ...(expectedRate != null
        ? [total ? Math.round((good / total - expectedRate) * 100) : ""]
        : []),
      ...perRound,
    ]);
  }
  return toCsv(rows);
}
