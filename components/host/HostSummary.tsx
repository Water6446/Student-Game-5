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
  classPortfolioCounterfactual,
  goodCount,
} from "@/lib/game/results";
import { edgeFraction, type StrategyKey } from "@/lib/game/counterfactual";
import { assetName, numAssets, type PortfolioStrategyKey } from "@/lib/game/portfolio";
import { isPortfolio } from "@/lib/game/types";
import { money } from "@/lib/game/format";
import { Button, Card } from "@/components/ui";
import { ArrowLeft, Download, Trophy, Clover, ChevronDown, Monitor } from "@/components/icons";

export function HostSummary({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const players = usePlayers(supabase, session.id);
  const { rounds, allocations } = useSessionHistory(supabase, session.id);

  const portfolio = isPortfolio(session.config);
  const results = useMemo(
    () => buildPlayerResults(session, players, rounds, allocations),
    [session, players, rounds, allocations],
  );
  const cf = useMemo(
    () =>
      portfolio
        ? classPortfolioCounterfactual(session, results)
        : classCounterfactual(session, results),
    [portfolio, session, results],
  );
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // per-player luck only varies when each player draws their own market
  const independent = session.config.market_scope === "independent";

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
    const csv = buildResultsCsv(results, rounds, portfolio);
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
  const cardValue = (k: StrategyKey | PortfolioStrategyKey) =>
    botByStrategy.get(k) ?? (cf.strategy as Record<string, number>)[k];
  const avgLabel = cf.isAverage ? "class avg" : "everyone";

  // expected number of good draws (luck baseline): goodProb × draws made —
  // one per round (basic) or one per round × asset (portfolio)
  const goodProb = session.config.good_prob ?? 0.6;
  const numRevealed = rounds.filter((r) => r.status === "revealed").length;
  const totalDraws = numRevealed * (portfolio ? numAssets(session.config) : 1);
  const expectedGood = goodProb * totalDraws;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/host"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft /> Dashboard
          </Link>
          <h1 className="flex items-center gap-2 text-3xl font-black uppercase tracking-tight text-ink">
            <Trophy className="text-ink" /> Game finished
          </h1>
          <p className="font-editorial italic text-ink-muted">
            {session.config.num_rounds} rounds · {results.length} players · started at{" "}
            {money(session.config.starting_wealth)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/host/${session.id}/present`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-surface px-4 py-2.5 text-sm font-display font-extrabold text-ink shadow-card transition hover:bg-paper-2 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            title="Open the projector view in a new tab"
          >
            <Monitor /> Present
          </Link>
          <Button onClick={downloadCsv} variant="secondary" disabled={results.length === 0}>
            <Download /> Download CSV
          </Button>
        </div>
      </header>

      {/* Counterfactual */}
      <Card className="mb-6">
        <h2 className="mb-1 text-xl font-bold text-ink">If everyone had picked one strategy…</h2>
        <p className="mb-4 text-sm text-ink-muted">
          {hasBots
            ? "Your 4 benchmark students' actual final wealth."
            : `Final wealth under the actual market outcomes (${avgLabel}).`}{" "}
          Starting wealth was {money(cf.startWealth)}.
        </p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {portfolio ? (
            <>
              <StrategyCard
                label="All safe"
                desc="nothing invested, ever"
                value={cardValue("all_safe")}
                tone="slate"
              />
              <StrategyCard
                label="One basket"
                desc={`everything on ${assetName(session.config, 0)} every round`}
                value={cardValue("concentrated")}
                tone="loss"
              />
              <StrategyCard
                label="Half & half"
                desc="half safe, half split evenly"
                value={cardValue("half_diversified")}
                tone="play"
              />
              <StrategyCard
                label="Diversified"
                desc="everything invested, split evenly"
                value={cardValue("diversified")}
                tone="emerald"
              />
            </>
          ) : (
            <>
              <StrategyCard
                label="All safe"
                desc="0% at risk every round"
                value={cardValue("all_safe")}
                tone="slate"
              />
              <StrategyCard
                label={`${edgePct}% Edge`}
                desc="market edge percent every round"
                value={cardValue("edge")}
                tone="emerald"
              />
              <StrategyCard
                label="50 / 50"
                desc="half your wealth at risk every round"
                value={cardValue("fifty_fifty")}
                tone="play"
              />
              <StrategyCard
                label="All risky"
                desc="everything at risk every round"
                value={cardValue("all_risky")}
                tone="loss"
              />
            </>
          )}
        </div>
        <p className="mt-4 text-sm text-ink">
          <span className="font-bold text-gain">{cf.beatAllSafe}</span> of {cf.total}{" "}
          players beat the all-safe baseline of {money(cf.strategy.all_safe)}.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Final standings — click a player to see their whole-match outcomes */}
        <Card>
          <h2 className="mb-1 text-xl font-bold text-ink">Final standings</h2>
          <p className="mb-3 text-xs text-ink-subtle">Click a player to see every market they faced.</p>
          <ol className="space-y-1">
            {results.map((r) => {
              const open = openId === r.player.id;
              const good = goodCount(r.outcomes);
              const luckPct = r.outcomes.length
                ? Math.round((good / r.outcomes.length) * 100)
                : null;
              return (
                <li key={r.player.id} className="overflow-hidden rounded-lg border border-line bg-paper-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.player.id)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-line/40"
                  >
                    <span className="flex items-center gap-2 text-ink">
                      <span className="w-7 text-center font-mono font-bold text-ink-subtle">
                        {r.rank}
                      </span>
                      {r.player.display_name}
                      <ChevronDown
                        className={`text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </span>
                    <span className="flex items-center gap-3">
                      {independent && luckPct != null ? (
                        <span
                          className="flex items-center gap-1 text-xs text-ink-muted"
                          title="share of rounds this player drew a GOOD market"
                        >
                          <Clover className="text-gain" /> {luckPct}% lucky
                        </span>
                      ) : null}
                      <span className="font-mono text-2xl font-black text-ink">
                        {money(r.finalWealth)}
                      </span>
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-line px-4 py-2">
                      <div className="mb-1 text-xs text-ink-subtle">
                        {good}/{r.outcomes.length} good {portfolio ? "draws" : "markets"} · avg bet{" "}
                        {money(r.avgBet)} · full match{portfolio ? " (round by round, per asset)" : ""}:
                      </div>
                      <OutcomeChips outcomes={r.outcomes} empty="no rounds" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Round history — collapsed: the card is absolutely positioned inside
            its grid cell, so the Final standings card alone sets the row height
            and the table shows as many rounds as fit (scroll for the rest).
            Expanded: back in normal flow, every round visible. */}
        <div className="relative">
          <Card className={`flex flex-col ${historyOpen ? "" : "lg:absolute lg:inset-0"}`}>
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              className="flex w-full shrink-0 items-center justify-between text-left focus:outline-none"
            >
              <h2 className="text-xl font-bold text-ink">Round history</h2>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                {historyOpen ? "Collapse" : "Show all"}
                <ChevronDown
                  className={`text-ink transition-transform ${historyOpen ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            <div
              className={`mt-3 border-t border-line-strong pt-3 ${
                historyOpen ? "" : "min-h-0 max-h-96 flex-1 overflow-y-auto lg:max-h-none"
              }`}
            >
              <SessionHistoryTable rounds={rounds} allocations={allocations} />
            </div>
          </Card>
        </div>
      </div>

      {/* Luck — who drew the best markets (independent outcomes) */}
      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Clover className="text-gain" /> Luck
        </h2>
        <p className="mb-3 mt-1 text-sm text-ink-muted">
          {independent
            ? "Outcomes are independent per player, so some drew better markets than others."
            : "Everyone faced the same draws, so luck is identical across the class."}{" "}
          Most good {portfolio ? "draws" : "markets"} first. At {Math.round(goodProb * 100)}% odds,
          the expected count is{" "}
          <span className="font-semibold text-gain">
            ~{expectedGood.toFixed(1)} of {totalDraws}
          </span>{" "}
          good.
        </p>
        <ol className="space-y-1">
          {luck.map((l, i) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-line bg-paper-2 px-4 py-2"
            >
              <span className="flex items-center gap-2 text-ink">
                <span className="flex w-7 justify-center">
                  {i === 0 ? (
                    <Clover className="text-gain" />
                  ) : (
                    <span className="font-mono text-ink-subtle">{i + 1}</span>
                  )}
                </span>
                {l.name}
              </span>
              <span className="flex items-baseline gap-3 text-sm">
                <span className="text-ink-muted">
                  {l.good}/{l.total} good
                </span>
                <span className="w-12 text-right font-mono font-bold text-gain">
                  {Math.round(l.rate * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Wealth chart */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-bold text-ink">Wealth over rounds</h2>
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
  tone: "slate" | "emerald" | "play" | "loss";
}) {
  const tones = {
    slate: "bg-paper-2 text-ink",
    emerald: "bg-gain-soft text-gain",
    play: "bg-play-soft text-play",
    loss: "bg-loss-soft text-loss",
  };
  return (
    <div className={`flex flex-col rounded-xl border-2 border-ink p-4 text-center shadow-card ${tones[tone]}`}>
      <div className="font-display text-base font-extrabold">{label}</div>
      {desc ? <div className="font-editorial text-xs italic opacity-80">{desc}</div> : null}
      <div className="mt-auto pt-2 font-mono text-2xl font-black">{money(value)}</div>
    </div>
  );
}
