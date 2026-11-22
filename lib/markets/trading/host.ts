// What the host's control screen and the projector derive from the class's
// per-period rows. Pure.
//
// For paper trading, resolve_round writes one `allocations` row per player per
// period (0034): risky_amount + safe_amount is the account value at the
// period's start and resulting_wealth its value at the end. So the session
// history the other games already load (rounds + allocations) carries what the
// standings need, and the wealth chart reads it unchanged.

import type { AllocationRow, RoundRow } from "../../game/db";
import type { MarketPeriodResultRow } from "../db";

function latestRevealed(rounds: RoundRow[]): RoundRow | null {
  let last: RoundRow | null = null;
  for (const r of rounds) {
    if (r.status === "revealed" && (!last || r.round_number > last.round_number)) last = r;
  }
  return last;
}

/** The latest revealed period's rows: value at its start and its end, per player. */
function latestValues(
  rounds: RoundRow[],
  allocations: AllocationRow[],
  include?: (playerId: string) => boolean,
): Map<string, { start: number; end: number }> {
  const out = new Map<string, { start: number; end: number }>();
  const last = latestRevealed(rounds);
  if (!last) return out;
  for (const a of allocations) {
    if (a.round_id !== last.id || a.resulting_wealth == null) continue;
    if (include && !include(a.player_id)) continue;
    out.set(a.player_id, {
      start: Number(a.risky_amount) + Number(a.safe_amount),
      end: Number(a.resulting_wealth),
    });
  }
  return out;
}

/** Each player's change in account value over the latest revealed period. */
export function periodChanges(rounds: RoundRow[], allocations: AllocationRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, v] of latestValues(rounds, allocations)) out.set(id, v.end - v.start);
  return out;
}

/** Ranks 1, 2, 2, 4 …, highest value first: rank() in get_trading_standings. */
export function competitionRanks(values: Map<string, number>): Map<string, number> {
  const sorted = [...values.values()].sort((a, b) => b - a);
  const out = new Map<string, number>();
  for (const [id, v] of values) out.set(id, sorted.indexOf(v) + 1);
  return out;
}

/**
 * Places each player climbed (positive) or fell (negative) over the latest
 * revealed period: their rank by value at its end against their rank by value
 * at its start, among the players who played it (a late joiner starts at the
 * starting cash). Empty when everyone started the period level, as in the
 * first one, where every move would be a fall from a shared first place.
 */
export function rankMoves(
  rounds: RoundRow[],
  allocations: AllocationRow[],
  include?: (playerId: string) => boolean,
): Map<string, number> {
  const values = latestValues(rounds, allocations, include);
  const out = new Map<string, number>();
  const starts = new Map([...values].map(([id, v]) => [id, v.start]));
  if (new Set(starts.values()).size <= 1) return out;
  const before = competitionRanks(starts);
  const after = competitionRanks(new Map([...values].map(([id, v]) => [id, v.end])));
  for (const [id, r] of after) out.set(id, (before.get(id) ?? r) - r);
  return out;
}

/**
 * The index fund's value after each revealed period, starting from the
 * starting cash: the "just buy the market" line on the class wealth chart.
 * Stops at the first gap, so it never skips a period.
 */
export function indexPath(periods: MarketPeriodResultRow[], startingCash: number): number[] {
  const byRound = new Map(periods.map((p) => [p.round_number, p.index_return]));
  const out: number[] = [];
  let v = startingCash;
  for (let r = 1; byRound.get(r) != null; r++) {
    v *= 1 + Number(byRound.get(r));
    out.push(v);
  }
  return out;
}
