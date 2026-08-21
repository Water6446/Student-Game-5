"use client";

import type { SessionConfig } from "@/lib/game/types";
import { assetName, equalSplitAmounts, numAssets } from "@/lib/game/portfolio";
import { money } from "@/lib/game/format";
import { ArrowDown, ArrowUp } from "@/components/icons";
import { roundCents } from "@/lib/game/math";

/**
 * Per-asset allocation for the portfolio game: one $ field per risky asset,
 * everything unallocated stays in the safe pot. Fields start blank (null) each
 * round — the student must make a deliberate choice, mirroring the basic game.
 */
export function PortfolioAllocationInput({
  config,
  wealth,
  amounts,
  onChange,
  disabled,
}: {
  config: SessionConfig;
  wealth: number;
  /** null entries = untouched (blank field, counts as $0) */
  amounts: (number | null)[];
  onChange: (amounts: (number | null)[]) => void;
  disabled?: boolean;
}) {
  const n = numAssets(config);
  const values = Array.from({ length: n }, (_, i) => amounts[i] ?? null);
  const invested = roundCents(values.reduce<number>((s, a) => s + (a ?? 0), 0));
  const safe = roundCents(wealth - invested);
  const investedPct = wealth > 0 ? Math.round((invested / wealth) * 100) : 0;
  const touched = values.some((a) => a !== null);
  
  const customOdds = (config.assets ?? []).some((a) => a?.good_prob != null);
  const showPerAssetOdds = config.show_odds_to_students && config.market_mode === "auto" && customOdds;

  /** Clamp asset i so the total never exceeds wealth. */
  function setAmount(i: number, raw: number | null) {
    const next = [...values];
    if (raw === null) {
      next[i] = null;
    } else {
      const others = values.reduce<number>((s, a, j) => (j === i ? s : s + (a ?? 0)), 0);
      const clamped = Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, wealth - others));
      next[i] = roundCents(clamped);
    }
    onChange(next);
  }

  function equalSplit() {
    // whole cents that never exceed wealth — the last asset takes the remainder
    onChange(equalSplitAmounts(wealth, n));
  }

  function allSafe() {
    onChange(Array.from({ length: n }, () => 0));
  }

  return (
    <div className="space-y-4">
      {/* Safe vs invested totals — same read as the basic game's split boxes */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-xl border-2 border-ink bg-gain p-3 text-center text-white shadow-card">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide">Safe</div>
          <div className="font-mono text-xl font-bold leading-tight sm:text-2xl">
            {touched ? money(safe) : "—"}
          </div>
          <div className="font-mono text-sm font-semibold text-white/85 sm:text-base">
            {touched ? `${100 - investedPct}%` : "—"}
          </div>
        </div>
        <div className="flex-1 rounded-xl border-2 border-ink bg-loss p-3 text-center text-white shadow-card">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide">
            Invested
          </div>
          <div className="font-mono text-xl font-bold leading-tight sm:text-2xl">
            {touched ? money(invested) : "—"}
          </div>
          <div className="font-mono text-sm font-semibold text-white/85 sm:text-base">
            {touched ? `${investedPct}%` : "—"}
          </div>
        </div>
      </div>

      {/* Split meter: red = invested share, green = safe share */}
      <div className="flex h-3 overflow-hidden rounded-full border-2 border-ink shadow-card">
        <div className="bg-loss transition-all" style={{ width: `${investedPct}%` }} />
        <div className="flex-1 bg-gain transition-all" />
      </div>

      {/* One $ field per asset; whatever isn't allocated stays safe */}
      <ul className="space-y-2">
        {values.map((v, i) => {
          const pct = wealth > 0 && v != null ? Math.round((v / wealth) * 100) : null;
          const prob = config.assets?.[i]?.good_prob ?? config.good_prob ?? 0.6;
          const goodPct = Math.round(prob * 100);
          
          return (
            <li key={i} className="flex items-center gap-2">
              <div className="w-32 shrink-0 flex flex-col justify-center">
                <span className="truncate text-sm font-bold text-ink">
                  {assetName(config, i)}
                </span>
                {showPerAssetOdds && (
                  <span className="flex items-center gap-1 text-[10px] font-mono font-bold">
                    <span className="inline-flex items-center text-gain">
                      <ArrowUp /> {goodPct}%
                    </span>
                    <span className="text-line-strong">·</span>
                    <span className="inline-flex items-center text-loss">
                      <ArrowDown /> {100 - goodPct}%
                    </span>
                  </span>
                )}
              </div>
              <div className="relative flex min-w-0 flex-1 items-center">
                <span className="pointer-events-none absolute left-3 font-mono text-base text-ink-subtle">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  max={wealth}
                  step={0.01}
                  inputMode="decimal"
                  value={v ?? ""}
                  placeholder="0.00"
                  disabled={disabled}
                  onChange={(e) =>
                    setAmount(i, e.target.value === "" ? null : Number(e.target.value))
                  }
                  aria-label={`Amount to invest in ${assetName(config, i)}`}
                  className="w-full min-w-0 rounded-lg border border-line-strong bg-paper py-2 pl-8 pr-3 text-right font-mono text-lg tabular-nums text-ink focus:border-brand"
                />
              </div>
              <span className="w-11 shrink-0 text-right font-mono text-sm font-semibold text-ink-muted">
                {pct == null ? "—" : `${pct}%`}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || wealth <= 0}
          onClick={equalSplit}
          className="flex-1 rounded-lg border border-line-strong bg-paper py-2 text-sm font-semibold text-ink-muted transition hover:border-brand hover:text-ink active:scale-95 disabled:opacity-50"
        >
          Split evenly
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={allSafe}
          className="flex-1 rounded-lg border border-line-strong bg-paper py-2 text-sm font-semibold text-ink-muted transition hover:border-brand hover:text-ink active:scale-95 disabled:opacity-50"
        >
          All safe
        </button>
      </div>

      <p className="text-center font-editorial text-xs italic text-ink-subtle">
        Anything you don&apos;t invest stays in the safe pot
        {(config.risk_free_rate ?? 0) > 0
          ? ` (earns ${Math.round((config.risk_free_rate ?? 0) * 100)}%/round)`
          : ""}
        .
      </p>
    </div>
  );
}
