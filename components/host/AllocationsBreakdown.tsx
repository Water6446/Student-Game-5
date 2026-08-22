"use client";

import { useMemo } from "react";
import type { AllocationRow, PlayerRow } from "@/lib/game/db";
import { strategyFraction } from "@/lib/game/counterfactual";
import { submittedHumanCount } from "@/lib/game/results";
import { portfolioStrategyFraction } from "@/lib/game/portfolio";
import { money, signedMoney } from "@/lib/game/format";
import { Bot } from "@/components/icons";
import { CondensedList } from "@/components/CondensedList";

/**
 * Per-student breakdown of how much each player put at risk this round. Shown to
 * the host once allocations are locked. Bots don't "submit" — they auto-play a
 * fixed strategy — so we show their INTENDED bet (strategy fraction × wealth)
 * rather than treating them as non-submitters. Human non-submitters still default
 * to all-safe. Sorted by risky amount, biggest gambler first.
 */
export function AllocationsBreakdown({
  players,
  allocations,
  goodProb,
  portfolio = false,
  manager = false,
}: {
  players: PlayerRow[];
  allocations: AllocationRow[];
  goodProb: number;
  /** portfolio game: bot strategies bet a different fixed share */
  portfolio?: boolean;
  /** manager game: allocations can exceed 100% of wealth, safe can go negative,
   *  and a non-submitter CARRIES FORWARD instead of defaulting to all-safe */
  manager?: boolean;
}) {
  const rows = useMemo(() => {
    const byPlayer = new Map(allocations.map((a) => [a.player_id, a]));
    const botFraction = (strategy: string | null) =>
      portfolio ? portfolioStrategyFraction(strategy) : strategyFraction(strategy, goodProb);
    return players
      .map((p) => {
        const a = byPlayer.get(p.id);
        const currentWealth = Number(p.current_wealth);
        if (a) {
          // an actual allocation exists (a locked human, or anyone after the
          // round resolves) — base the % on the wealth they bet FROM (risky+safe),
          // not their post-round current_wealth
          const risky = Number(a.risky_amount);
          const safe = Number(a.safe_amount);
          const wealth = risky + safe;
          return {
            id: p.id,
            name: p.display_name,
            wealth,
            risky,
            safe,
            // wiped out ($0) means 0/0 — a bot still plays its fixed strategy
            // share (all-risky stays 100%), a human has no meaningful share
            pct: wealth > 0 ? risky / wealth : p.is_bot ? botFraction(p.strategy) : null,
            isBot: p.is_bot,
            submitted: true,
          };
        }
        if (p.is_bot) {
          // bot's planned bet before the round resolves
          const frac = botFraction(p.strategy);
          const risky = frac * currentWealth;
          return {
            id: p.id,
            name: p.display_name,
            wealth: currentWealth,
            risky,
            safe: currentWealth - risky,
            pct: frac,
            isBot: true,
            submitted: true,
          };
        }
        // Human who hasn't submitted. In the basic and portfolio games that
        // means all-safe, a real 0%. In the MANAGER game the server carries
        // last year's book forward, so their exposure is unknown here rather
        // than zero — claiming 0% told the host the opposite of what resolves.
        return {
          id: p.id,
          name: p.display_name,
          wealth: currentWealth,
          risky: null,
          safe: null,
          pct: manager ? null : currentWealth > 0 ? 0 : null,
          isBot: false,
          submitted: false,
        };
      })
      .sort((x, y) => (y.risky ?? -1) - (x.risky ?? -1));
  }, [players, allocations, goodProb, portfolio, manager]);

  // Same "who has actually submitted" rule as both host counters — one helper so
  // the three surfaces can't drift apart.
  const { submitted: submittedHumans, total: totalHumans } = useMemo(
    () => submittedHumanCount(players, allocations),
    [players, allocations],
  );
  const totalRisky = rows.reduce((s, r) => s + (r.risky ?? 0), 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink">Allocations</span>
        <span className="text-xs text-ink-subtle">
          {submittedHumans}/{totalHumans} in · <span className="font-mono">{money(totalRisky)}</span>{" "}
          at risk
        </span>
      </div>

      {/* Legend: teaches the red=risky / green=safe encoding once, replacing
          per-column headers so each row can stay compact and scannable. */}
      <div className="flex items-center gap-3 pb-1 text-[11px] text-ink-subtle">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-loss" /> risky
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gain" /> safe
        </span>
        <span className="ml-auto">% = share at risk</span>
      </div>

      {/* Sorted biggest gambler first, so the top/bottom split reads as
          "biggest … smallest" — the same cut the standings use. */}
      <CondensedList
        items={rows}
        keyOf={(r) => r.id}
        as="ul"
        className="divide-y divide-line"
        gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        renderItem={(r) => {
          const pct = r.pct == null ? null : Math.round(r.pct * 100);
          const safeVal = r.safe == null ? r.wealth : r.safe;
          // The meter tops out at fully invested; anything past that is
          // borrowed, and says so as a multiple rather than overflowing.
          const barPct = Math.min(pct ?? 0, 100);
          const isLevered = manager && pct != null && pct > 100;
          return (
            <li className="flex items-center gap-3 py-2">
              {/* Name + status */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {r.isBot ? (
                  <Bot
                    className="shrink-0 text-ink-subtle"
                    role="img"
                    aria-hidden={false}
                    aria-label="Auto bot — plays a fixed strategy"
                  />
                ) : null}
                <span className="truncate text-sm text-ink">{r.name}</span>
                {!r.isBot && !r.submitted ? (
                  <span
                    className="shrink-0 rounded-full border border-ink bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink"
                    title={
                      manager
                        ? "No change this year — last year's portfolio carries forward"
                        : "No allocation submitted — defaults to all-safe"
                    }
                  >
                    {manager ? "holding" : "no bet"}
                  </span>
                ) : null}
              </div>

              {/* Risk meter — instant read of how aggressive each player is */}
              <div className="flex shrink-0 items-center gap-1">
                <div className="flex h-2.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-24">
                  <div className="bg-loss" style={{ width: `${barPct}%` }} />
                  <div className="bg-gain" style={{ width: `${100 - barPct}%` }} />
                </div>
                {isLevered ? (
                  <span className="rounded-full border border-ink bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold text-paper">
                    {((pct ?? 0) / 100).toFixed(1)}×
                  </span>
                ) : null}
              </div>

              {/* Numbers: % is the hero; exact dollars sit quietly beneath */}
              <div className="w-20 shrink-0 text-right sm:w-[88px]">
                <div className="font-mono text-sm font-bold text-ink">
                  {pct == null ? "—" : `${pct}%`}
                </div>
                <div className="font-mono text-[11px] leading-tight text-ink-subtle">
                  <span className="text-loss/90">{r.risky == null ? "—" : money(r.risky)}</span>
                  <span className="text-line-strong"> · </span>
                  {safeVal < 0 ? (
                    <span className="font-bold text-loss" title="borrowed">
                      {signedMoney(safeVal)}
                    </span>
                  ) : (
                    <span className="text-gain/90">{money(safeVal)}</span>
                  )}
                </div>
              </div>
            </li>
          );
        }}
      />
    </div>
  );
}
