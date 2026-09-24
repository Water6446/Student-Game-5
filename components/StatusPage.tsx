import Link from "next/link";
import type { ReactNode } from "react";
import { FallbackSiteHeader } from "@/components/marketing/SiteHeaderGate";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui";
import { buttonClasses } from "@/components/button-classes";

export interface StatusAction {
  label: string;
  href: string;
}

/**
 * A dead end that still looks like the site: 404s, "session not found", "you
 * haven't joined this game". Header and footer included, so the way out is
 * always on screen, with one amber primary action and optional quieter ones.
 *
 * Usable from server and client pages alike — it has no state of its own.
 */
export function StatusPage({
  eyebrow,
  title,
  body,
  primary,
  secondary = [],
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  primary: StatusAction;
  secondary?: StatusAction[];
  /** extra content under the actions, e.g. a Try again button on the error page */
  children?: ReactNode;
}) {
  return (
    <>
      {/* The root layout draws the header on site pages; on a game route this
          supplies it, so the way out is always on screen. */}
      <FallbackSiteHeader />
      <main className="min-h-dvh bg-paper-2">
        <div className="mx-auto w-full max-w-md px-5 py-16 sm:py-24">
          <Card className="animate-pop-in">
            {eyebrow ? (
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-ink-muted">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-ink">
              {title}
            </h1>
            {body ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p> : null}
            <Link href={primary.href} className={buttonClasses("gold", "md", "mt-6 w-full")}>
              {primary.label}
            </Link>
            {children}
            {secondary.length > 0 ? (
              <ul className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1">
                {secondary.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="inline-flex min-h-[44px] items-center text-sm font-semibold text-ink-muted underline-offset-4 transition hover:text-ink hover:underline"
                    >
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
