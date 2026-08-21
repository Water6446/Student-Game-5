"use client";

import { money, signedMoney } from "@/lib/game/format";
import type { AllocationRow } from "@/lib/game/db";

/**
 * Fees paid, in the colour of a loss — because that is what they are. Visible
 * every single year on the student's round screen and on the host's panel, so
 * the number climbs in front of the class rather than surfacing once at the end.
 */
export function FeeCounter({
  total,
  thisYear,
  label = "Fees paid",
  className,
}: {
  total: number;
  /** the current year's fee, shown as a delta on the reveal */
  thisYear?: number | null;
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
      {thisYear != null && thisYear > 0 ? (
        <span className="font-mono text-xs text-loss/80">
          {signedMoney(-thisYear)} this year
        </span>
      ) : null}
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
