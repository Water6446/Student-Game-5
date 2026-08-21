"use client";

import type { ManagerPreset, SessionConfig } from "@/lib/game/types";
import {
  MANAGER_PRESETS,
  borrowRate,
  informationRatio,
  managerMathConfig,
  totalVol,
  type ManagerDraft,
} from "@/lib/game/manager";
import { Field, Select, TextInput } from "@/components/ui";
import { ChevronDown } from "@/components/icons";

/**
 * The host's manager setup. Guardrails matter more than flexibility here: every
 * numeric input carries min/max/step and a hint naming the default, and the
 * derived volatility and information ratio are shown so the host can see what
 * they have actually built.
 *
 * Percent inputs throughout — a professor should type 2, not 0.02. Conversion to
 * fractions happens once, at the payload edge.
 */
export function ManagerSetup({
  cfg,
  set,
  drafts,
  onDrafts,
}: {
  cfg: SessionConfig;
  set: <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => void;
  drafts: ManagerDraft[];
  onDrafts: (next: ManagerDraft[]) => void;
}) {
  const marketSd = cfg.market_sd ?? 0.16;
  const borrowPct = pct(borrowRate(managerMathConfig(cfg)));

  function usePreset(key: ManagerPreset) {
    set("manager_preset", key);
    onDrafts(MANAGER_PRESETS[key].map((m) => ({ ...m })));
  }

  function setCount(count: number) {
    const n = Math.max(1, Math.min(8, Math.round(count) || 1));
    const base = MANAGER_PRESETS[cfg.manager_preset ?? "default"];
    onDrafts(
      Array.from(
        { length: n },
        (_, i) => drafts[i] ?? { ...(base[i % base.length] ?? base[0]), name: `Manager ${i + 1}` },
      ),
    );
  }

  function patch(i: number, p: Partial<ManagerDraft>) {
    onDrafts(drafts.map((m, j) => (j === i ? { ...m, ...p } : m)));
  }

  return (
    <div className="space-y-4">
      <Field label="Manager line-up" hint="A one-click starting point; edit anything below.">
        <div className="grid gap-2 sm:grid-cols-3">
          {(["default", "hedge_fund", "market_neutral"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => usePreset(key)}
              className={`rounded-xl border-2 border-ink px-3 py-2 text-left text-sm font-semibold shadow-card transition ${
                (cfg.manager_preset ?? "default") === key
                  ? "bg-brand text-ink"
                  : "bg-surface text-ink-muted hover:bg-paper-2"
              }`}
            >
              <span className="block font-display font-extrabold uppercase tracking-tight">
                {PRESET_LABELS[key].title}
              </span>
              <span className="font-editorial text-xs italic opacity-80">
                {PRESET_LABELS[key].desc}
              </span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Years" hint="One round is one year. Default 25.">
          <TextInput
            type="number"
            min={1}
            max={200}
            step={1}
            value={cfg.num_rounds}
            onChange={(e) => set("num_rounds", clampInt(e.target.value, 1, 200, 25))}
          />
        </Field>
        <Field label="Number of managers" hint="1-8. Default 5.">
          <TextInput
            type="number"
            min={1}
            max={8}
            step={1}
            value={drafts.length}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Index return %/yr" hint="Average market return. Default 8%.">
          <TextInput
            type="number"
            min={-50}
            max={50}
            step={0.5}
            value={pct(cfg.market_mean ?? 0.08)}
            onChange={(e) => set("market_mean", frac(e.target.value, -0.5, 0.5, 0.08))}
          />
        </Field>
        <Field label="Index volatility %" hint="Year-to-year swing. Default 16%.">
          <TextInput
            type="number"
            min={0}
            max={100}
            step={1}
            value={pct(marketSd)}
            onChange={(e) => set("market_sd", frac(e.target.value, 0, 1, 0.16))}
          />
        </Field>
        <Field label="Risk-free rate %/yr" hint="What uninvested cash earns. Default 3%.">
          <TextInput
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={pct(cfg.risk_free_rate ?? 0.03)}
            onChange={(e) => set("risk_free_rate", frac(e.target.value, 0, 0.5, 0.03))}
          />
        </Field>
        <Field
          label="Borrow spread %"
          hint={`Added to the risk-free rate - students borrow at ${borrowPct}%/yr. Default 5%.`}
        >
          <TextInput
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={pct(cfg.borrow_spread ?? 0.05)}
            onChange={(e) => set("borrow_spread", frac(e.target.value, 0, 0.5, 0.05))}
          />
        </Field>
        <Field label="Leverage cap (x)" hint="1.0 disables borrowing. Default 2.0 (Reg-T).">
          <TextInput
            type="number"
            min={1}
            max={3}
            step={0.1}
            value={cfg.leverage_cap ?? 2}
            onChange={(e) => set("leverage_cap", clampNum(e.target.value, 1, 3, 2))}
          />
        </Field>
        <Field label="Shuffle which manager is skilled" hint="Keeps the answer fresh each session.">
          <Select
            value={cfg.shuffle_skill === false ? "no" : "yes"}
            onChange={(e) => set("shuffle_skill", e.target.value === "yes")}
          >
            <option value="yes">Yes - reshuffle every session</option>
            <option value="no">No - skill stays in slot order</option>
          </Select>
        </Field>
      </div>

      {borrowRate(managerMathConfig(cfg)) < (cfg.market_mean ?? 0.08) ? (
        <p className="rounded-xl border-2 border-ink bg-brand-soft px-3 py-2 text-sm text-ink shadow-card">
          Borrowing at {borrowPct}% is cheaper than the index&apos;s{" "}
          {pct(cfg.market_mean ?? 0.08)}% average, so leverage now has a positive expected edge.
          The lesson lands hardest when the two match.
        </p>
      ) : null}

      <div className="space-y-2">
        {drafts.map((m, i) => (
          <ManagerFields
            key={i}
            index={i}
            manager={m}
            marketSd={marketSd}
            onChange={(p) => patch(i, p)}
          />
        ))}
      </div>
    </div>
  );
}

function ManagerFields({
  index,
  manager,
  marketSd,
  onChange,
}: {
  index: number;
  manager: ManagerDraft;
  marketSd: number;
  onChange: (patch: Partial<ManagerDraft>) => void;
}) {
  const vol = totalVol(manager.beta, marketSd, manager.tracking_error);
  const ir = informationRatio(manager.alpha, manager.tracking_error);
  const loud = ir != null && Math.abs(ir) > 1;

  return (
    <details className="group rounded-xl border-2 border-ink bg-paper-2 shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate font-semibold text-ink">
          {manager.name || `Manager ${index + 1}`}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-muted">
          {/* Host-only diagnostics. A student never sees vol or IR. */}
          <span title="approximate total volatility">~{pct(vol)}% vol</span>
          <span title="information ratio = alpha / tracking error">
            IR {ir == null ? "—" : ir.toFixed(2)}
          </span>
          <ChevronDown className="transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-3 border-t-2 border-ink px-4 py-3">
        {loud ? (
          <p className="rounded-lg border-2 border-ink bg-loss-soft px-3 py-2 text-xs font-semibold text-loss">
            An information ratio above 1.0 is world-historically good — the lesson lands better
            below 0.5.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={manager.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Strategy line" hint="One sentence, shown on the prospectus.">
            <TextInput
              value={manager.strategy_line}
              onChange={(e) => onChange({ strategy_line: e.target.value })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Beta" hint="Market exposure. 1.0 tracks the index.">
            <TextInput
              type="number"
              min={-2}
              max={3}
              step={0.1}
              value={manager.beta}
              onChange={(e) => onChange({ beta: clampNum(e.target.value, -2, 3, 1) })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Alpha %/yr" hint="True skill. Plus or minus 2% is already generous.">
            <TextInput
              type="number"
              min={-50}
              max={50}
              step={0.5}
              value={pct(manager.alpha)}
              onChange={(e) => onChange({ alpha: frac(e.target.value, -0.5, 0.5, 0) })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Tracking error %" hint="Noise around the market. Default 5%.">
            <TextInput
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={pct(manager.tracking_error)}
              onChange={(e) => onChange({ tracking_error: frac(e.target.value, 0, 1, 0.05) })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Fee type">
            <Select
              value={manager.fee_type}
              onChange={(e) => {
                const fee_type = e.target.value as ManagerDraft["fee_type"];
                onChange({ fee_type, perf_fee: fee_type === "flat" ? 0 : manager.perf_fee || 0.2 });
              }}
              className="px-3 py-2 text-sm"
            >
              <option value="flat">Flat management fee</option>
              <option value="performance">Management + performance</option>
            </Select>
          </Field>
          <Field label="Management fee %/yr" hint="Charged even in a losing year. Max 10%.">
            <TextInput
              type="number"
              min={0}
              max={10}
              step={0.25}
              value={pct(manager.mgmt_fee)}
              onChange={(e) => onChange({ mgmt_fee: frac(e.target.value, 0, 0.1, 0.01) })}
              className="px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Performance fee %" hint="Of the positive gross return. Max 50%.">
            <TextInput
              type="number"
              min={0}
              max={50}
              step={1}
              disabled={manager.fee_type === "flat"}
              value={pct(manager.perf_fee)}
              onChange={(e) => onChange({ perf_fee: frac(e.target.value, 0, 0.5, 0.2) })}
              className="px-3 py-2 text-sm disabled:opacity-50"
            />
          </Field>
        </div>
      </div>
    </details>
  );
}

const PRESET_LABELS: Record<ManagerPreset, { title: string; desc: string }> = {
  default: { title: "Standard", desc: "5 long-only funds, 1% flat fees" },
  hedge_fund: { title: "Hedge fund", desc: "The same 5, at 2% + 20%" },
  market_neutral: { title: "Market neutral", desc: "Adds Parity Absolute Return" },
};

/** Fraction to a display percent. */
function pct(v: number): number {
  return Math.round(v * 1000) / 10;
}

/** Percent string to a clamped fraction. */
function frac(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw) / 100;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
