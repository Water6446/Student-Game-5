import { ChangeChip, ClockChip, TickerBadge } from "@/components/markets/parts";
import { Sparkline } from "@/components/markets/Sparkline";
import { MARKETS_PAGE } from "@/lib/marketing/content";

/**
 * A static replica of the student's market list, built from the same parts and
 * classes as components/markets/student/MarketList.tsx (the index fund's card
 * above the list of companies) so it shows the real thing. An illustration:
 * hidden from screen readers, which get the caption. Used by the /markets hub
 * and the homepage's Markets band.
 */
export function MarketsPreview() {
  const p = MARKETS_PAGE.preview;
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border-2 border-ink bg-paper shadow-card">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-surface px-4 py-2.5">
          <span className="font-display text-base font-black uppercase tracking-tight text-ink">{p.title}</span>
          <ClockChip tone="open">{p.clock}</ClockChip>
        </div>

        <div className="space-y-3 p-3">
          <div className="rounded-2xl border-2 border-ink bg-play-soft p-3.5 shadow-card">
            <span className="flex items-center gap-2.5">
              <TickerBadge ticker={p.index.ticker} kind="index_fund" />
              <span className="min-w-0">
                <span className="block font-display text-sm font-extrabold uppercase leading-tight tracking-tight text-ink">
                  {p.index.name}
                </span>
                <span className="block text-xs text-ink-muted">{p.index.about}</span>
              </span>
            </span>
            <span className="mt-3 flex items-center gap-3">
              <Sparkline values={[...p.index.spark]} className="h-10 w-auto flex-1" />
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-base font-bold text-ink">{p.index.price}</span>
                <ChangeChip value={p.index.change} size="sm" />
              </span>
            </span>
          </div>

          <ul className="divide-y-2 divide-ink/10 overflow-hidden rounded-2xl border-2 border-ink bg-surface">
            {p.rows.map((r) => (
              <li key={r.ticker} className="flex min-h-[60px] items-center gap-2.5 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-extrabold tracking-wide text-ink">{r.ticker}</span>
                  <span className="block truncate text-xs text-ink-muted">{r.name}</span>
                </span>
                <Sparkline values={[...r.spark]} className="w-14" />
                <span className="flex w-[5.25rem] shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm font-bold text-ink">{r.price}</span>
                  <ChangeChip value={r.change} size="sm" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-ink-muted">{p.caption}</figcaption>
    </figure>
  );
}
