/**
 * Placeholders for the header's account pieces while their chunk loads. Kept
 * out of header-account.tsx on purpose: SiteHeader imports these statically,
 * and importing anything from that module would pull supabase-js into the
 * marketing page's first load.
 *
 * Each has the exact footprint of what replaces it, so nothing moves.
 */

/** The 44px avatar button's footprint. */
export function AvatarSkeleton() {
  return (
    <span
      aria-hidden
      className="block h-11 w-11 animate-pulse-soft rounded-full border-2 border-ink/20 bg-ink/10"
    />
  );
}

/** The phone menu's account row, while it loads. */
export function SheetAccountSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 px-3 py-3">
      <span className="h-9 w-9 animate-pulse-soft rounded-full bg-ink/10" />
      <span className="h-4 w-32 animate-pulse-soft rounded bg-ink/10" />
    </div>
  );
}
