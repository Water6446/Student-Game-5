"use client";

import { useMemo } from "react";

import { CONFETTI_COLORS } from "@/lib/design/colors";
import { useFun } from "@/components/use-fun";

// Lightweight, dependency-free celebratory confetti. Pure CSS animation; hidden
// automatically under prefers-reduced-motion (see globals.css). Render it only
// when you want the burst (e.g. a GOOD market reveal or the finish screen).
//
// Pieces are ink-outlined paper cut-outs — rectangles with the odd dot — and
// each sways sideways (--drift) and tumbles at its own rate (--spin) as it falls.

export function Confetti({ count = 70 }: { count?: number }) {
  // Settings → Fun can switch it off on this device.
  const [on] = useFun("confetti");
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        scale: 0.7 + Math.random() * 0.8,
        drift: (Math.random() - 0.5) * 220,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
        round: i % 5 === 0,
      })),
    [count],
  );

  if (!on) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`confetti-piece animate-confetti${p.round ? " is-round" : ""}`}
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg) scale(${p.scale})`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
