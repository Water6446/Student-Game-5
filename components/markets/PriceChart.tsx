"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clsx } from "@/components/clsx";

export interface ChartPoint {
  /** position on the time axis (a game day, or a running index) */
  x: number;
  value: number;
  /** what the scrub readout calls this point: "Year 2 · Mar 14" */
  label: string;
}

export interface ChartMarker {
  x: number;
  kind: "buy" | "sell";
  label: string;
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Three or four round numbers spanning [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 3): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/**
 * The trading screens' line chart: an inline SVG (no chart library), so it
 * draws on the first frame and scrubs smoothly on a phone.
 *
 * - Drag or hover to scrub; `onScrub` gets the point under the finger (null
 *   when it lifts) so the screen's headline figure can follow it. The chart
 *   is focusable and the arrow keys scrub too.
 * - Green when the line ends at or above `baseline` (or its first value), red
 *   below; the caller's change chip says the same in words.
 * - `animate` draws the line left to right (the period replay); the global
 *   reduced-motion reset makes it appear at once.
 */
export function PriceChart({
  points,
  height = 200,
  format,
  baseline,
  markers,
  onScrub,
  animate = false,
  ariaLabel,
  className,
  size = "md",
}: {
  points: ChartPoint[];
  height?: number;
  /** y-axis labels */
  format: (v: number) => string;
  /** a dashed reference line: the previous close, the starting cash */
  baseline?: number | null;
  markers?: ChartMarker[];
  onScrub?: (p: ChartPoint | null) => void;
  animate?: boolean;
  ariaLabel: string;
  className?: string;
  /** "lg": projector type (DESIGN.md §9: ~24px text), a heavier line */
  size?: "md" | "lg";
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [idx, setIdx] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const big = size === "lg";
  const AXIS = big ? 104 : 54;
  const TOP = big ? 16 : 10;
  const BOTTOM = big ? 40 : 22;
  const tickText = big ? "text-[22px]" : "text-[11px]";
  const plotW = Math.max(0, width - AXIS);
  const plotH = Math.max(0, height - TOP - BOTTOM);

  const geo = useMemo(() => {
    if (points.length === 0 || plotW <= 0) return null;
    const values = points.map((p) => p.value);
    if (baseline != null) values.push(baseline);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi === lo) {
      const pad = Math.abs(hi) * 0.02 || 1;
      lo -= pad;
      hi += pad;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const x0 = points[0].x;
    const x1 = points[points.length - 1].x;
    const xs = points.map((p) => (x1 === x0 ? plotW / 2 : ((p.x - x0) / (x1 - x0)) * plotW));
    const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * plotH;
    const ys = points.map((p) => y(p.value));
    const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    const area = `${line} L${xs[xs.length - 1].toFixed(1)} ${TOP + plotH} L${xs[0].toFixed(1)} ${TOP + plotH} Z`;
    return { xs, ys, y, lo, hi, line, area, ticks: niceTicks(lo + pad, hi - pad) };
  }, [points, baseline, plotW, plotH]);

  // mono digits are ~0.6em wide
  const charW = big ? 13.5 : 6.8;
  const firstFits =
    points.length < 2 ||
    ((points[0]?.label.length ?? 0) + (points[points.length - 1]?.label.length ?? 0)) * charW + 24 <= plotW;

  const ref = baseline ?? points[0]?.value ?? 0;
  const up = (points[points.length - 1]?.value ?? 0) >= ref;

  // The scrub index must stay inside a changing series.
  const shown = idx != null && idx < points.length ? idx : null;
  const scrubCb = useRef(onScrub);
  scrubCb.current = onScrub;
  useEffect(() => {
    scrubCb.current?.(shown == null ? null : points[shown]);
  }, [shown, points]);

  function nearest(clientX: number): number | null {
    if (!geo || !wrap.current) return null;
    const left = wrap.current.getBoundingClientRect().left;
    const px = clientX - left;
    let lo = 0;
    let hi = geo.xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (geo.xs[mid] < px) lo = mid;
      else hi = mid;
    }
    return Math.abs(geo.xs[lo] - px) <= Math.abs(geo.xs[hi] - px) ? lo : hi;
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" || e.buttons > 0 || e.type === "pointerdown") setIdx(nearest(e.clientX));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const last = points.length - 1;
    const step = Math.max(1, Math.round(points.length / 40));
    const cur = shown ?? last;
    let next: number | null = cur;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - step);
    else if (e.key === "ArrowRight") next = Math.min(last, cur + step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setIdx(next);
  }

  const markerAt = (x: number) => {
    if (!geo) return null;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - x) < Math.abs(points[best].x - x)) best = i;
    }
    return { cx: geo.xs[best], cy: geo.ys[best] };
  };

  return (
    <div
      ref={wrap}
      role="group"
      aria-label={ariaLabel}
      tabIndex={points.length > 1 ? 0 : -1}
      onKeyDown={onKey}
      onPointerDown={onMove}
      onPointerMove={onMove}
      onPointerUp={(e) => e.pointerType !== "mouse" && setIdx(null)}
      onPointerLeave={() => setIdx(null)}
      onPointerCancel={() => setIdx(null)}
      onBlur={() => setIdx(null)}
      className={clsx("relative w-full select-none rounded-xl touch-pan-y", className)}
      style={{ height }}
    >
      {geo ? (
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {geo.ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={plotW}
                y1={geo.y(t)}
                y2={geo.y(t)}
                className="stroke-ink"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={geo.y(t)}
                dominantBaseline="middle"
                className={clsx("fill-ink-muted font-mono", tickText)}
              >
                {format(t)}
              </text>
            </g>
          ))}
          {baseline != null ? (
            <line
              x1={0}
              x2={plotW}
              y1={geo.y(baseline)}
              y2={geo.y(baseline)}
              className="stroke-ink"
              strokeOpacity={0.45}
              strokeDasharray="4 4"
              strokeWidth={1.25}
            />
          ) : null}
          <path d={geo.area} className={clsx(up ? "fill-gain" : "fill-loss", animate && "animate-fade-in")} fillOpacity={0.1} />
          <path
            d={geo.line}
            fill="none"
            className={clsx(up ? "stroke-gain" : "stroke-loss", animate && "animate-draw")}
            strokeWidth={big ? 5 : 2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...(animate ? { pathLength: 1, strokeDasharray: 1 } : {})}
          />
          {(markers ?? []).map((m, i) => {
            const at = markerAt(m.x);
            if (!at) return null;
            return (
              <g key={`${m.x}-${i}`} transform={`translate(${at.cx} ${at.cy})`}>
                <circle r={8} className={clsx("stroke-ink", m.kind === "buy" ? "fill-gain" : "fill-loss")} strokeWidth={1.5} />
                <text textAnchor="middle" dominantBaseline="central" className="fill-white font-display text-[9px] font-extrabold">
                  {m.kind === "buy" ? "B" : "S"}
                </text>
              </g>
            );
          })}
          {shown != null ? (
            <g>
              <line
                x1={geo.xs[shown]}
                x2={geo.xs[shown]}
                y1={TOP}
                y2={TOP + plotH}
                className="stroke-ink"
                strokeWidth={1.25}
              />
              <circle
                cx={geo.xs[shown]}
                cy={geo.ys[shown]}
                r={5}
                className="fill-surface stroke-ink"
                strokeWidth={2}
              />
            </g>
          ) : null}
          {/* The first date gives way when both would not fit side by side. */}
          {firstFits ? (
            <text x={0} y={height - 4} className={clsx("fill-ink-muted font-mono", tickText)}>
              {points[0]?.label}
            </text>
          ) : null}
          {points.length > 1 ? (
            <text x={plotW} y={height - 4} textAnchor="end" className={clsx("fill-ink-muted font-mono", tickText)}>
              {points[points.length - 1].label}
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
