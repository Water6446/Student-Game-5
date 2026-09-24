"use client";

import { useState } from "react";
import { useHotkeys } from "@/components/use-hotkeys";
import { ChipButton, ChipRow, NumberField, Segmented } from "@/components/ui";
import { money } from "@/lib/game/format";
import { roundCents } from "@/lib/game/math";

export function AllocationInput({
  wealth,
  risky,
  onChange,
  disabled,
}: {
  wealth: number;
  /** null = no selection yet — the field is blank until the student enters one. */
  risky: number | null;
  onChange: (risky: number | null) => void;
  disabled?: boolean;
}) {
  const [unit, setUnit] = useState<"dollar" | "percent">("percent");
  // Until the student enters a value (`risky === null`) everything reads blank;
  // `r` is the numeric stand-in only for laying out the (empty) slider track.
  const has = risky !== null;
  const r = risky ?? 0;
  const safe = roundCents(wealth - r);
  const pct = wealth > 0 ? (r / wealth) * 100 : 0;
  const riskyPct = Math.round(pct);
  const safePct = wealth > 0 ? Math.round((safe / wealth) * 100) : 0;

  function clamp(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > wealth) return wealth;
    return roundCents(n);
  }

  // Arrow keys nudge the risky share by 5% of wealth for the handful of students
  // on a laptop. Bound here so the nudge goes through the same clamp() as every
  // other control, and it stands down while focus is in a field — the slider and
  // the number inputs already step on their own.
  useHotkeys(
    {
      arrowleft: () => onChange(clamp(r - wealth * 0.05)),
      arrowright: () => onChange(clamp(r + wealth * 0.05)),
    },
    { enabled: !disabled && wealth > 0 },
  );

  return (
    <div className="space-y-4">
      {/* Safe on the left, Risky on the right — matches the slider (drag right = riskier) */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 rounded-xl border-2 border-ink bg-gain p-3 text-center text-white">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide">Safe</div>
          <div className="font-mono text-xl font-bold leading-tight sm:text-2xl">
            {has ? money(safe) : "—"}
          </div>
          <div className="font-mono text-sm font-semibold text-white/85 sm:text-base">
            {has ? `${safePct}%` : "—"}
          </div>
        </div>
        <div className="flex-1 rounded-xl border-2 border-ink bg-loss p-3 text-center text-white">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide">Risky</div>
          <div className="font-mono text-xl font-bold leading-tight sm:text-2xl">
            {has ? money(r) : "—"}
          </div>
          <div className="font-mono text-sm font-semibold text-white/85 sm:text-base">
            {has ? `${riskyPct}%` : "—"}
          </div>
        </div>
      </div>

      {/* Ink-bordered pill track: red risky fill grows from the left up to the
          handle, green safe remainder to its right — so the color split sits
          exactly under the thumb (thumb position = risky share). */}
      <div
        className="rounded-full border-2 border-ink"
        style={{
          background: has
            ? `linear-gradient(to right, rgb(var(--loss)) ${riskyPct}%, rgb(var(--gain)) ${riskyPct}%)`
            : "rgb(var(--paper-2))",
        }}
      >
        <input
          type="range"
          min={0}
          max={wealth}
          step={Math.max(wealth / 100, 0.01)}
          value={r}
          disabled={disabled}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label="Amount to put at risk"
          className="game-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:opacity-50"
        />
      </div>

      <div className="flex justify-between font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">
        <span>All safe</span>
        <span>All risky</span>
      </div>

      <div className="flex items-center gap-2">
        <Segmented
          label="Enter the amount in"
          value={unit}
          onChange={setUnit}
          options={[
            { value: "dollar", label: "$", ariaLabel: "Dollars" },
            { value: "percent", label: "%", ariaLabel: "Percent of wealth" },
          ]}
        />

        {unit === "dollar" ? (
          <NumberField
            prefix="$"
            min={0}
            max={wealth}
            step={0.01}
            inputMode="decimal"
            placeholder="0.00"
            value={has ? r : ""}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : clamp(Number(e.target.value)))
            }
            aria-label="Dollars to put at risk"
          />
        ) : (
          <NumberField
            suffix="%"
            min={0}
            max={100}
            step={1}
            inputMode="numeric"
            placeholder="0"
            value={has ? Math.round(pct) : ""}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : clamp((Number(e.target.value) / 100) * wealth))
            }
            aria-label="Percent of wealth to put at risk"
          />
        )}
      </div>

      <ChipRow label="Quick amounts">
        {[0, 25, 50, 75, 100].map((p) => (
          <ChipButton
            key={p}
            disabled={disabled}
            active={has && riskyPct === p}
            onClick={() => onChange(clamp((p / 100) * wealth))}
          >
            {p}%
          </ChipButton>
        ))}
      </ChipRow>
    </div>
  );
}
