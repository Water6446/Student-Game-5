"use client";

import type { SessionConfig } from "@/lib/game/types";
import { borrowRate, managerMathConfig, managerName, numManagers } from "@/lib/game/manager";
import { money } from "@/lib/game/format";
import { roundCents } from "@/lib/game/math";
import { ChipButton, InfoTip, NumberField } from "@/components/ui";

/**
 * Manager-game allocation: one percent-of-wealth field per manager, plus
 * leverage. Percentages rather than dollars because they are the right mental
 * model for a portfolio and because they carry forward year to year while the
 * dollar column moves — see the carry-forward rule in StudentRound.
 */
export function ManagerAllocationInput({
  config,
  wealth,
  percents,
  onChange,
  disabled,
}: {
  config: SessionConfig;
  wealth: number;
  /** null entries = untouched (blank field, counts as 0%) */
  percents: (number | null)[];
  onChange: (percents: (number | null)[]) => void;
  disabled?: boolean;
}) {
  const n = numManagers(config);
  const cfg = managerMathConfig(config);
  const capPct = Math.round(cfg.leverageCap * 100);
  const values = Array.from({ length: n }, (_, i) => percents[i] ?? null);
  const total = values.reduce<number>((s, p) => s + (p ?? 0), 0);
  const invested = roundCents((total / 100) * wealth);
  const borrowed = Math.max(invested - wealth, 0);
  const cash = Math.max(wealth - invested, 0);
  const ratePct = Math.round(borrowRate(cfg) * 100);

  /** Clamp one field so the TOTAL can never exceed the cap the server enforces. */
  function setPercent(i: number, raw: number | null) {
    const next = [...values];
    if (raw === null) {
      next[i] = null;
    } else {
      const others = values.reduce<number>((s, p, j) => (j === i ? s : s + (p ?? 0)), 0);
      const room = Math.max(capPct - others, 0);
      next[i] = Math.round(Math.max(0, Math.min(Number.isFinite(raw) ? raw : 0, room)));
    }
    onChange(next);
  }

  function spread(totalPct: number) {
    // whole percents that never exceed the target; the last field takes the rest
    const share = Math.floor(totalPct / n);
    onChange(Array.from({ length: n }, (_, i) => (i === n - 1 ? totalPct - share * (n - 1) : share)));
  }

  // Meter geometry: the whole track spans 0..capPct, so the 100% mark sits at a
  // fixed place and crossing it is a visible event rather than a rescale.
  const pctOf = (p: number) => `${(Math.min(p, capPct) / capPct) * 100}%`;

  return (
    <div className="space-y-4">
      {/* Wealth itself sits in the round header right above this card. */}
      <ul className="space-y-2">
        {values.map((p, i) => {
          const dollars = p == null ? null : roundCents((p / 100) * wealth);
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {managerName(config, i)}
              </span>
              {/* Room for three digits (up to the leverage cap, e.g. 200) plus the
                  % suffix; NumberField hides the native spinner, which sat on
                  top of the digits at this width. Arrow keys still step it. */}
              <NumberField
                suffix="%"
                wrapperClassName="w-24 shrink-0"
                min={0}
                max={capPct}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={p ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  setPercent(i, e.target.value === "" ? null : Number(e.target.value))
                }
                aria-label={`Percent of wealth with ${managerName(config, i)}`}
              />
              <span className="w-[4.5rem] shrink-0 truncate text-right font-mono text-sm text-ink-muted">
                {dollars == null || dollars === 0 ? "—" : money(dollars)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* One total meter, not per-manager bars: what matters is how much of your
          wealth is at work, and whether you have crossed into borrowing. */}
      <div>
        <div className="relative flex h-3 overflow-hidden rounded-full border-2 border-ink">
          <div
            className="bg-gain transition-[width] duration-300 ease-out"
            style={{ width: pctOf(Math.min(total, 100)) }}
          />
          <div
            className="bg-loss transition-[width] duration-300 ease-out"
            style={{ width: pctOf(Math.max(total - 100, 0)) }}
          />
          <div className="flex-1 bg-paper-2" />
          {capPct > 100 ? (
            <span
              aria-hidden="true"
              className="absolute top-0 h-full w-0.5 bg-ink"
              style={{ left: pctOf(100) }}
            />
          ) : null}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] font-bold text-ink-muted">
          <span>0%</span>
          {capPct > 100 ? <span>100% · borrowing starts</span> : null}
          <span>{capPct}%</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-ink">
          Invested <span className="font-bold">{total}%</span>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-ink-muted">
          Cash {money(cash)}
          <InfoTip label="About cash and percentages">
            Anything you don&apos;t invest earns the risk-free{" "}
            {Math.round((config.risk_free_rate ?? 0.03) * 100)}%/yr. Percentages are of your
            current wealth, so they hold from year to year while the dollars move.
          </InfoTip>
        </span>
      </div>

      {/* The cost of leverage is never one click away — it names the rate. */}
      {borrowed > 0 ? (
        <p className="rounded-xl border-2 border-ink bg-loss-soft px-3 py-2 text-center font-mono text-sm font-bold text-loss">
          Borrowed {money(borrowed)} at {ratePct}%/yr
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex">
        <ChipButton disabled={disabled} onClick={() => spread(0)} active={total === 0}>
          All cash
        </ChipButton>
        <ChipButton disabled={disabled} onClick={() => spread(100)}>
          Equal split
        </ChipButton>
        <ChipButton
          disabled={disabled}
          onClick={() => onChange(values.map((_, i) => (i === 0 ? 100 : 0)))}
        >
          100% first
        </ChipButton>
        {capPct > 100 ? (
          <ChipButton disabled={disabled} onClick={() => spread(capPct)} active={total === capPct}>
            Max ({cfg.leverageCap}×)
          </ChipButton>
        ) : null}
      </div>
    </div>
  );
}
