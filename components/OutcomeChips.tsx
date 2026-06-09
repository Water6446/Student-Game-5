import type { MarketOutcome } from "@/lib/game/types";
import { ArrowUp, ArrowDown } from "@/components/icons";

/** Renders a sequence of market outcomes as colored up (good) / down (bad) marks. */
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
    <span className="inline-flex flex-wrap items-center gap-0.5 text-[13px] leading-none">
      {outcomes.map((o, i) =>
        o === "good" ? (
          <ArrowUp key={i} className="text-gain" />
        ) : (
          <ArrowDown key={i} className="text-loss" />
        ),
      )}
    </span>
  );
}
