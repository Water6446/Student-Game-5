"use client";

import { goodCount, luckStats, type PlayerResult } from "@/lib/game/results";
import { money, sharpeText, signedPct } from "@/lib/game/format";
import { Bot } from "@/components/icons";
import { CondensedList } from "@/components/CondensedList";
import { LuckChip } from "@/components/LuckChip";

/**
 * What the Allocations panel becomes once the FINAL round is revealed: the last
 * round's amounts at risk are no longer interesting — what matters is each
 * player's final portfolio, total return, risk-adjusted result (Sharpe) and how
 * lucky their draws ran vs the expected odds. Pre-ranked by buildPlayerResults.
 * Mid-game reveals keep showing AllocationsBreakdown instead.
 */
export function FinalResults({
  results,
  expected,
  independent,
}: {
  results: PlayerResult[];
  /** benchmark GOOD rate per draw (expectedGoodRate) */
  expected: number;
  /** per-player luck only varies when each player draws their own market */
  independent: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">
          Final results
        </span>
        {independent ? (
          <span className="font-editorial text-xs italic text-ink-subtle">
            ± luck vs {Math.round(expected * 100)}% expected
          </span>
        ) : null}
      </div>

      <CondensedList
        items={results}
        keyOf={(r) => r.player.id}
        as="ul"
        className="divide-y divide-line"
        gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        renderItem={(r) => {
          const p = r.player;
          const luck = luckStats(goodCount(r.outcomes), r.outcomes.length, expected);
          return (
            <li className="flex items-center gap-3 py-2">
              {/* Name + bot marker */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {p.is_bot ? (
                  <Bot
                    className="shrink-0 text-ink-subtle"
                    role="img"
                    aria-hidden={false}
                    aria-label="Auto bot — plays a fixed strategy"
                  />
                ) : null}
                <span className="truncate text-sm text-ink">{p.display_name}</span>
              </div>

              {independent ? <LuckChip luck={luck} expected={expected} withWord /> : null}

              <span
                className="shrink-0 font-mono text-xs text-ink-muted"
                title="return per unit of volatility (— for all-safe)"
              >
                Sharpe {sharpeText(r.sharpe)}
              </span>

              {r.totalReturn != null ? (
                <span
                  className={`shrink-0 font-mono text-sm font-bold ${
                    r.totalReturn > 0 ? "text-gain" : r.totalReturn < 0 ? "text-loss" : "text-ink-muted"
                  }`}
                  title={
                    r.perRoundReturn != null
                      ? `total return (${signedPct(r.perRoundReturn * 100, 1)}/round geometric)`
                      : "total return"
                  }
                >
                  {signedPct(r.totalReturn * 100)}
                </span>
              ) : null}

              {/* Final portfolio — the hero number */}
              <span className="shrink-0 text-right font-mono text-xl font-black text-ink">
                {money(r.finalWealth)}
              </span>
            </li>
          );
        }}
      />
    </div>
  );
}
