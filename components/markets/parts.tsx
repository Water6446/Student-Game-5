"use client";

import type { ReactNode } from "react";
import { clsx } from "@/components/clsx";
import { ArrowDown, ArrowUp } from "@/components/icons";
import { returnText, signedCents } from "@/lib/markets/format";
import type { InstrumentKind } from "@/lib/markets/db";

/**
 * A signed change as a soft-tint pill with its arrow: "+5.23%", "−$12.40".
 * Balances stay ink; this chip is where the colour goes (DESIGN.md §8).
 */
export function ChangeChip({
  value,
  money,
  size = "md",
  className,
}: {
  /** a fraction (0.05 = 5%), or dollars when `money` is set */
  value: number | null | undefined;
  money?: boolean;
  /** "lg": projector type */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const v = value ?? null;
  const text = v == null ? "—" : money ? signedCents(v) : returnText(v);
  const dir = v == null || text.replace(/[^1-9]/g, "") === "" ? 0 : v > 0 ? 1 : -1;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border-2 font-mono font-bold tabular-nums",
        size === "sm" ? "px-1.5 py-px text-xs" : size === "lg" ? "gap-1 border-[3px] px-3 py-1 text-2xl" : "px-2 py-0.5 text-sm",
        dir > 0 && "border-gain/40 bg-gain-soft text-gain",
        dir < 0 && "border-loss/40 bg-loss-soft text-loss",
        dir === 0 && "border-ink/20 bg-paper-2 text-ink-muted",
        className,
      )}
    >
      {dir > 0 ? <ArrowUp aria-hidden="true" /> : dir < 0 ? <ArrowDown aria-hidden="true" /> : null}
      {dir !== 0 ? <span className="sr-only">{dir > 0 ? "up" : "down"}</span> : null}
      {text.replace(/^[+−]/, "")}
    </span>
  );
}

/** A ticker on a small ink-edged block; the index fund's is blue so it reads as "the market". */
export function TickerBadge({ ticker, kind, className }: { ticker: string; kind?: InstrumentKind; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-[3.25rem] shrink-0 items-center justify-center rounded-lg border-2 border-ink px-1.5 py-1 font-mono text-xs font-extrabold tracking-wide text-ink",
        kind === "index_fund" ? "bg-play-soft" : "bg-paper-2",
        className,
      )}
    >
      {ticker}
    </span>
  );
}

/** A small labelled figure: "Buying power $48,210.00". */
export function Stat({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="truncate font-mono text-base font-bold text-ink">{children}</div>
      {hint ? <div className="text-xs text-ink-subtle">{hint}</div> : null}
    </div>
  );
}

/** "Trading open 1:05" / "Trading closed": the round clock as a chip. */
export function ClockChip({ children, tone }: { children: ReactNode; tone: "open" | "urgent" | "closed" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 font-mono text-sm font-bold shadow-card",
        tone === "open" && "bg-surface text-ink",
        tone === "urgent" && "bg-loss text-white",
        tone === "closed" && "bg-paper-2 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
