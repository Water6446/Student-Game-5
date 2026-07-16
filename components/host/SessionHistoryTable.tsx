"use client";

import { useMemo } from "react";
import type { AllocationRow, RoundRow } from "@/lib/game/db";
import type { MarketOutcome } from "@/lib/game/types";
import { signedMoney } from "@/lib/game/format";
import { OutcomeChips } from "@/components/OutcomeChips";
import { ArrowUp, ArrowDown } from "@/components/icons";

interface HistoryRow {
  round: number;
  outcome: RoundRow["market_outcome"] | "independent";
  /** portfolio, shared scope: the class-wide per-asset outcomes */
  assetOutcomes: MarketOutcome[] | null;
  goodCount: number;
  badCount: number;
  /** per-player wealth CHANGE that round, summarized across the class */
  avg: number | null;
  median: number | null;
  high: number | null;
  low: number | null;
}

function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function SessionHistoryTable({
  rounds,
  allocations,
}: {
  rounds: RoundRow[];
  allocations: AllocationRow[];
}) {
  const history = useMemo<HistoryRow[]>(() => {
    const revealed = rounds
      .filter((r) => r.status === "revealed")
      .sort((a, b) => b.round_number - a.round_number); // newest first

    return revealed.map((r) => {
      const allocs = allocations.filter((a) => a.round_id === r.id);
      // Each player's outcome THAT round = wealth change from the round's start
      // (risky+safe, what they bet from) to its end. Players who entered the
      // round already wiped out ($0) have no stake, so they're excluded.
      const deltas = allocs
        .map((a) => {
          if (a.resulting_wealth == null) return null;
          const before = Number(a.risky_amount) + Number(a.safe_amount);
          return before > 0 ? Number(a.resulting_wealth) - before : null;
        })
        .filter((d): d is number => d != null)
        .sort((a, b) => a - b);
      // good/bad tallies for independent rounds: per player (basic) or per
      // player × asset (portfolio)
      let goodCount = 0;
      let badCount = 0;
      for (const a of allocs) {
        if (a.asset_outcomes) {
          for (const o of a.asset_outcomes) o === "good" ? goodCount++ : badCount++;
        } else if (a.market_outcome === "good") goodCount++;
        else if (a.market_outcome === "bad") badCount++;
      }
      return {
        round: r.round_number,
        outcome: r.market_outcome ?? "independent",
        assetOutcomes: r.market_outcomes ?? null,
        goodCount,
        badCount,
        avg: deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null,
        median: deltas.length ? medianOf(deltas) : null,
        high: deltas.length ? deltas[deltas.length - 1] : null,
        low: deltas.length ? deltas[0] : null,
      };
    });
  }, [rounds, allocations]);

  if (history.length === 0) {
    return <p className="font-editorial text-sm italic text-ink-subtle">No completed rounds yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 font-editorial text-xs italic text-ink-muted">
        How players did <span className="font-semibold">in that round</span> — each player&apos;s
        wealth change, summarized across the class.
      </p>
      <table className="w-full overflow-hidden rounded-xl border-2 border-ink text-sm">
        <thead>
          <tr className="bg-ink text-left font-display text-xs font-extrabold uppercase tracking-wide text-paper">
            <th className="px-2 py-2">Round</th>
            <th className="px-2 py-2">Market</th>
            <th className="px-2 py-2 text-right">Avg</th>
            <th className="px-2 py-2 text-right">Median</th>
            <th className="px-2 py-2 text-right">High</th>
            <th className="px-2 py-2 text-right">Low</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.round} className="border-t border-line">
              <td className="px-2 py-2 font-mono text-ink">{h.round}</td>
              <td className="px-2 py-2">
                {h.assetOutcomes ? (
                  // portfolio, shared scope: one arrow per asset, in asset order
                  <OutcomeChips outcomes={h.assetOutcomes} />
                ) : h.outcome === "good" ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-gain">
                    GOOD <ArrowUp />
                  </span>
                ) : h.outcome === "bad" ? (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-loss">
                    BAD <ArrowDown />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-ink-muted">
                    indep.
                    <span className="inline-flex items-center gap-0.5 text-gain">
                      {h.goodCount}
                      <ArrowUp />
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-loss">
                      {h.badCount}
                      <ArrowDown />
                    </span>
                  </span>
                )}
              </td>
              <DeltaCell value={h.avg} />
              <DeltaCell value={h.median} />
              <DeltaCell value={h.high} />
              <DeltaCell value={h.low} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A signed money cell colored by its sign (gain / loss / neutral). */
function DeltaCell({ value }: { value: number | null }) {
  const cls =
    value == null
      ? "text-ink-subtle"
      : value > 0
        ? "text-gain"
        : value < 0
          ? "text-loss"
          : "text-ink-muted";
  return (
    <td className={`px-2 py-2 text-right font-mono ${cls}`}>
      {value == null ? "—" : signedMoney(value)}
    </td>
  );
}
