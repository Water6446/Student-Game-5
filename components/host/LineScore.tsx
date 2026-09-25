"use client";

import type { CSSProperties } from "react";
import type { RoundRow, SessionRow } from "@/lib/game/db";
import { isManager, isPortfolio } from "@/lib/game/types";
import type { RoundPhase } from "@/components/use-round-phase";
import { clsx } from "@/components/clsx";
import { ArrowDown, ArrowUp, Lock } from "@/components/icons";

export type LineScoreKind = "basic" | "independent" | "portfolio" | "manager";

/** What a session's line score prints in each played column. */
export function lineScoreKind(config: SessionRow["config"]): LineScoreKind {
  if (isManager(config)) return "manager";
  if (isPortfolio(config)) return "portfolio";
  return config.market_scope === "independent" ? "independent" : "basic";
}

/** Past this many rounds a column is too narrow to print in; see below. */
const MAX_COLUMNS = 30;

/**
 * The game's progress as a baseball line score: one ruled column per round
 * (innings), its number over what the market did, and a total at the end.
 * Played rounds carry the result — green up / red down for a shared market,
 * the index's return for a manager year, "3/4" assets up for a portfolio —
 * the round in play is amber, rounds to come are blank. The current column's
 * number is printed in reverse, like the inning a scoreboard is on.
 *
 * Longer games fall back: slim segments to 40 rounds, one bar past that.
 */
export function LineScore({
  total,
  current,
  phase,
  rounds,
  kind,
  size = "md",
}: {
  total: number;
  /** the round in play; 0 before the game starts (nothing highlighted) */
  current: number;
  phase: RoundPhase;
  rounds: RoundRow[];
  kind: LineScoreKind;
  /** lg: the projector's, read from the back row */
  size?: "md" | "lg";
}) {
  const byNumber = new Map(rounds.map((r) => [r.round_number, r]));
  const done = (n: number) => {
    const r = byNumber.get(n);
    // the current round is "played" only once this screen shows its reveal
    return r?.status === "revealed" && !(n === current && phase !== "revealed") ? r : null;
  };
  const unit = kind === "manager" ? "Year" : "Round";
  const lg = size === "lg";
  const numRow = lg ? "h-7 text-sm" : "h-5 text-[10px]";
  const bodyRow = lg ? "h-11 text-base" : "h-8 text-[11px]";
  const labelCls = clsx(
    "flex items-center bg-paper-2 font-display font-extrabold uppercase tracking-[0.12em] text-ink-muted",
    lg ? "px-4 text-sm" : "px-2.5 text-[10px]",
  );

  if (total > MAX_COLUMNS) return <Segments total={total} current={current} done={done} kind={kind} />;

  // phones: past a dozen columns the numbers and figures drop, colour stays
  const dense = total > 12;
  const played = Array.from({ length: total }, (_, i) => done(i + 1)).filter(Boolean) as RoundRow[];

  return (
    <div className="flex overflow-hidden rounded-lg border-2 border-ink bg-ink">
      {/* Row labels, as on a scoreboard: what the two lines are. */}
      <div aria-hidden="true" className="hidden shrink-0 flex-col gap-[2px] pr-[2px] sm:flex">
        <span className={clsx(labelCls, lg ? "h-7" : "h-5")}>{unit}</span>
        <span className={clsx(labelCls, "flex-1", lg ? "h-11" : "h-8")}>
          {kind === "manager" ? "Index" : kind === "portfolio" ? "Assets" : "Market"}
        </span>
      </div>
      <ol
        aria-label={current > 0 ? `${unit} ${current} of ${total}` : `${total} ${unit.toLowerCase()}s`}
        className="grid min-w-0 flex-1 gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` } as CSSProperties}
      >
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const r = done(n);
          const now = n === current;
          const cell = r ? playedCell(r, kind) : null;
          return (
            <li
              key={n}
              title={`${unit} ${n}${cell ? ` · ${cell.words}` : now ? " · in play" : ""}`}
              className="flex min-w-0 flex-col gap-[2px]"
            >
              <span
                className={clsx(
                  "items-center justify-center font-mono font-bold",
                  numRow,
                  dense ? "hidden sm:flex" : "flex",
                  now ? "bg-ink text-paper-inverse" : "bg-surface text-ink-subtle",
                )}
              >
                {n}
              </span>
              <span
                className={clsx(
                  "flex items-center justify-center font-mono font-bold transition-colors duration-300",
                  lg ? bodyRow : dense ? "h-3 text-[11px] sm:h-8" : bodyRow,
                  cell ? cell.cls : now ? "bg-brand text-ink" : "bg-surface",
                )}
              >
                <span className={clsx("items-center gap-0.5", dense ? "hidden sm:inline-flex" : "inline-flex")}>
                  {cell ? (
                    cell.body
                  ) : now ? (
                    phase === "locked" ? (
                      <Lock />
                    ) : (
                      <span aria-hidden="true" className="h-2 w-2 animate-pulse-soft rounded-full bg-ink" />
                    )
                  ) : null}
                </span>
                <span className="sr-only">{cell ? cell.words : now ? "in play" : "to come"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {/* The total, as a line score ends with runs. */}
      <div className="hidden shrink-0 flex-col gap-[2px] pl-[2px] sm:flex">
        <span className={clsx(labelCls, "justify-center", lg ? "h-7" : "h-5")}>Total</span>
        <span
          className={clsx(
            "flex flex-1 items-center justify-center bg-paper-2 font-mono font-bold text-ink",
            lg ? "h-11 px-4 text-base" : "h-8 px-3 text-xs",
          )}
        >
          {totalOf(played, kind)}
        </span>
      </div>
    </div>
  );
}

function playedCell(r: RoundRow, kind: LineScoreKind): { cls: string; body: React.ReactNode; words: string } {
  if (kind === "manager" && r.market_return != null) {
    const pct = Number(r.market_return) * 100;
    const up = pct >= 0;
    return {
      cls: up ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss",
      body: `${up ? "+" : "−"}${Math.abs(Math.round(pct))}`,
      words: `index ${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`,
    };
  }
  if (kind === "portfolio" && r.market_outcomes?.length) {
    const up = r.market_outcomes.filter((o) => o === "good").length;
    const n = r.market_outcomes.length;
    return {
      cls: up * 2 > n ? "bg-gain-soft text-gain" : up * 2 < n ? "bg-loss-soft text-loss" : "bg-paper-2 text-ink",
      body: `${up}/${n}`,
      words: `${up} of ${n} assets up`,
    };
  }
  if (kind === "basic" && r.market_outcome) {
    const good = r.market_outcome === "good";
    return {
      cls: good ? "bg-gain text-white" : "bg-loss text-white",
      body: good ? <ArrowUp /> : <ArrowDown />,
      words: good ? "market up" : "market down",
    };
  }
  // independent draws: played, but there is no one market to print
  return { cls: "bg-paper-2 text-ink-muted", body: "·", words: "played" };
}

function totalOf(played: RoundRow[], kind: LineScoreKind): string {
  if (played.length === 0) return "—";
  if (kind === "manager") {
    const growth = played.reduce((g, r) => g * (1 + Number(r.market_return ?? 0)), 1);
    const pct = (growth - 1) * 100;
    return `${pct >= 0 ? "+" : "−"}${Math.abs(Math.round(pct))}%`;
  }
  if (kind === "portfolio") {
    const up = played.reduce((s, r) => s + (r.market_outcomes ?? []).filter((o) => o === "good").length, 0);
    const n = played.reduce((s, r) => s + (r.market_outcomes ?? []).length, 0);
    return n > 0 ? `${up}/${n} up` : `${played.length} played`;
  }
  if (kind === "basic") {
    const up = played.filter((r) => r.market_outcome === "good").length;
    return `${up}/${played.length} up`;
  }
  return `${played.length} played`;
}

/** 31–40 rounds: slim segments; past 40, one continuous bar. */
function Segments({
  total,
  current,
  done,
  kind,
}: {
  total: number;
  current: number;
  done: (n: number) => RoundRow | null;
  kind: LineScoreKind;
}) {
  if (total > 40) {
    const pct = Math.min(current / total, 1) * 100;
    return (
      <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`Round ${current} of ${total}`}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <ol className="flex h-2 gap-1" aria-label={`Round ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const r = done(n);
        const cls = r
          ? kind === "basic" && r.market_outcome
            ? r.market_outcome === "good"
              ? "bg-gain"
              : "bg-loss"
            : "bg-ink"
          : n === current
            ? "bg-brand-strong animate-pulse-soft"
            : "bg-ink/10";
        return <li key={n} title={String(n)} className={`min-w-0 flex-1 rounded-full transition-colors duration-300 ${cls}`} />;
      })}
    </ol>
  );
}
