"use client";

import { useMemo } from "react";
import type { AllocationRow, RoundRow } from "@/lib/game/db";
import { money } from "@/lib/game/format";

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
    return <p className="text-sm text-slate-500">No completed rounds yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2">Round</th>
            <th className="px-2 py-2">Market</th>
            <th className="px-2 py-2 text-right">Avg</th>
            <th className="px-2 py-2 text-right">High</th>
            <th className="px-2 py-2 text-right">Low</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.round} className="border-t border-slate-800">
              <td className="px-2 py-2 font-mono text-slate-300">{h.round}</td>
              <td className="px-2 py-2">
                {h.outcome === "good" ? (
                  <span className="font-semibold text-emerald-400">GOOD ▲</span>
                ) : h.outcome === "bad" ? (
                  <span className="font-semibold text-rose-400">BAD ▼</span>
                ) : (
                  <span className="text-slate-400">
                    indep.{" "}
                    <span className="text-emerald-400">{h.goodCount}▲</span>{" "}
                    <span className="text-rose-400">{h.badCount}▼</span>
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right font-mono text-slate-300">
                {h.avg == null ? "—" : money(h.avg)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-emerald-300">
                {h.high == null ? "—" : money(h.high)}
              </td>
              <td className="px-2 py-2 text-right font-mono text-rose-300">
                {h.low == null ? "—" : money(h.low)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
