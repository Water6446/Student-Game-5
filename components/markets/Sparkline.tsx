"use client";

import { clsx } from "@/components/clsx";

/**
 * A year of weekly closes as an inline SVG line, green when it ended higher
 * than it started and red when lower (the row's change chip says so in words).
 * Decorative: the label carries the direction for screen readers.
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <span className={clsx("block h-8 w-16", className)} aria-hidden="true" />;
  const w = 64;
  const h = 28;
  const pad = 2;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = pad + (h - 2 * pad) * (1 - (v - lo) / span);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Past year: ${up ? "ended higher" : "ended lower"}`}
      className={clsx("block h-8 w-16 shrink-0", up ? "text-gain" : "text-loss", className)}
    >
      <polyline
        points={`0,${h} ${line} ${w},${h}`}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
