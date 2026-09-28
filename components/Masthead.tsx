"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "@/components/icons";

/**
 * A toolbar cell: full bar height, no box, split from its neighbours by a
 * hairline. Tools are a menu bar, not a row of buttons competing with the
 * screen's one action.
 */
export const TOOL =
  "inline-flex h-12 min-w-[48px] items-center justify-center gap-2 px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-brand-soft hover:text-ink focus-visible:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 sm:px-4";

/** A destructive toolbar cell (Delete): red text, a red wash under the pointer. */
export const TOOL_DANGER = `${TOOL} !text-loss hover:!bg-loss-soft`;

/**
 * The top of every host game screen, in two layers (DESIGN.md §8):
 *
 * 1. The **toolbar** — a cream strip with its own ink rule: the way back and
 *    where you are on the left, the secondary tools (Present, Settings, Finish
 *    early, Delete) as ruled cells on the right. Housekeeping lives here, away
 *    from the game.
 * 2. The **title band** — warm paper: the title and its status, the ONE
 *    primary action (top right; full width under the title on a phone), and a
 *    strip under them for the round progress.
 *
 * Once the title band has scrolled out of view, a slim **condensed bar** drops
 * in at the top of the screen with the title, status and that same action, so
 * a host reading the standings far down the page can still lock or advance the
 * round without scrolling back up (the condensed sticky header pattern).
 */
export function Masthead({
  back,
  crumbs,
  title,
  status,
  tools,
  action,
  children,
  width = "max-w-5xl",
  shortTitle,
}: {
  /** a quiet link back, e.g. to the dashboard */
  back?: { href: string; label: string };
  /** where this is, beside the back link: "Session KXQ7P · Basic" */
  crumbs?: ReactNode;
  title: ReactNode;
  /** a short text status beside the title (OPEN / REVEALED) */
  status?: ReactNode;
  /** toolbar cells, styled with TOOL / TOOL_DANGER */
  tools?: ReactNode;
  /** the screen's one primary action */
  action?: ReactNode;
  /** a strip under the title row: the round progress */
  children?: ReactNode;
  width?: string;
  /** the condensed bar's title, when the full one carries a medallion or more */
  shortTitle?: ReactNode;
}) {
  const band = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);
  // keyed on whether there IS an action: the element itself is new every render
  const hasAction = action != null;
  useEffect(() => {
    const el = band.current;
    if (!hasAction || !el || typeof IntersectionObserver === "undefined") return;
    // Condensed only once the whole band is above the viewport, never while
    // any of it (and so the action itself) is still on screen.
    const io = new IntersectionObserver(([e]) => setCondensed(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [hasAction]);

  return (
    <header>
      {condensed && action ? (
        <div className="fixed inset-x-0 top-0 z-30 animate-slide-down border-b-2 border-ink bg-paper motion-reduce:animate-none">
          <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-4 sm:px-6 ${width}`}>
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="truncate font-display text-xl font-black uppercase leading-none tracking-tight text-ink">
                {shortTitle ?? title}
              </span>
              <span className="hidden sm:inline">{status}</span>
            </div>
            {/* the same action, at bar size */}
            <div className="shrink-0 [&>*]:!min-h-[40px] [&>*]:!w-auto [&>*]:!px-4 [&>*]:!py-1 [&>*]:!text-base [&>*]:!shadow-card [&>*]:whitespace-nowrap">
              {action}
            </div>
          </div>
        </div>
      ) : null}
      {back || crumbs || tools ? (
        <div className="border-b-2 border-ink bg-surface">
          <div className={`mx-auto flex items-stretch justify-between gap-2 px-1 sm:px-3 ${width}`}>
            <div className="flex min-w-0 items-stretch">
              {back ? (
                <Link href={back.href} className={TOOL}>
                  <ArrowLeft /> <span className="hidden sm:inline">{back.label}</span>
                </Link>
              ) : null}
              {crumbs ? (
                <div className="hidden min-w-0 items-center gap-2 truncate border-l-[1.5px] border-ink/15 px-4 font-mono text-xs text-ink-muted md:flex">
                  {crumbs}
                </div>
              ) : null}
            </div>
            {tools ? (
              <div className="flex items-stretch divide-x-[1.5px] divide-ink/15 border-l-[1.5px] border-ink/15">
                {tools}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div ref={band} className="border-b-2 border-ink bg-paper">
        <div className={`mx-auto px-4 pb-5 pt-6 sm:px-6 sm:pt-7 ${width}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-ink sm:text-5xl">
                {title}
              </h1>
              {status}
            </div>
            {action ? <div className="w-full shrink-0 sm:w-auto sm:min-w-[15rem]">{action}</div> : null}
          </div>
          {children ? <div className="mt-5">{children}</div> : null}
        </div>
      </div>
    </header>
  );
}
