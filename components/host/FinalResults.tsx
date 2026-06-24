"use client";

import type { PlayerRow } from "@/lib/game/db";
import type { MarketOutcome } from "@/lib/game/types";
import { goodCount } from "@/lib/game/results";
import { money } from "@/lib/game/format";
import { Bot, Clover } from "@/components/icons";

/**
 * What the Allocations panel becomes once the FINAL round is revealed: the last
 * round's amounts at risk are no longer interesting — what matters is each
 * player's final portfolio (the hero number) and how lucky their market draws
 * were (% of rounds drawn GOOD). Sorted by final wealth, richest first.
 * Mid-game reveals keep showing AllocationsBreakdown instead.
 */
export function FinalResults({
  players,
  outcomesByPlayer,
  independent,
}: {
  players: PlayerRow[];
  outcomesByPlayer: Map<string, MarketOutcome[]>;
  /** per-player luck only varies when each player draws their own market */
  independent: boolean;
}) {
  const rows = [...players].sort((a, b) => b.current_wealth - a.current_wealth);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">
          Final results
        </span>
        {independent ? (
          <span className="font-editorial text-xs italic text-ink-subtle">
            % lucky = share of rounds drawn GOOD
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-line">
        {rows.map((p) => {
          const outs = outcomesByPlayer.get(p.id) ?? [];
          const luckPct = outs.length ? Math.round((goodCount(outs) / outs.length) * 100) : null;
          return (
            <li key={p.id} className="flex items-center gap-3 py-2">
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

              {independent && luckPct != null ? (
                <span
                  className="flex shrink-0 items-center gap-1 text-xs text-ink-muted"
                  title="share of rounds this player drew a GOOD market"
                >
                  <Clover className="text-gain" /> {luckPct}% lucky
                </span>
              ) : null}

              {/* Final portfolio — the hero number */}
              <span className="shrink-0 text-right font-mono text-xl font-black text-ink">
                {money(p.current_wealth)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
