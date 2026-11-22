"use client";

import { CountUp } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { Trophy } from "@/components/icons";
import { money } from "@/lib/game/format";

// Projector pieces shared by every game's present view (DESIGN.md §9).

export interface PodiumEntry {
  id: string;
  name: string;
  /** the final balance the block's figure rolls up to */
  value: number;
}

/**
 * Slow-turning rays behind a takeover — the game-show sunburst. Faint white on
 * the flood colour, so the verdict stays the only thing that shouts. Reduced
 * motion freezes it (globals.css).
 */
export function Sunburst() {
  return (
    <span
      aria-hidden="true"
      className="sunburst pointer-events-none absolute left-1/2 top-1/2 h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2"
    >
      <span
        className="block h-full w-full animate-spin-slow rounded-full"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgb(255 255 255 / 0.07) 0deg 9deg, transparent 9deg 18deg)",
        }}
      />
    </span>
  );
}

/**
 * The top three on blocks of 1st/2nd/3rd height, 2-1-3 order. The blocks rise
 * from the floor in reverse order — third, second, then the winner — each
 * balance rolling up from the starting wealth, and confetti for the winner.
 */
export function Podium({ entries, startingWealth }: { entries: PodiumEntry[]; startingWealth: number }) {
  // visual order: 2nd, 1st, 3rd
  const slots = [1, 0, 2].filter((i) => entries[i]);
  const height = ["h-[34vh]", "h-[24vh]", "h-[17vh]"];
  const fill = ["bg-brand", "bg-surface", "bg-paper-2"];
  const delay = [0.9, 0.45, 0];
  return (
    <div className="mx-auto flex w-full max-w-4xl items-end justify-center gap-4">
      <Confetti count={90} />
      {slots.map((i) => {
        const p = entries[i];
        return (
          <div
            key={p.id}
            className="flex w-1/3 max-w-[18rem] animate-rise-tall flex-col items-center"
            style={{ animationDelay: `${delay[i]}s` }}
          >
            <span className="mb-2 max-w-full truncate px-2 font-display text-[clamp(1.4rem,2.6vw,2.4rem)] font-black text-ink">
              {p.name}
            </span>
            <CountUp
              value={p.value}
              from={startingWealth}
              duration={1600}
              format={money}
              className="mb-3 font-mono text-[clamp(1.2rem,2.2vw,2rem)] font-bold text-ink"
            />
            <div
              className={`flex w-full flex-col items-center justify-start rounded-t-3xl border-[3px] border-b-0 border-ink pt-4 shadow-lift ${height[i]} ${fill[i]}`}
            >
              <span className="font-mono text-[clamp(3rem,7vw,6rem)] font-black leading-none text-ink">
                {i + 1}
              </span>
              {i === 0 ? <Trophy className="mt-2 text-[clamp(2rem,4vw,3.5rem)] text-ink" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
