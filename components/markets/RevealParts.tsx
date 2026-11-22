"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "@/components/clsx";
import { Button, Skeleton } from "@/components/ui";
import { AlertTriangle } from "@/components/icons";
import { TurnoverScatter } from "@/components/markets/TurnoverScatter";
import type { TradingReveal } from "@/lib/markets/db";
import { classPoints, turnoverTakeaway } from "@/lib/markets/trading/reveal";

/**
 * The end-of-game reveal, loaded once: undefined while loading, null when it
 * failed (`retry` tries again). Shared by the student, host and projector
 * finished screens.
 */
export function useReveal(load: () => Promise<TradingReveal | null>) {
  const [reveal, setReveal] = useState<TradingReveal | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    setReveal(undefined);
    loader.current().then(
      (r) => active && setReveal(r),
      () => active && setReveal(null),
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { reveal, retry };
}

/** The reveal's failure state: one line and a retry. */
export function RevealError({ onRetry, what = "The reveal" }: { onRetry: () => void; what?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-loss/40 bg-loss-soft px-4 py-3 text-sm font-semibold text-loss">
      <AlertTriangle aria-hidden="true" />
      <span className="flex-1">{what} could not be loaded.</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function RevealSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/**
 * The class's turnover against return, with the Barber & Odean verdict under
 * it. Students see anonymous dots with their own marked; the host's control
 * screen adds names as hover titles; the projector uses `size="lg"`.
 */
export function ClassTurnover({
  reveal,
  showNames = false,
  size = "md",
  height,
}: {
  reveal: TradingReveal;
  showNames?: boolean;
  size?: "md" | "lg";
  height?: number;
}) {
  const points = classPoints(reveal.class);
  const takeaway = turnoverTakeaway(points, reveal.index_return);
  const big = size === "lg";
  return (
    <div>
      <TurnoverScatter
        points={points}
        indexReturn={reveal.index_return}
        size={size}
        height={height ?? (big ? 520 : 260)}
        showNames={showNames}
        ariaLabel={`Each student's turnover a year against their total return, ${points.length} students. ${takeaway.verdict}`}
      />
      <p className={clsx("mt-3 font-display font-extrabold text-ink", big ? "text-4xl leading-tight" : "text-base")}>
        {takeaway.verdict}
      </p>
      {takeaway.detail ? (
        <p className={clsx("mt-1 font-mono text-ink-muted", big ? "text-2xl" : "text-xs")}>{takeaway.detail}</p>
      ) : null}
    </div>
  );
}
