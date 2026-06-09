"use client";

import { useState } from "react";
import { clsx } from "@/components/clsx";
import { money } from "@/lib/game/format";

/** Round to cents to avoid float dust in the submitted amount. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function AllocationInput({
  wealth,
  risky,
  onChange,
  disabled,
}: {
  wealth: number;
  risky: number;
  onChange: (risky: number) => void;
  disabled?: boolean;
}) {
  const [unit, setUnit] = useState<"dollar" | "percent">("percent");
  const safe = cents(wealth - risky);
  const pct = wealth > 0 ? (risky / wealth) * 100 : 0;
  const riskyPct = Math.round(pct);
  const safePct = wealth > 0 ? Math.round((safe / wealth) * 100) : 0;

  function clamp(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > wealth) return wealth;
    return cents(n);
  }

  return (
    <div className="space-y-4">
      {/* Safe on the left, Risky on the right — matches the slider (drag right = riskier) */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-xl border border-gain/20 bg-gain-soft p-3 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-gain">Safe</div>
          <div className="font-mono text-xl font-bold leading-tight text-gain sm:text-2xl">
            {money(safe)}
          </div>
          <div className="font-mono text-sm font-semibold text-gain/80 sm:text-base">
            {safePct}%
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-loss/20 bg-loss-soft p-3 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-loss">Risky</div>
          <div className="font-mono text-xl font-bold leading-tight text-loss sm:text-2xl">
            {money(risky)}
          </div>
          <div className="font-mono text-sm font-semibold text-loss/80 sm:text-base">
            {riskyPct}%
          </div>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={wealth}
        step={Math.max(wealth / 100, 0.01)}
        value={risky}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label="Amount to put at risk"
        className="game-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-gain via-brand to-loss disabled:opacity-50"
      />

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-line-strong">
          {(["dollar", "percent"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={clsx(
                "w-10 py-2 text-sm font-bold transition",
                unit === u ? "bg-ink text-paper" : "bg-paper text-ink-muted hover:bg-paper-2",
              )}
            >
              {u === "dollar" ? "$" : "%"}
            </button>
          ))}
        </div>

        {/* Symbol prefix + flex-1/min-w-0 input so the value never clips the box. */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="pointer-events-none absolute left-3 font-mono text-base text-ink-subtle">
            {unit === "dollar" ? "$" : "%"}
          </span>
          {unit === "dollar" ? (
            <input
              type="number"
              min={0}
              max={wealth}
              step={0.01}
              value={risky}
              disabled={disabled}
              onChange={(e) => onChange(clamp(Number(e.target.value)))}
              className="w-full min-w-0 rounded-lg border border-line-strong bg-paper py-2 pl-8 pr-3 text-right font-mono text-lg tabular-nums text-ink focus:border-brand"
            />
          ) : (
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(pct)}
              disabled={disabled}
              onChange={(e) => onChange(clamp((Number(e.target.value) / 100) * wealth))}
              className="w-full min-w-0 rounded-lg border border-line-strong bg-paper py-2 pl-8 pr-3 text-right font-mono text-lg tabular-nums text-ink focus:border-brand"
            />
          )}
        </div>
      </div>

      <div className="flex justify-between gap-2">
        {[0, 25, 50, 75, 100].map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onChange(clamp((p / 100) * wealth))}
            className="flex-1 rounded-lg border border-line-strong bg-paper py-2 text-sm font-semibold text-ink-muted transition hover:border-brand hover:text-ink active:scale-95 disabled:opacity-50"
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}
