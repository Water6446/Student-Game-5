"use client";

import { useMemo } from "react";
import type { ManagerPublic, SessionConfig } from "@/lib/game/types";
import { rollingProspectuses } from "@/lib/game/manager";
import { signedPct } from "@/lib/game/format";
import { CondensedList } from "@/components/CondensedList";
import { InfoTip } from "@/components/ui";

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
  managerReturns,
  className,
}: {
  config: SessionConfig;
  /** GROSS manager returns for each REVEALED year, oldest first. Supplying them
   *  rolls every card forward: the year just played joins the track record and
   *  the oldest year drops off, so a card can never advertise a decade that
   *  contradicts what the class watched happen. Omit it before the game starts. */
  managerReturns?: (number[] | null)[];
  className?: string;
}) {
  const base = config.managers ?? [];
  const played = managerReturns?.length ?? 0;
  const managers = useMemo(
    () => (played > 0 ? rollingProspectuses(base, managerReturns ?? []) : base),
    [base, managerReturns, played],
  );
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
            <ProspectusCard manager={m} playedYears={Math.min(played, 10)} />
          </li>
        )}
      />
    </div>
  );
}

export function ProspectusCard({
  manager,
  playedYears = 0,
}: {
  manager: ManagerPublic;
  /** how many of the displayed years the class has actually watched */
  playedYears?: number;
}) {
  const t = manager.track_record;
  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-ink bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-base font-extrabold uppercase tracking-tight text-ink">
          {manager.name}
        </span>
        {/* The badge alone was a bare "1% / yr" and read as an unexplained
            statistic — a host asked outright what it meant. Fees stay prominent
            (paying for skill you cannot verify is the module): the badge names
            them, and the InfoTip spells the terms out in words. */}
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border-2 border-ink bg-brand px-2 py-0.5 font-mono text-[11px] font-bold text-ink">
            {feeLine(manager)}
          </span>
          <InfoTip label={`About ${manager.name}'s fees`}>{feeSentence(manager)}</InfoTip>
        </span>
      </div>

      <p className="mt-1 font-editorial text-sm italic text-ink-muted">{manager.strategy_line}</p>

      <Sparkline yearly={t.yearly} playedYears={playedYears} />

      <dl className="mt-2 grid grid-cols-3 gap-1 text-center">
        <Figure label="1 yr" value={t.one_yr} />
        <Figure label="5 yr" value={t.five_yr} annualized />
        <Figure label="10 yr" value={t.ten_yr} annualized />
      </dl>
      {/* "Net of fees" stays visible: the year result shows GROSS returns, and
          without the label the two look like a contradiction. */}
      <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-subtle">
        net of fees
        <InfoTip label="About this track record" className="text-ink-subtle hover:text-ink">
          <p>
            Returns after the manager&apos;s fees. The 5 and 10 yr figures are annualized.
            {playedYears > 0
              ? playedYears >= 10
                ? " All ten years are from this game."
                : ` The last ${playedYears} year${playedYears === 1 ? "" : "s"} ${
                    playedYears === 1 ? "is" : "are"
                  } from this game.`
              : ""}
          </p>
          <p>Past performance reflects both skill and luck and cannot reliably predict the future.</p>
        </InfoTip>
      </div>

      {/* mt-auto pins the row to the card's foot, so a grid of cards with
          strategy lines of different lengths still lines up. */}
      <div className="mt-auto pt-2">
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            Volatility
          </span>
          <span className="font-mono text-sm font-bold text-ink">{manager.vol_label}</span>
        </div>
      </div>
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
function Sparkline({ yearly, playedYears = 0 }: { yearly: number[]; playedYears?: number }) {
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
  // Where the fund's own history ends and the years the class watched begin.
  const boundary =
    playedYears > 0 && playedYears < yearly.length
      ? ((yearly.length - 1 - playedYears) / (yearly.length - 1)) * w
      : null;

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
      {boundary != null ? (
        <line
          x1={boundary}
          x2={boundary}
          y1="0"
          y2={h}
          stroke="currentColor"
          strokeOpacity={0.35}
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

/** The badge: always says the word FEE, so the number is never orphaned. */
function feeLine(m: ManagerPublic): string {
  const mgmt = `${round1(m.mgmt_fee * 100)}%`;
  return m.perf_fee > 0
    ? `FEE ${mgmt} + ${round1(m.perf_fee * 100)}%`
    : `FEE ${mgmt}/yr`;
}

/** The same terms in plain words — what the badge actually costs you. */
function feeSentence(m: ManagerPublic): string {
  const mgmt = `${round1(m.mgmt_fee * 100)}% of your money every year, win or lose`;
  return m.perf_fee > 0
    ? `${mgmt}, plus ${round1(m.perf_fee * 100)}% of any gain.`
    : `${mgmt}.`;
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}
