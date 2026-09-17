import Link from "next/link";
import { Coins } from "@/components/icons";
import { AccountMenuSlot } from "@/components/marketing/AccountMenuSlot";
import { HEADER, NAV_LINKS, SITE } from "@/lib/marketing/content";

/**
 * 64px bar on a hairline, not a slab. Wordmark left, anchors centred on large
 * screens, the account area and one amber action right. On phones only the
 * wordmark, the account area and the action survive; the anchors live in the
 * footer rather than behind a hamburger.
 *
 * Still a Server Component. <AccountMenuSlot /> is the single client island. It
 * carries both the account dropdown and the bar's one amber action — that button
 * says "Log in" or "Host a session" depending on who is looking, so it cannot be
 * rendered on the server. It loads as an async chunk, keeping supabase-js out of
 * the landing page's first load, and reserves its width so the bar never
 * reflows.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink/12 bg-paper/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="flex min-h-[44px] shrink-0 items-center gap-2.5 text-ink transition hover:opacity-80"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
            <Coins className="text-[0.95em]" />
          </span>
          <span className="font-display text-base font-black uppercase tracking-[-0.01em] sm:text-lg">
            {SITE.name}
            <span className="text-brand-strong">.</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group inline-flex min-h-[44px] items-center text-sm font-semibold text-ink-muted transition hover:text-ink"
            >
              <span className="border-b-2 border-transparent py-1 transition group-hover:border-brand">
                {link.label}
              </span>
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Link
            href={HEADER.joinCta.href}
            className="hidden min-h-[44px] items-center text-sm font-semibold text-ink-muted transition hover:text-ink sm:inline-flex"
          >
            {HEADER.joinCta.label}
          </Link>
          {/* The amber action lives inside the island: it is "Log in" or
              "Host a session" depending on who is looking. */}
          <AccountMenuSlot />
        </div>
      </div>
    </header>
  );
}
