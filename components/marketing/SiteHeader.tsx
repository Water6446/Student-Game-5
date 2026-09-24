"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { clsx } from "@/components/clsx";
import { Coins, Menu, X } from "@/components/icons";
import { HEADER, NAV_LINKS, SITE } from "@/lib/marketing/content";
import { isCurrentPath, sectionIdOf } from "@/lib/site-chrome";
import {
  AvatarSkeleton,
  SheetAccountSkeleton,
} from "@/components/marketing/header-account-skeletons";

/**
 * The site header. Mounted ONCE, in the root layout (SiteHeaderGate), so it
 * persists across navigation instead of being rebuilt — and re-deciding who is
 * signed in — on every click.
 *
 * Nothing in it moves:
 *   - On wide screens it is a three-column grid with equal outer columns, so
 *     the section links sit at the true centre whatever is either side of them.
 *   - The right-hand side is drawn in BOTH its signed-out and signed-in forms,
 *     and CSS shows one (`.auth-out` / `.auth-in`, keyed off `html[data-auth]`,
 *     which a cookie check sets before first paint — lib/auth/auth-hint.ts).
 *     The two forms are the same width: "Log in" + "Host a session" versus
 *     "Host a session" + a 44px avatar.
 *   - No button hides itself on its own page; it shows as the current page.
 *
 * Below `lg` the bar is the wordmark, the students' one action ("Join") and a
 * menu button; everything else is in the menu sheet.
 *
 * Only the account avatar and the sheet's account section need supabase-js, and
 * both load as one async chunk after hydration (header-account.tsx), keeping it
 * out of the marketing page's first load.
 */

const AvatarMenu = dynamic(
  () => import("@/components/marketing/header-account").then((m) => m.AvatarMenu),
  { ssr: false, loading: AvatarSkeleton },
);
const SheetAccount = dynamic(
  () => import("@/components/marketing/header-account").then((m) => m.SheetAccount),
  { ssr: false, loading: SheetAccountSkeleton },
);

const SECTION_IDS = NAV_LINKS.map((l) => sectionIdOf(l.href)).filter((id): id is string => Boolean(id));

/** The homepage section under the header right now, for the section links' state. */
function useActiveSection(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Just below the sticky bar: the section whose band crosses this line.
      const line = 96;
      let current: string | null = null;
      for (const id of SECTION_IDS) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top <= line && r.bottom > line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled]);
  return active;
}

export function SiteHeader() {
  const pathname = usePathname();
  const activeSection = useActiveSection(pathname === "/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const current = (href: string) => isCurrentPath(pathname, href);

  // The header outlives navigation now, so the sheet must close on its own.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // ...and when the window widens past the point the full bar returns.
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [menuOpen]);

  function closeMenu(returnFocus = false) {
    setMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-ink bg-surface">
      <div className="relative z-20 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
        <Link
          href="/"
          className="flex min-h-[44px] shrink-0 items-center gap-2.5 text-ink transition hover:opacity-80 lg:col-start-1 lg:justify-self-start"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper-inverse">
            <Coins className="text-[0.95em]" />
          </span>
          <span className="font-display text-base font-black uppercase tracking-[-0.01em] sm:text-lg">
            {SITE.name}
            <span className="text-brand-strong">.</span>
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-8 lg:col-start-2 lg:flex">
          {NAV_LINKS.map((link) => (
            <TextLink
              key={link.href}
              href={link.href}
              current={activeSection !== null && activeSection === sectionIdOf(link.href)}
              currentKind="location"
            >
              {link.label}
            </TextLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center lg:col-start-3 lg:justify-self-end">
          {/* wide screens */}
          <div className="hidden items-center gap-5 lg:flex">
            <TextLink href={HEADER.joinCta.href} current={current(HEADER.joinCta.href)}>
              {HEADER.joinCta.label}
            </TextLink>
            <div className="auth-out items-center gap-5">
              <TextLink href={HEADER.loginCta.href} current={current(HEADER.loginCta.href)}>
                {HEADER.loginCta.label}
              </TextLink>
              <AmberLink href={HEADER.hostCta.signedOutHref} current={false}>
                {HEADER.hostCta.label}
              </AmberLink>
            </div>
            <div className="auth-in items-center gap-3">
              <AmberLink href={HEADER.hostCta.href} current={current(HEADER.hostCta.href)}>
                {HEADER.hostCta.label}
              </AmberLink>
              <AvatarMenu />
            </div>
          </div>

          {/* phones and tablets */}
          <div className="flex items-center gap-2 lg:hidden">
            <AmberLink
              href={HEADER.joinCta.href}
              current={current(HEADER.joinCta.href)}
              compact
              // A 320px screen has room for the wordmark and the menu only;
              // Join is the menu's first action there.
              className="max-[359px]:hidden"
            >
              {HEADER.joinCta.short}
            </AmberLink>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? HEADER.menuLabel.close : HEADER.menuLabel.open}
              className={clsx(
                "flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink text-xl text-ink transition",
                "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                menuOpen ? "translate-x-[2px] translate-y-[2px] bg-paper-2" : "bg-surface shadow-card hover:bg-paper-2",
              )}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <MenuSheet
          id={menuId}
          pathname={pathname}
          activeSection={activeSection}
          onClose={closeMenu}
        />
      ) : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** A quiet text link; the current one keeps the amber underline hover shows. */
function TextLink({
  href,
  current,
  currentKind = "page",
  children,
}: {
  href: string;
  current: boolean;
  /** "location" for a section of the page, "page" for a page */
  currentKind?: "page" | "location";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? currentKind : undefined}
      className={clsx(
        "group inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold transition",
        current ? "text-ink" : "text-ink-muted hover:text-ink",
      )}
    >
      <span
        className={clsx(
          "border-b-2 py-1 transition",
          current ? "border-brand" : "border-transparent group-hover:border-brand",
        )}
      >
        {children}
      </span>
    </Link>
  );
}

/**
 * The bar's amber pill. On its own page it stays put and shows as current —
 * ink fill, cream text, pressed in (DESIGN.md's active-nav pattern) — rather
 * than vanishing and dragging its neighbours sideways.
 */
function AmberLink({
  href,
  current,
  compact,
  className,
  children,
}: {
  href: string;
  current: boolean;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={clsx(
        "inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 border-ink font-display text-sm font-extrabold transition",
        compact ? "px-4" : "px-5",
        current
          ? "translate-x-[2px] translate-y-[2px] bg-ink text-paper-inverse"
          : "bg-brand text-ink shadow-card hover:bg-brand-strong active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// The phone menu
// ---------------------------------------------------------------------------

function MenuSheet({
  id,
  pathname,
  activeSection,
  onClose,
}: {
  id: string;
  pathname: string | null;
  activeSection: string | null;
  onClose: (returnFocus?: boolean) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  // Read through a ref: the parent hands a new function every render, and
  // re-running the effect below would yank focus back to the first link.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus in, page frozen behind, Escape out (back to the menu button).
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current(true);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = (href: string) => isCurrentPath(pathname, href);

  return (
    <>
      {/* Dims the page, not the bar: it starts below the header's 2px ink
          border, as the sheet does, so that line stays between them. */}
      <div
        aria-hidden
        onClick={() => onClose()}
        className="absolute inset-x-0 top-[calc(100%+2px)] z-0 h-[100dvh] bg-ink/40 lg:hidden"
      />
      <nav
        ref={panelRef}
        id={id}
        aria-label="Menu"
        className="absolute inset-x-0 top-[calc(100%+2px)] z-10 max-h-[calc(100dvh-4rem-4px)] overflow-y-auto border-b-2 border-ink bg-surface lg:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col px-2 py-3 sm:px-6">
          {NAV_LINKS.map((link) => (
            <SheetLink
              key={link.href}
              href={link.href}
              current={activeSection !== null && activeSection === sectionIdOf(link.href)}
              currentKind="location"
              onGo={() => onClose()}
            >
              {link.label}
            </SheetLink>
          ))}

          <div className="my-2 border-t-2 border-ink/10" />

          <SheetLink href={HEADER.joinCta.href} current={current(HEADER.joinCta.href)} onGo={() => onClose()}>
            {HEADER.joinCta.label}
          </SheetLink>
          <div className="auth-out flex-col">
            <SheetLink href={HEADER.hostCta.signedOutHref} current={false} onGo={() => onClose()}>
              {HEADER.hostCta.label}
            </SheetLink>
            <div className="my-2 border-t-2 border-ink/10" />
            <SheetLink href={HEADER.loginCta.href} current={current(HEADER.loginCta.href)} onGo={() => onClose()}>
              {HEADER.loginCta.label}
            </SheetLink>
          </div>
          <div className="auth-in flex-col">
            <SheetLink href={HEADER.hostCta.href} current={current(HEADER.hostCta.href)} onGo={() => onClose()}>
              {HEADER.hostCta.label}
            </SheetLink>
            <div className="my-2 border-t-2 border-ink/10" />
            <SheetAccount onNavigate={() => onClose()} />
          </div>
        </div>
      </nav>
    </>
  );
}

function SheetLink({
  href,
  current,
  currentKind = "page",
  onGo,
  children,
}: {
  href: string;
  current: boolean;
  currentKind?: "page" | "location";
  onGo: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onGo}
      aria-current={current ? currentKind : undefined}
      className={clsx(
        "flex min-h-[48px] items-center rounded-xl px-3 font-display text-base font-extrabold transition",
        current ? "bg-paper-2 text-ink" : "text-ink hover:bg-paper-2",
      )}
    >
      <span className={clsx("border-b-2", current ? "border-brand" : "border-transparent")}>{children}</span>
    </Link>
  );
}
