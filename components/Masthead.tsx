import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@/components/icons";

/**
 * The band across the top of every game screen: warm paper, an ink rule under
 * it, and everything that says where you are and what to do next — the title,
 * its status, the round progress and the ONE primary action, which always sits
 * in the same place (top right; full width under the title on a phone). The
 * page below is the cream sheet the content sits on (DESIGN.md §4, §8).
 */
export function Masthead({
  back,
  title,
  status,
  tools,
  action,
  children,
  width = "max-w-5xl",
}: {
  /** a quiet link back, e.g. to the dashboard */
  back?: { href: string; label: string };
  title: ReactNode;
  /** a short text status beside the title (OPEN / REVEALED) */
  status?: ReactNode;
  /** secondary buttons, top right (Present, Finish early, Delete) */
  tools?: ReactNode;
  /** the screen's one primary action */
  action?: ReactNode;
  /** a strip under the title row: the round progress */
  children?: ReactNode;
  width?: string;
}) {
  return (
    <header className="border-b-2 border-ink bg-paper">
      <div className={`mx-auto px-4 pb-5 pt-4 sm:px-6 ${width}`}>
        {back || tools ? (
          <div className="flex min-h-[40px] items-center justify-between gap-3">
            {back ? (
              <Link
                href={back.href}
                className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
              >
                <ArrowLeft /> {back.label}
              </Link>
            ) : (
              <span />
            )}
            {tools ? <div className="flex items-center gap-1 sm:gap-2">{tools}</div> : null}
          </div>
        ) : null}
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
    </header>
  );
}
