"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { usePlayers } from "@/components/use-players";
import { useSessionHistory } from "@/components/use-session-history";
import { WealthChart } from "@/components/host/WealthChart";
import { SessionHistoryTable } from "@/components/host/SessionHistoryTable";
import { OutcomeChips } from "@/components/OutcomeChips";
import {
  buildPlayerResults,
  buildResultsCsv,
  classCounterfactual,
  goodCount,
} from "@/lib/game/results";
import { edgeFraction, type StrategyKey } from "@/lib/game/counterfactual";
import { money } from "@/lib/game/format";
import { Button, Card } from "@/components/ui";

const MEDALS = ["🥇", "🥈", "🥉"];

export function HostSummary({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const players = usePlayers(supabase, session.id);
  const { rounds, allocations } = useSessionHistory(supabase, session.id);

  const results = useMemo(
    () => buildPlayerResults(session, players, rounds, allocations),
    [session, players, rounds, allocations],
  );
  const cf = useMemo(() => classCounterfactual(session, results), [session, results]);
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);
  const [openId, setOpenId] = useState<string | null>(null);

  // "Luck": who drew the most good markets (outcomes are independent per player)
  const luck = useMemo(
    () =>
      results
        .map((r) => {
          const good = goodCount(r.outcomes);
          const total = r.outcomes.length;
          return { id: r.player.id, name: r.player.display_name, good, total, rate: total ? good / total : 0 };
        })
        .sort((a, b) => b.rate - a.rate || b.total - a.total),
    [results],
  );

  function downloadCsv() {
    const csv = buildResultsCsv(session, results, rounds);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investment-game-${session.join_code}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // When benchmark bots are in the game, show the strategy cards as the bots'
  // ACTUAL final wealth (each bot is a live realization of that strategy) so the
  // numbers line up exactly with the standings. Otherwise show the computed
  // counterfactual (class average in independent mode).
  const botByStrategy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of results) {
      if (r.player.is_bot && r.player.strategy) m.set(r.player.strategy, r.finalWealth);
    }
    return m;
  }, [results]);
  const hasBots = botByStrategy.size > 0;
  // benchmark cards show the bot's real result when bots are present, else the
  // computed counterfactual
  const cardValue = (k: StrategyKey) => botByStrategy.get(k) ?? cf.strategy[k];
  const avgLabel = cf.isAverage ? "class avg" : "everyone";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/host" className="text-sm text-slate-500 hover:text-slate-300">
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">Game finished 🏁</h1>
          <p className="text-slate-400">
            {session.config.num_rounds} rounds · {results.length} players · started at{" "}
            {money(session.config.starting_wealth)}
          </p>
        </div>
        <Button onClick={downloadCsv} variant="secondary" disabled={results.length === 0}>
          ⬇ Download CSV
        </Button>
      </header>

      {/* Counterfactual */}
      <Card className="mb-6">
        <h2 className="mb-1 text-xl font-semibold">If everyone had picked one strategy…</h2>
        <p className="mb-4 text-sm text-slate-400">
          {hasBots
            ? "Your 4 benchmark students' actual final wealth."
            : `Final wealth under the actual market outcomes (${avgLabel}).`}{" "}
          Starting wealth was {money(cf.startWealth)}.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <StrategyCard
            label="All safe"
            desc="0% at risk every round"
            value={cardValue("all_safe")}
            tone="slate"
          />
          <StrategyCard label={`${edgePct}%`} value={cardValue("edge")} tone="emerald" />
          <StrategyCard
            label="50 / 50"
            desc="half your wealth at risk every round"
            value={cardValue("fifty_fifty")}
            tone="indigo"
          />
          <StrategyCard
            label="All risky"
            desc="everything at risk every round"
            value={cardValue("all_risky")}
            tone="rose"
          />
        </div>
        <p className="mt-4 text-sm text-slate-300">
          <span className="font-bold text-emerald-400">{cf.beatAllSafe}</span> of {cf.total}{" "}
          players beat the all-safe baseline of {money(cf.strategy.all_safe)}.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Final standings — click a player to see their whole-match outcomes */}
        <Card>
          <h2 className="mb-1 text-xl font-semibold">Final standings</h2>
          <p className="mb-3 text-xs text-slate-500">Click a player to see every market they faced.</p>
          <ol className="space-y-1">
            {results.map((r, i) => {
              const open = openId === r.player.id;
              const good = goodCount(r.outcomes);
              return (
                <li key={r.player.id} className="overflow-hidden rounded-lg bg-slate-800/40">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.player.id)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-800/80"
                  >
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="w-7 text-center font-mono text-slate-500">
                        {i < 3 ? MEDALS[i] : r.rank}
                      </span>
                      {r.player.display_name}
                      <span className="text-xs text-slate-600">{open ? "▲" : "▾"}</span>
                    </span>
                    <span className="font-mono text-lg font-semibold text-emerald-300">
                      {money(r.finalWealth)}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-slate-800 px-4 py-2">
                      <div className="mb-1 text-xs text-slate-500">
                        {good}/{r.outcomes.length} good markets · full match:
                      </div>
                      <OutcomeChips outcomes={r.outcomes} empty="no rounds" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Round history */}
        <Card>
          <h2 className="mb-3 text-xl font-semibold">Round history</h2>
          <SessionHistoryTable rounds={rounds} allocations={allocations} />
        </Card>
      </div>

      {/* Luck — who drew the best markets (independent outcomes) */}
      <Card className="mt-6">
        <h2 className="mb-1 text-xl font-semibold">Luck 🍀</h2>
        <p className="mb-3 text-sm text-slate-400">
          Outcomes are independent per player, so some drew better markets than others. Most good
          markets first.
        </p>
        <ol className="space-y-1">
          {luck.map((l, i) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg bg-slate-800/40 px-4 py-2"
            >
              <span className="flex items-center gap-2 text-slate-200">
                <span className="w-7 text-center">
                  {i === 0 ? "🍀" : <span className="font-mono text-slate-500">{i + 1}</span>}
                </span>
                {l.name}
              </span>
              <span className="flex items-baseline gap-3 text-sm">
                <span className="text-slate-400">
                  {l.good}/{l.total} good
                </span>
                <span className="w-12 text-right font-mono font-semibold text-emerald-300">
                  {Math.round(l.rate * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Wealth chart */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Wealth over rounds</h2>
        <WealthChart
          players={players}
          rounds={rounds}
          allocations={allocations}
          startingWealth={session.config.starting_wealth}
        />
      </Card>
    </main>
  );
}

function StrategyCard({
  label,
  desc,
  value,
  tone,
}: {
  label: string;
  desc?: string;
  value: number;
  tone: "slate" | "emerald" | "indigo" | "rose";
}) {
  const tones = {
    slate: "border-slate-700 bg-slate-800/40 text-slate-200",
    emerald: "border-emerald-800 bg-emerald-950/40 text-emerald-200",
    indigo: "border-indigo-800 bg-indigo-950/40 text-indigo-200",
    rose: "border-rose-900 bg-rose-950/40 text-rose-200",
  };
  return (
    <div className={`flex flex-col rounded-xl border p-4 text-center ${tones[tone]}`}>
      <div className="text-base font-semibold">{label}</div>
      {desc ? <div className="text-xs opacity-70">{desc}</div> : null}
      <div className="mt-auto pt-2 font-mono text-2xl font-black">{money(value)}</div>
    </div>
  );
}
