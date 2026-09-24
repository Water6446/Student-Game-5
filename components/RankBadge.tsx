/**
 * A standings rank. First place sits on an amber block — the one box in the
 * list — second and third are bold ink, everyone else a quiet number, so the
 * top of a long list is findable without turning every row into a badge.
 */
export function RankBadge({ rank, size = "md" }: { rank: number; size?: "md" | "lg" }) {
  const cls =
    rank === 1
      ? "rounded-md border-2 border-ink bg-brand font-bold text-ink"
      : rank <= 3
        ? "font-black text-ink"
        : "font-bold text-ink-subtle";
  return (
    <span
      className={`flex shrink-0 items-center justify-center px-1 font-mono ${
        size === "lg" ? "h-9 min-w-9 text-base" : "h-7 min-w-7 text-sm"
      } ${cls}`}
    >
      {rank}
    </span>
  );
}
