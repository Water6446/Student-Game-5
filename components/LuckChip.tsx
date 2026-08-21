"use client";

import type { LuckStats } from "@/lib/game/results";
import { signedPct } from "@/lib/game/format";
import { Clover } from "@/components/icons";

/**
 * A player's signed luck against the expected GOOD-draw rate. Renders nothing
 * when they have no draws yet. `withWord` appends "lucky" / "unlucky" — the
 * end-of-game panels have room to spell it out, the live standings row does not.
 *
 * Only meaningful in independent market scope, where each player draws their own
 * outcomes; callers gate on that.
 */
export function LuckChip({
  luck,
  expected,
  withWord,
}: {
  luck: LuckStats | null;
  /** benchmark GOOD rate per draw (expectedGoodRate) */
  expected: number;
  withWord?: boolean;
}) {
  if (!luck) return null;
  return (
    <span
      className={`flex shrink-0 items-center gap-1 text-xs ${
        luck.delta > 0 ? "text-gain" : luck.delta < 0 ? "text-loss" : "text-ink-muted"
      }`}
      title={`GOOD-draw rate vs the expected ${Math.round(expected * 100)}%`}
    >
      <Clover className={luck.delta >= 0 ? "text-gain" : "text-loss"} />
      {signedPct(luck.delta * 100)}
      {withWord ? (luck.delta < 0 ? " unlucky" : " lucky") : null}
    </span>
  );
}
