"use client";

import type { CSSProperties, ReactNode } from "react";
import { clsx } from "./clsx";
import { ArrowDown, ArrowUp } from "./icons";
import { InfoTip } from "./ui";

/*
 * The trading-floor layer (DESIGN.md §8 "The trading floor"). Borrowed, in
 * order, from a Bloomberg terminal (a screen tiled into panels split by sharp
 * lines, each with a title strip), an exchange's market-data row, a news
 * channel's ticker tape and a railway station's split-flap board. Structure
 * without bubbles: one frame subdivided, never boxes floating in space.
 */

/**
 * A tiled frame: one ink border around a grid whose panels are split by ink
 * lines — the 2px gap shows the ink ground through. Panels fill every cell
 * (span the last one if a row would be short), so no ink gap sits empty.
 */
export function PanelGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "grid gap-[2px] overflow-hidden rounded-xl border-2 border-ink bg-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One tile of a PanelGrid: a title strip (small tracked caps on the gold tint,
 * like a terminal panel's header) over its content. `meta` is a short figure
 * beside the title ("8/8 in"); `action` sits at the strip's right end.
 */
export function Panel({
  title,
  info,
  infoLabel,
  meta,
  action,
  icon,
  children,
  className,
  bodyClassName,
  size = "md",
}: {
  title: ReactNode;
  info?: ReactNode;
  infoLabel?: string;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** lg: the projector's panels, whose titles are read from the back row */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <section className={clsx("flex min-w-0 flex-col bg-surface", className)}>
      <header
        className={clsx(
          "flex items-center justify-between gap-3 border-b-[1.5px] border-ink/20 bg-paper-2",
          lg ? "min-h-[56px] px-6" : "min-h-[44px] px-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon ? <span className={clsx("shrink-0 text-ink", lg ? "text-lg" : "text-sm")}>{icon}</span> : null}
          <h2
            className={clsx(
              "truncate font-display font-extrabold uppercase text-ink",
              lg ? "text-base tracking-[0.14em]" : "text-[0.75rem] tracking-[0.12em]",
            )}
          >
            {title}
          </h2>
          {info ? (
            <InfoTip label={infoLabel ?? (typeof title === "string" ? `About ${title.toLowerCase()}` : "More info")}>
              {info}
            </InfoTip>
          ) : null}
          {meta ? (
            <span className="hidden truncate font-mono text-xs text-ink-muted sm:inline">{meta}</span>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
      </header>
      <div className={clsx("flex-1", lg ? "p-6" : "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  /** a quiet line under the figure: its context or change */
  sub?: ReactNode;
  /** colours the figure: a verdict, not decoration */
  tone?: "gain" | "loss";
}

/**
 * The market-data row: a strip of key figures in ruled cells — label in small
 * caps, the figure in mono, a line of context beneath. Two across on a phone,
 * all in one row from sm up.
 */
export function StatStrip({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <dl
      style={{ "--n": items.length } as CSSProperties}
      className={clsx(
        "grid grid-cols-2 gap-[2px] overflow-hidden rounded-xl border-2 border-ink bg-ink",
        "sm:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]",
        // an odd cell out on a phone spans the row instead of leaving ink showing
        "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
        className,
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="min-w-0 bg-surface px-4 py-3">
          <dt className="truncate font-display text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">
            {s.label}
          </dt>
          <dd
            className={clsx(
              "mt-1 truncate font-mono text-xl font-bold leading-tight sm:text-2xl",
              s.tone === "gain" ? "text-gain" : s.tone === "loss" ? "text-loss" : "text-ink",
            )}
          >
            {s.value}
          </dd>
          {s.sub != null ? (
            <dd className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">{s.sub}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export interface TickerItem {
  key: string;
  label: string;
  value: string;
  /** up / down draws the arrow and the colour; omit for a neutral figure */
  dir?: "up" | "down";
}

/**
 * The ticker tape: last round's results running across an ink strip, the way
 * a news channel runs prices. Two copies of the tape sit side by side and the
 * pair slides one copy's width, so it loops without a seam. It pauses under
 * the pointer or keyboard focus (WCAG 2.2.2), and stands still for anyone who
 * asked for reduced motion — it is a summary, not the only place any of it is.
 */
export function Ticker({
  items,
  label = "Latest results",
  className,
  size = "md",
}: {
  items: TickerItem[];
  label?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  if (items.length === 0) return null;
  // Longer tapes run longer, so the speed stays readable either way.
  const duration = `${Math.max(24, items.length * 6)}s`;
  const copy = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((it) => (
        <li
          key={it.key}
          className={clsx(
            "flex shrink-0 items-center gap-2 whitespace-nowrap",
            size === "lg" ? "px-8 py-3 text-2xl" : "px-5 py-2 text-sm",
          )}
        >
          <span
            className={clsx(
              "font-display font-extrabold uppercase tracking-[0.12em] text-paper-inverse/60",
              size === "lg" ? "text-base" : "text-[10px]",
            )}
          >
            {it.label}
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-1 font-mono font-bold",
              it.dir === "up" ? "text-gain-bright" : it.dir === "down" ? "text-loss-bright" : "text-paper-inverse",
            )}
          >
            {it.dir === "up" ? <ArrowUp /> : it.dir === "down" ? <ArrowDown /> : null}
            {it.value}
          </span>
          <span aria-hidden="true" className={clsx("ml-3 rotate-45 bg-brand", size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5")} />
        </li>
      ))}
    </ul>
  );
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={clsx("group relative overflow-hidden bg-ink text-paper-inverse outline-none", className)}
    >
      {/* edge fades, so the tape runs in from behind the frame */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-ink to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-ink to-transparent" />
      <div
        className="flex w-max animate-ticker group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] group-focus:[animation-play-state:paused] motion-reduce:animate-none"
        style={{ animationDuration: duration }}
      >
        {copy(false)}
        {copy(true)}
      </div>
    </div>
  );
}

/**
 * A split-flap board (Solari): each character on its own dark tile with the
 * hinge line across its middle. When a character changes, its tile turns over
 * to the new one — keyed on the character, so only changed tiles flip — and
 * the tiles land in turn. `onInk` lightens the tiles for an ink panel.
 */
export function FlapText({
  text,
  className,
  onInk,
}: {
  text: string;
  className?: string;
  onInk?: boolean;
}) {
  return (
    <span className={clsx("inline-flex gap-[0.1em] font-mono font-black", className)} aria-label={text} role="img">
      {text.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={clsx(
            "relative inline-flex h-[1.3em] w-[0.95em] items-center justify-center overflow-hidden rounded-[0.12em] leading-none [perspective:600px]",
            onInk ? "bg-paper-inverse/10 text-paper-inverse" : "bg-ink text-paper-inverse",
          )}
        >
          <span key={ch} className="inline-block animate-flap" style={{ animationDelay: `${i * 70}ms` }}>
            {ch === " " ? " " : ch}
          </span>
          {/* the hinge */}
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[0.04em] min-h-px -translate-y-1/2 bg-ink/70" />
        </span>
      ))}
    </span>
  );
}
