"use client";

import { memo } from "react";
import { Skeleton } from "@/components/ui";
import { lazyModule, useLazyModule } from "@/components/use-lazy-module";
import type { WealthChartProps } from "@/components/host/WealthChartPlot";

/**
 * Recharts is the heaviest dependency on the host screens (~100 kB), so the plot
 * lives in its own chunk (WealthChartPlot.tsx). It starts downloading the moment
 * a chart mounts — usually long before the first reveal gives it anything to
 * draw — and every later mount renders the real chart on its first frame.
 */
const PLOT = lazyModule(() => import("@/components/host/WealthChartPlot"));

export const WealthChart = memo(function WealthChart(props: WealthChartProps) {
  const plot = useLazyModule(PLOT);

  // Nothing revealed yet: the plot has nothing to draw, so this needs no chunk.
  if (!props.rounds.some((r) => r.status === "revealed")) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-ink bg-paper-2 font-editorial text-sm italic text-ink-subtle">
        The wealth chart appears after the first round is revealed.
      </div>
    );
  }

  if (!plot) {
    // Same footprint as the chart and its toggle row, so nothing jumps.
    return (
      <div role="status" aria-busy="true" className="flex w-full flex-col gap-4">
        <span className="sr-only">Loading the wealth chart…</span>
        <Skeleton className="h-56 w-full sm:h-72" />
        {props.hideToggle ? null : <Skeleton className="h-[52px] w-40" />}
      </div>
    );
  }

  return <plot.WealthChartPlot {...props} />;
});
