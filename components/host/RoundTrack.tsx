import type { RoundPhase } from "@/components/use-round-phase";
import type { MarketOutcome } from "@/lib/game/types";

/**
 * The game as a strip of segments under the round title: one per round,
 * coloured once it resolves (green/red for a class-wide basic market, ink
 * otherwise), amber for the round in play. Where the class has been, at a glance.
 */
export function RoundTrack({
  total,
  current,
  phase,
  rounds,
  sharedBasic,
}: {
  total: number;
  current: number;
  phase: RoundPhase;
  rounds: { round_number: number; status: string; market_outcome: MarketOutcome | null }[];
  sharedBasic: boolean;
}) {
  const byNumber = new Map(rounds.map((r) => [r.round_number, r]));
  // Past ~40 rounds a segment is thinner than the gap between segments; a long
  // game gets one continuous bar instead.
  if (total > 40) {
    const pct = total > 0 ? Math.min(current / total, 1) * 100 : 0;
    return (
      <div
        className="mt-4 h-3 overflow-hidden rounded-full border-2 border-ink bg-surface"
        role="img"
        aria-label={`Round ${current} of ${total}`}
      >
        <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <ol
      className="mt-4 flex h-3 gap-[3px]"
      aria-label={`Round ${current} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const r = byNumber.get(n);
        const revealed = r?.status === "revealed" && !(n === current && phase !== "revealed");
        const cls = revealed
          ? sharedBasic
            ? r?.market_outcome === "good"
              ? "bg-gain"
              : r?.market_outcome === "bad"
                ? "bg-loss"
                : "bg-ink"
            : "bg-ink"
          : n === current
            ? "bg-brand animate-pulse-soft"
            : "bg-surface";
        return (
          <li
            key={n}
            title={`${n}${revealed && sharedBasic && r?.market_outcome ? ` · ${r.market_outcome === "good" ? "up" : "down"}` : ""}`}
            className={`min-w-0 flex-1 rounded-[3px] border-[1.5px] border-ink transition-colors duration-300 ${cls}`}
          />
        );
      })}
    </ol>
  );
}
