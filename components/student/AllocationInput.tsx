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
  const [unit, setUnit] = useState<"dollar" | "percent">("dollar");
  const safe = cents(wealth - risky);
  const pct = wealth > 0 ? (risky / wealth) * 100 : 0;

  function clamp(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > wealth) return wealth;
    return cents(n);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-xl bg-rose-500/10 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-rose-300">Risky</div>
          <div className="font-mono text-2xl font-bold text-rose-200">{money(risky)}</div>
        </div>
        <div className="flex-1 rounded-xl bg-emerald-500/10 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-emerald-300">Safe</div>
          <div className="font-mono text-2xl font-bold text-emerald-200">{money(safe)}</div>
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
        className="h-3 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-emerald-500 to-rose-500 disabled:opacity-50"
      />

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {(["dollar", "percent"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={clsx(
                "px-3 py-2 text-sm font-semibold",
                unit === u ? "bg-indigo-500 text-white" : "bg-slate-900 text-slate-400",
              )}
            >
              {u === "dollar" ? "$" : "%"}
            </button>
          ))}
        </div>

        {unit === "dollar" ? (
          <input
            type="number"
            min={0}
            max={wealth}
            step={0.01}
            value={risky}
            disabled={disabled}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-lg"
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
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-lg"
          />
        )}
      </div>

      <div className="flex justify-between gap-2">
        {[0, 25, 50, 75, 100].map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onChange(clamp((p / 100) * wealth))}
            className="flex-1 rounded-lg bg-slate-800 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}
