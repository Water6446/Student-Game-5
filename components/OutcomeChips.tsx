import type { MarketOutcome } from "@/lib/game/types";

/** Renders a sequence of market outcomes as colored ▲ (good) / ▼ (bad) marks. */
export function OutcomeChips({
  outcomes,
  empty = "—",
}: {
  outcomes: MarketOutcome[];
  empty?: string;
}) {
  if (outcomes.length === 0) {
    return <span className="text-xs text-slate-600">{empty}</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-0.5 font-mono text-xs leading-none">
      {outcomes.map((o, i) => (
        <span key={i} className={o === "good" ? "text-emerald-400" : "text-rose-400"}>
          {o === "good" ? "▲" : "▼"}
        </span>
      ))}
    </span>
  );
}
