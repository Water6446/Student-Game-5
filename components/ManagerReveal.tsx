"use client";

import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundRow, SessionRow } from "@/lib/game/db";
import { managerName, numManagers } from "@/lib/game/manager";
import { signedPct } from "@/lib/game/format";
import { Card } from "@/components/ui";
import { CondensedList } from "@/components/CondensedList";
import { useManagerTruth } from "@/components/use-manager-truth";

/**
 * Who was actually skilled — the payoff of the whole module, and the one screen
 * that may show alpha.
 *
 * The realised figure sits next to the true one on purpose: the gap between
 * "true alpha +2.0%" and "delivered −0.4% over 25 years" IS the statistical
 * lesson. A manager with real skill can finish behind one without it, and 25
 * observations cannot tell you which is which.
 */
export function ManagerReveal({
  supabase,
  session,
  rounds,
  className = "mt-6",
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  rounds: RoundRow[];
  /** the student end screen stacks its own cards, so the margin is caller-owned */
  className?: string;
}) {
  const { truth, loading } = useManagerTruth(supabase, session.id, true);
  const n = numManagers(session.config);

  // Years actually played, not config.num_rounds — a game finished early has
  // fewer observations, and every statistical claim below is per observation.
  const years = useMemo(
    () =>
      rounds.filter(
        (r) => r.status === "revealed" && r.market_return != null && r.manager_returns,
      ).length,
    [rounds],
  );

  // Realised alpha over the game: mean(r_i − beta_i·r_market) across revealed
  // years. Computed here rather than stored, from the rows everyone can see.
  const realised = useMemo(() => {
    if (!truth) return null;
    const revealed = rounds
      .filter((r) => r.status === "revealed" && r.market_return != null && r.manager_returns)
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return null;
    return Array.from({ length: n }, (_, i) => {
      const beta = truth.managers[i]?.beta ?? 1;
      let sum = 0;
      for (const r of revealed) {
        sum += Number(r.manager_returns?.[i] ?? 0) - beta * Number(r.market_return);
      }
      return sum / revealed.length;
    });
  }, [truth, rounds, n]);

  if (loading) {
    return (
      <Card className={className}>
        <p className="font-editorial italic text-ink-muted">Revealing the managers…</p>
      </Card>
    );
  }
  if (!truth) return null;

  const rows = Array.from({ length: n }, (_, i) => ({
    slot: i,
    name: truth.managers[i]?.name ?? managerName(session.config, i),
    beta: truth.managers[i]?.beta ?? 1,
    alpha: truth.managers[i]?.alpha ?? 0,
    te: truth.managers[i]?.tracking_error ?? 0,
    realised: realised?.[i] ?? null,
  })).sort((a, b) => b.alpha - a.alpha);

  // The closing statistical claim, read off the most-skilled manager actually in
  // play. Needs a positive alpha, a real tracking error and at least one year.
  const best = rows[0];
  const stat =
    best && best.alpha > 0 && best.te > 0 && years > 0
      ? {
          alpha: best.alpha,
          te: best.te,
          ir: best.alpha / best.te,
          se: best.te / Math.sqrt(years),
          sigma: (best.alpha / best.te) * Math.sqrt(years),
        }
      : null;

  return (
    <Card className={className}>
      <h2 className="text-xl font-bold text-ink">Who was actually skilled</h2>
      <p className="mb-3 mt-1 text-sm text-ink-muted">
        The true parameters, hidden until now. <span className="font-semibold">Delivered</span> is
        what each manager actually produced over these {years} year{years === 1 ? "" : "s"} — the
        gap between it and the true alpha is how little {years} observation
        {years === 1 ? "" : "s"} can tell you.
      </p>

      <div className="mb-2 hidden gap-3 px-3 text-xs font-bold uppercase tracking-wide text-ink-subtle sm:grid sm:grid-cols-[1fr_5rem_5rem_4rem_4rem]">
        <span>Manager</span>
        <span className="text-right">True alpha</span>
        <span className="text-right">Delivered</span>
        <span className="text-right">Track err</span>
        <span className="text-right">Beta</span>
      </div>

      <CondensedList
        items={rows}
        keyOf={(r) => String(r.slot)}
        moreNoun="managers"
        options={{ top: 5, bottom: 3, threshold: 8 }}
        className="space-y-1"
        gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
        renderItem={(r) => (
          <li className="grid grid-cols-2 items-baseline gap-x-3 gap-y-1 rounded-lg border border-line bg-paper-2 px-3 py-2 sm:grid-cols-[1fr_5rem_5rem_4rem_4rem]">
            <span className="col-span-2 min-w-0 sm:col-span-1">
              <span className="truncate font-semibold text-ink">{r.name}</span>
              <span className="ml-2 font-editorial text-xs italic text-ink-muted">
                {verdict(r.alpha)}
              </span>
            </span>
            <Cell value={r.alpha} bold />
            <Cell value={r.realised} />
            <span className="text-right font-mono text-xs text-ink-muted">
              {Math.round(r.te * 100)}%
            </span>
            <span className="text-right font-mono text-xs text-ink-muted">
              {r.beta.toFixed(1)}
            </span>
          </li>
        )}
      />

      {/* Derived from THIS line-up and THIS many years — the numbers were once
          hardcoded to the default preset and a 25-year game, and quietly lied
          whenever the host changed either. */}
      <p className="mt-3 font-editorial text-sm italic text-ink-muted">
        {stat ? (
          <>
            The best manager here ran {signedPct(stat.alpha * 100, 1)} of alpha against{" "}
            {Math.round(stat.te * 100)}% tracking error — an information ratio of{" "}
            {stat.ir.toFixed(2)}. Over {years} year{years === 1 ? "" : "s"} the standard error on
            that estimate is {(stat.se * 100).toFixed(1)}%, so even the truth is only{" "}
            {stat.sigma.toFixed(1)} sigma. Nobody in the room could have known.
          </>
        ) : (
          <>
            Skill this small cannot be separated from luck at this sample size. That is the
            lesson, not a flaw in the game.
          </>
        )}
      </p>
    </Card>
  );
}

function Cell({ value, bold }: { value: number | null; bold?: boolean }) {
  if (value == null) {
    return <span className="text-right font-mono text-sm text-ink-subtle">—</span>;
  }
  return (
    <span
      className={`text-right font-mono text-sm ${bold ? "font-black" : ""} ${
        value > 0.0005 ? "text-gain" : value < -0.0005 ? "text-loss" : "text-ink-muted"
      }`}
    >
      {signedPct(value * 100, 1)}
    </span>
  );
}

function verdict(alpha: number): string {
  if (alpha > 0.005) return "genuinely skilled";
  if (alpha < -0.005) return "negative skill";
  return "no edge";
}
