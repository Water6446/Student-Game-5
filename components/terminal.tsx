"use client";

import type { CSSProperties, ReactNode } from "react";
import { clsx } from "./clsx";
import { ArrowDown, ArrowUp } from "./icons";
import { InfoTip } from "./ui";
import { useFun } from "./use-fun";

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
 * beside the title ("8/8 in"); `action` sits at the strip's right end. A
 * `bodyClassName` with any padding in it (`p-0` for edge-to-edge content)
 * replaces the default padding instead of fighting it.
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
      <div className={clsx("flex-1", !ownsPadding(bodyClassName) && (lg ? "p-6" : "p-4 sm:p-5"), bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/**
 * Whether a body class string sets its own padding (p-0, px-2 pt-3, sm:p-4…).
 * If it does, it replaces the panel's default padding outright: two padding
 * utilities on one element are settled by stylesheet order, not by which was
 * written last, so "p-4 p-0" silently kept the 16px.
 */
function ownsPadding(cls: string | undefined): boolean {
  return cls != null && /(^|\s)([a-z0-9]+:)*p[xytrbl]?-/.test(cls);
}

export interface Stat {
  label: string;
  value: ReactNode;
  /** a quiet line under the figure: its context or change */
  sub?: ReactNode;
  /** colours the figure: a verdict or a rate, never a balance */
  tone?: "gain" | "loss";
  /** colours the line under it: the change beside a balance */
  subTone?: "gain" | "loss";
  /** the figure's history, drawn as a sparkline beside it */
  spark?: number[];
  /** what the sparkline shows, for its tooltip: "Class average by round" */
  sparkLabel?: string;
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
          <dd className="mt-1 flex min-w-0 items-end justify-between gap-2">
            <span
              className={clsx(
                "min-w-0 truncate font-mono text-xl font-bold leading-tight sm:text-2xl",
                s.tone === "gain" ? "text-gain" : s.tone === "loss" ? "text-loss" : "text-ink",
              )}
            >
              {s.value}
            </span>
            {/* a strip of six has no room beside the figure; the figure wins */}
            {s.spark && items.length <= 5 ? (
              <Sparkline values={s.spark} label={s.sparkLabel ?? s.label} className="hidden shrink-0 md:block" />
            ) : null}
          </dd>
          {s.sub != null ? (
            <dd
              className={clsx(
                "mt-0.5 truncate font-mono text-[11px]",
                s.subTone === "gain" ? "font-bold text-gain" : s.subTone === "loss" ? "font-bold text-loss" : "text-ink-muted",
              )}
            >
              {s.sub}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * A figure's history as a sparkline: a thin muted line over a dashed baseline
 * at its first value, the latest point dotted in the direction it went
 * (green up / red down from the start). A stat tile's trend, not a chart — no
 * axes; the tooltip lists the values.
 */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const w = 72;
  const h = 26;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const up = last >= values[0];
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={clsx("overflow-visible", className)} role="img" aria-label={label}>
      <title>{`${label}: ${values.map(fmt).join(" → ")}`}</title>
      <line x1={0} x2={w} y1={y(values[0])} y2={y(values[0])} stroke="rgb(var(--ink))" strokeOpacity={0.25} strokeDasharray="2 2" />
      <path d={d} fill="none" stroke="rgb(var(--ink-muted))" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={x(values.length - 1)}
        cy={y(last)}
        r={3}
        fill={up ? "rgb(var(--gain))" : "rgb(var(--loss))"}
        stroke="rgb(var(--surface))"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export interface TickerItem {
  key: string;
  label: string;
  value: string;
  /** up / down draws the arrow and the colour; omit for a neutral figure */
  dir?: "up" | "down";
  /** left off the still tape: a figure the page already shows elsewhere */
  secondary?: boolean;
}

/**
 * The ticker tape: last round's results on an ink strip, the way a news
 * channel runs prices. It stands still by default — a moving strip competes
 * with the standings for the eye — and scrolls only when the host turns it on
 * (Settings → Fun). Still, it is a row of ruled cells led by the round's
 * verdict on amber, sliding sideways by hand on a phone.
 *
 * Scrolling, two copies of the tape sit side by side and the pair slides one
 * copy's width, so it loops without a seam. It pauses under the pointer or
 * keyboard focus (WCAG 2.2.2), and stands still for anyone who asked for
 * reduced motion — it is a summary, not the only place any of it is.
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
  const [moving] = useFun("ticker");
  if (items.length === 0) return null;
  const lg = size === "lg";

  const value = (it: TickerItem, onAmber = false) => (
    <span
      className={clsx(
        "inline-flex items-center gap-1 font-mono font-bold",
        onAmber
          ? "text-ink"
          : it.dir === "up"
            ? "text-gain-bright"
            : it.dir === "down"
              ? "text-loss-bright"
              : "text-paper-inverse",
      )}
    >
      {it.dir === "up" ? <ArrowUp /> : it.dir === "down" ? <ArrowDown /> : null}
      {it.value}
    </span>
  );
  const labelCls = (onAmber = false) =>
    clsx(
      "font-display font-extrabold uppercase tracking-[0.12em]",
      onAmber ? "text-ink/70" : "text-paper-inverse/60",
      lg ? "text-base" : "text-[10px]",
    );

  if (!moving) {
    const shown = items.filter((it) => !it.secondary);
    return (
      <div role="region" aria-label={label} className={clsx("relative bg-ink text-paper-inverse", className)}>
        <ul tabIndex={0} className="no-scrollbar flex overflow-x-auto outline-none">
          {shown.map((it, i) => (
            <li
              key={it.key}
              className={clsx(
                "flex shrink-0 items-center gap-2 whitespace-nowrap",
                lg ? "px-8 py-3 text-2xl" : "px-5 py-2 text-sm",
                // the verdict leads, on amber; the rest are ruled cells
                i === 0 ? "bg-brand" : "border-r border-paper-inverse/15",
              )}
            >
              <span className={labelCls(i === 0)}>{it.label}</span>
              {value(it, i === 0)}
            </li>
          ))}
        </ul>
        {/* a fade at the right edge: there is more if the strip overflows */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink to-transparent" />
      </div>
    );
  }

  // Longer tapes run longer, so the speed stays readable either way.
  const duration = `${Math.max(24, items.length * 6)}s`;
  const copy = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((it) => (
        <li
          key={it.key}
          className={clsx(
            "flex shrink-0 items-center gap-2 whitespace-nowrap",
            lg ? "px-8 py-3 text-2xl" : "px-5 py-2 text-sm",
          )}
        >
          <span className={labelCls()}>{it.label}</span>
          {value(it)}
          <span aria-hidden="true" className={clsx("ml-3 rotate-45 bg-brand", lg ? "h-2 w-2" : "h-1.5 w-1.5")} />
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
  // Settings → Fun: off, the tiles simply show their characters.
  const [flips] = useFun("flaps");
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
          <span
            key={ch}
            className={clsx("inline-block", flips && "animate-flap")}
            style={flips ? { animationDelay: `${i * 70}ms` } : undefined}
          >
            {ch === " " ? " " : ch}
          </span>
          {/* the hinge */}
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[0.04em] min-h-px -translate-y-1/2 bg-ink/70" />
        </span>
      ))}
    </span>
  );
}
