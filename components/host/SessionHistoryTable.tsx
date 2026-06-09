"use client";

import { useMemo } from "react";
import type { AllocationRow, RoundRow } from "@/lib/game/db";
import { money } from "@/lib/game/format";
import { ArrowUp, ArrowDown } from "@/components/icons";

interface HistoryRow {
  round: number;
  outcome: RoundRow["market_outcome"] | "independent";
  goodCount: number;
  badCount: number;
  avg: number | null;
  high: number | null;
  low: number | null;
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
      const wealths = allocs
        .map((a) => (a.resulting_wealth == null ? null : Number(a.resulting_wealth)))
        .filter((w): w is number => w != null);
      const goodCount = allocs.filter((a) => a.market_outcome === "good").length;
      const badCount = allocs.filter((a) => a.market_outcome === "bad").length;
      return {
        round: r.round_number,
        outcome: r.market_outcome ?? "independent",
        goodCount,
        badCount,
        avg: wealths.length ? wealths.reduce((s, w) => s + w, 0) / wealths.length : null,
        high: wealths.length ? Math.max(...wealths) : null,
        low: wealths.length ? Math.min(...wealths) : null,
      };
    });
  }, [rounds, allocations]);

  if (history.length === 0) {
    return <p className="text-sm text-ink-subtle">No completed rounds yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wide text-ink-subtle">
            <th className="px-2 py-2">Round</th>
            <th className="px-2 py-2">Market</th>
            <th className="px-2 py-2 text-right">Avg</th>
            <th className="px-2 py-2 text-right">High</th>
            <th className="px-2 py-2 text-right">Low</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.round} className="border-t border-line">
              <td className="px-2 py-2 font-mono text-ink">{h.round}</td>
              <td className="px-2 py-2">
                {h.outcome === "good" ? (
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
              <td className="px-2 py-2 text-right font-mono text-ink">
                {h.avg == null ? "—" : money(h.avg)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-gain">
                {h.high == null ? "—" : money(h.high)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-loss">
                {h.low == null ? "—" : money(h.low)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
