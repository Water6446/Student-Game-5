"use client";

import type { ManagerPublic, SessionConfig } from "@/lib/game/types";
import { signedPct } from "@/lib/game/format";
import { CondensedList } from "@/components/CondensedList";

/**
 * The manager line-up as a student sees it before hiring: names, fee terms, a
 * ten-year track record and a volatility label.
 *
 * It renders `config.managers` and nothing else. That array is PUBLIC data by
 * construction — beta, alpha and tracking error never leave the server's
 * session_secrets table. Never display an information ratio, a Sharpe, or any
 * other derived skill measure here: the whole module is about not being able to
 * tell skill from luck at this sample size.
 */
export function ManagerProspectus({
  config,
  className,
}: {
  config: SessionConfig;
  className?: string;
}) {
  const managers = config.managers ?? [];
  if (managers.length === 0) return null;

  return (
    <div className={className}>
      <CondensedList
        items={managers}
        keyOf={(m, i) => `${m.name}-${i}`}
        as="ul"
        moreNoun="managers"
        // Five fit comfortably; a bigger line-up collapses like every other list.
        options={{ top: 5, bottom: 0, threshold: 5 }}
        className="grid gap-3 sm:grid-cols-2"
        gapClassName="font-editorial text-sm italic text-ink-subtle hover:text-ink"
        toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        renderItem={(m) => (
          <li>
            <ProspectusCard manager={m} />
          </li>
        )}
      />
    </div>
  );
}

export function ProspectusCard({ manager }: { manager: ManagerPublic }) {
  const t = manager.track_record;
  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-ink bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-base font-extrabold uppercase tracking-tight text-ink">
          {manager.name}
        </span>
        <span className="shrink-0 rounded-full border-2 border-ink bg-brand px-2 py-0.5 font-mono text-[11px] font-bold text-ink">
          {feeLine(manager)}
        </span>
      </div>

      <p className="mt-1 font-editorial text-sm italic text-ink-muted">{manager.strategy_line}</p>

      <Sparkline yearly={t.yearly} />

      <dl className="mt-2 grid grid-cols-3 gap-1 text-center">
        <Figure label="1 yr" value={t.one_yr} />
        <Figure label="5 yr" value={t.five_yr} annualized />
        <Figure label="10 yr" value={t.ten_yr} annualized />
      </dl>
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-ink-subtle">
        net of fees · 5 &amp; 10 yr annualized
      </p>

      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
        <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
          Volatility
        </span>
        <span className="font-mono text-sm font-bold text-ink">{manager.vol_label}</span>
      </div>

      <p className="mt-auto pt-2 text-xs text-ink-subtle">
        Past performance reflects both skill and luck and cannot reliably predict the future.
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  annualized,
}: {
  label: string;
  value: number;
  annualized?: boolean;
}) {
  return (
    <div>
      <dt className="font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
        {label}
        {annualized ? <span className="sr-only"> annualized</span> : null}
      </dt>
      <dd
        className={`font-mono text-sm font-bold ${
          value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-ink-muted"
        }`}
      >
        {signedPct(value * 100, 1)}
      </dd>
    </div>
  );
}

/**
 * Ten years at a glance. Inline SVG rather than a chart dependency, and
 * `currentColor` rather than a hex so it stays on the design tokens.
 */
function Sparkline({ yearly }: { yearly: number[] }) {
  if (yearly.length < 2) return null;
  const w = 100;
  const h = 24;
  const lo = Math.min(...yearly);
  const hi = Math.max(...yearly);
  const span = hi - lo || 1;
  const points = yearly
    .map((v, i) => {
      const x = (i / (yearly.length - 1)) * w;
      const y = h - ((v - lo) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const zeroY = h - ((0 - lo) / span) * h;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Ten-year return history, ${yearly.length} points`}
      className="mt-2 h-6 w-full text-ink"
    >
      {zeroY >= 0 && zeroY <= h ? (
        <line
          x1="0"
          x2={w}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function feeLine(m: ManagerPublic): string {
  const mgmt = `${round1(m.mgmt_fee * 100)}%`;
  return m.perf_fee > 0 ? `${mgmt} + ${round1(m.perf_fee * 100)}%` : `${mgmt} / yr`;
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}
