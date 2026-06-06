"use client";

import { useMemo } from "react";
import type { AllocationRow, PlayerRow } from "@/lib/game/db";
import { money } from "@/lib/game/format";

/**
 * Per-student breakdown of how much each player put at risk this round. Shown to
 * the host once allocations are locked. Non-submitters are flagged — they default
 * to all-safe at resolve time. Sorted by risky amount, biggest gambler first.
 */
export function AllocationsBreakdown({
  players,
  allocations,
}: {
  players: PlayerRow[];
  allocations: AllocationRow[];
}) {
  const rows = useMemo(() => {
    const byPlayer = new Map(allocations.map((a) => [a.player_id, a]));
    return players
      .map((p) => {
        const a = byPlayer.get(p.id);
        return {
          id: p.id,
          name: p.display_name,
          wealth: Number(p.current_wealth),
          risky: a ? Number(a.risky_amount) : null,
          safe: a ? Number(a.safe_amount) : null,
          submitted: !!a,
        };
      })
      .sort((x, y) => (y.risky ?? -1) - (x.risky ?? -1));
  }, [players, allocations]);

  const submitted = rows.filter((r) => r.submitted).length;
  const totalRisky = rows.reduce((s, r) => s + (r.risky ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-300">Allocations</span>
        <span className="text-slate-500">
          {submitted}/{rows.length} submitted · {money(totalRisky)} at risk
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5">Player</th>
              <th className="px-2 py-1.5 text-right">Risky</th>
              <th className="px-2 py-1.5 text-right">Safe</th>
              <th className="px-2 py-1.5 text-right">% risked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.risky != null && r.wealth > 0 ? Math.round((r.risky / r.wealth) * 100) : 0;
              return (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="px-2 py-1.5 text-slate-200">
                    {r.name}
                    {!r.submitted ? (
                      <span className="ml-2 text-xs text-amber-500">(no submission → all safe)</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-rose-300">
                    {r.risky == null ? "—" : money(r.risky)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-300">
                    {r.safe == null ? money(r.wealth) : money(r.safe)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                    {r.submitted ? `${pct}%` : "0%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
