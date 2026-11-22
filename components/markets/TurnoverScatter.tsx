"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clsx } from "@/components/clsx";
import { niceTicks } from "@/components/markets/PriceChart";
import { returnText } from "@/lib/markets/format";
import type { ClassPoint } from "@/lib/markets/trading/reveal";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const turnoverTick = (t: number) => `${Number(t.toFixed(2))}×`;

/**
 * The class on one chart: annual turnover across, total return up, one dot
 * per student (the viewer's own in amber, labelled "You"), and a dashed line
 * at the return of buying and holding the index fund. Inline SVG like
 * PriceChart. Names appear only as hover titles, and only when `showNames`
 * (the host's control screen); students and the projector see dots.
 */
export function TurnoverScatter({
  points,
  indexReturn,
  ariaLabel,
  height = 260,
  size = "md",
  showNames = false,
  className,
}: {
  points: ClassPoint[];
  indexReturn: number | null;
  ariaLabel: string;
  height?: number;
  /** "lg": projector type (DESIGN.md §9) */
  size?: "md" | "lg";
  showNames?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
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
  const AXIS = big ? 116 : 58;
  const TOP = big ? 40 : 22;
  const BOTTOM = big ? 48 : 26;
  const LEFT = big ? 18 : 10;
  const tickText = big ? "text-[22px]" : "text-[11px]";
  const r = big ? 13 : 6;
  const rMe = big ? 18 : 9;
  const plotW = Math.max(0, width - AXIS - LEFT);
  const plotH = Math.max(0, height - TOP - BOTTOM);

  const geo = useMemo(() => {
    if (plotW <= 0 || points.length === 0) return null;
    const xMax = Math.max(...points.map((p) => p.turnover), 0) || 1;
    const ys = points.map((p) => p.ret);
    if (indexReturn != null) ys.push(indexReturn);
    ys.push(0);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (hi - lo < 0.02) {
      lo -= 0.01;
      hi += 0.01;
    }
    const pad = (hi - lo) * 0.1;
    const yLo = lo - pad;
    const yHi = hi + pad;
    const xHi = xMax * 1.06;
    const x = (v: number) => LEFT + (v / xHi) * plotW;
    const y = (v: number) => TOP + (1 - (v - yLo) / (yHi - yLo)) * plotH;
    return { x, y, xTicks: niceTicks(0, xMax, 4), yTicks: niceTicks(lo, hi, 4) };
  }, [points, indexReturn, plotW, plotH, LEFT, TOP]);

  // the viewer's dot last, so it sits on top
  const ordered = useMemo(() => [...points].sort((a, b) => Number(a.me) - Number(b.me)), [points]);

  return (
    <div className={className}>
      <div ref={wrap} role="img" aria-label={ariaLabel} className="relative w-full" style={{ height }}>
        {geo ? (
          <svg width={width} height={height} className="block overflow-visible" aria-hidden="true">
            <text x={LEFT + plotW + 6} y={big ? 16 : 9} className={clsx("fill-ink-muted font-display font-extrabold uppercase", big ? "text-[20px]" : "text-[10px]")}>
              Return
            </text>
            {geo.yTicks.map((t) => (
              <g key={`y${t}`}>
                <line x1={LEFT} x2={LEFT + plotW} y1={geo.y(t)} y2={geo.y(t)} className="stroke-ink" strokeOpacity={Math.abs(t) < 1e-9 ? 0.3 : 0.1} strokeWidth={1} />
                <text x={LEFT + plotW + 6} y={geo.y(t)} dominantBaseline="middle" className={clsx("fill-ink-muted font-mono", tickText)}>
                  {returnText(t, 0)}
                </text>
              </g>
            ))}
            {geo.xTicks.map((t) => (
              <text
                key={`x${t}`}
                x={geo.x(t)}
                y={height - (big ? 8 : 4)}
                textAnchor={t === 0 ? "start" : "middle"}
                className={clsx("fill-ink-muted font-mono", tickText)}
              >
                {turnoverTick(t)}
              </text>
            ))}
            {indexReturn != null ? (
              <g>
                <line
                  x1={LEFT}
                  x2={LEFT + plotW}
                  y1={geo.y(indexReturn)}
                  y2={geo.y(indexReturn)}
                  className="stroke-ink"
                  strokeOpacity={0.6}
                  strokeDasharray={big ? "10 8" : "5 4"}
                  strokeWidth={big ? 2.5 : 1.5}
                />
                <text
                  x={LEFT + 4}
                  y={geo.y(indexReturn) - (big ? 10 : 5)}
                  className={clsx("fill-ink font-display font-extrabold uppercase", big ? "text-[18px]" : "text-[10px]")}
                >
                  Index fund
                </text>
              </g>
            ) : null}
            {ordered.map((p, i) => (
              <g key={p.id ?? `p${i}`}>
                <circle
                  cx={geo.x(p.turnover)}
                  cy={geo.y(p.ret)}
                  r={p.me ? rMe : r}
                  className={clsx("stroke-ink", p.me ? "fill-brand" : "fill-play")}
                  fillOpacity={p.me ? 1 : 0.7}
                  strokeWidth={p.me ? (big ? 3.5 : 2.5) : big ? 2 : 1.25}
                >
                  {showNames && p.name ? (
                    <title>{`${p.name}: ${returnText(p.ret, 1)}, ${turnoverTick(p.turnover)} a year`}</title>
                  ) : null}
                </circle>
                {p.me ? (
                  <text
                    x={geo.x(p.turnover) + rMe + 4}
                    y={geo.y(p.ret)}
                    dominantBaseline="middle"
                    className={clsx("fill-ink font-display font-extrabold uppercase", big ? "text-[22px]" : "text-[11px]")}
                  >
                    You
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        ) : null}
      </div>
      <p className={clsx("mt-1 text-right font-mono text-ink-subtle", big ? "text-[20px]" : "text-[11px]")}>
        Times traded over, per year →
      </p>
    </div>
  );
}
