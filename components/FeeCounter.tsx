"use client";

import { money } from "@/lib/game/format";
import type { AllocationRow } from "@/lib/game/db";

/**
 * Fees paid, in the colour of a loss — because that is what they are.
 *
 * HOST ONLY. Students see each year's fee as one quiet line of their year
 * result, and the game-long total once, on the end screen: how much fees ate
 * is part of the reveal, and a total ticking up beside their wealth every year
 * gave the punchline away (and read as ambiguous — a total and a yearly figure
 * side by side, one taken for the other).
 */
export function FeeCounter({
  total,
  label = "Fees paid",
  className,
}: {
  total: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-2 rounded-xl border-2 border-ink bg-loss-soft px-3 py-1.5 shadow-card ${className ?? ""}`}
    >
      <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-loss">
        {label}
      </span>
      <span className="font-mono text-sm font-bold text-loss">{money(total)}</span>
    </span>
  );
}

/** Total fees across a set of allocation rows. Blank rows count as zero. */
export function sumFees(allocations: AllocationRow[]): number {
  return allocations.reduce((s, a) => s + (a.fees_paid == null ? 0 : Number(a.fees_paid)), 0);
}

/** Fees per player id, for the host's standings rows. */
export function feesByPlayer(allocations: AllocationRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations) {
    if (a.fees_paid == null) continue;
    m.set(a.player_id, (m.get(a.player_id) ?? 0) + Number(a.fees_paid));
  }
  return m;
}
