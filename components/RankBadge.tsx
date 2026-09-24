/**
 * A standings rank. The podium three sit on blocks — amber for first, cream for
 * second and third — and everyone else is a plain number, so the top of a long
 * list is findable at a glance. Shared by every host standings list.
 */
export function RankBadge({ rank, size = "md" }: { rank: number; size?: "md" | "lg" }) {
  const cls =
    rank === 1
      ? "border-ink bg-brand text-ink"
      : rank <= 3
        ? "border-ink bg-surface text-ink"
        : "border-transparent text-ink-subtle";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg border-2 px-1 font-mono font-bold ${
        size === "lg" ? "h-9 min-w-9 text-base" : "h-7 min-w-7 text-sm"
      } ${cls}`}
    >
      {rank}
    </span>
  );
}
