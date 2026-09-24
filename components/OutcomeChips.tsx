import type { MarketOutcome } from "@/lib/game/types";
import { ArrowUp, ArrowDown } from "@/components/icons";

/**
 * A sequence of market outcomes as a strip of small ink-edged tiles: green with
 * an up arrow, red with a down arrow — the arrow keeps it readable without
 * colour. The newest tile pops in when a round resolves.
 */
export function OutcomeChips({
  outcomes,
  empty = "—",
}: {
  outcomes: MarketOutcome[];
  empty?: string;
}) {
  if (outcomes.length === 0) {
    return <span className="text-xs text-ink-subtle">{empty}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-[3px]">
      {outcomes.map((o, i) => (
        <span
          key={`${i}-${outcomes.length}`}
          className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] border-ink text-[11px] text-white ${
            o === "good" ? "bg-gain" : "bg-loss"
          } ${i === outcomes.length - 1 ? "animate-count-pop" : ""}`}
          title={o === "good" ? "up" : "down"}
        >
          {o === "good" ? <ArrowUp strokeWidth={2.5} /> : <ArrowDown strokeWidth={2.5} />}
        </span>
      ))}
    </span>
  );
}
