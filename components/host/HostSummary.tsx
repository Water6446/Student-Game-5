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
  expectedGoodRate,
  goodCount,
  luckStats,
} from "@/lib/game/results";
import { edgeFraction, type StrategyKey } from "@/lib/game/counterfactual";
import { assetName, numAssets, type PortfolioStrategyKey } from "@/lib/game/portfolio";
import { isManager, isPortfolio } from "@/lib/game/types";
import { indexSeries } from "@/lib/game/manager";
import { money, sharpeText, signedPct } from "@/lib/game/format";
import { Button, Card } from "@/components/ui";
import { CondensedList } from "@/components/CondensedList";
import { ManagerReveal } from "@/components/host/ManagerReveal";
import { FeeCounter, sumFees } from "@/components/FeeCounter";
import { LuckChip } from "@/components/LuckChip";
import { useShowBots } from "@/components/use-show-bots";
import { BotToggle } from "@/components/host/BotToggle";
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
  // `results` keeps EVERYONE (the strategy benchmark cards read bot finals from
  // it); `visibleResults` is what the lists/chart show, honoring the bot toggle.
  const results = useMemo(
    () => buildPlayerResults(session, players, rounds, allocations),
    [session, players, rounds, allocations],
  );
  const [showBots, setShowBots] = useShowBots(session.id);
  const visibleResults = useMemo(() => {
    if (showBots) return results;
    // re-rank after filtering so hidden bots don't leave gaps (1,2,2,4…)
    let rank = 0;
    let prev = Number.POSITIVE_INFINITY;
    return results
      .filter((r) => !r.player.is_bot)
      .map((r, i) => {
        if (r.finalWealth < prev - 1e-9) {
          rank = i + 1;
          prev = r.finalWealth;
        }
        return { ...r, rank };
      });
  }, [results, showBots]);
  const visiblePlayers = useMemo(
    () => (showBots ? players : players.filter((p) => !p.is_bot)),
    [players, showBots],
  );
  const cf = useMemo(
    () =>
      portfolio
        ? classPortfolioCounterfactual(session, visibleResults)
        : classCounterfactual(session, visibleResults),
    [portfolio, session, visibleResults],
  );
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);
  const [openId, setOpenId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // per-player luck only varies when each player draws their own market
  const independent = session.config.market_scope === "independent";
  // benchmark GOOD rate per draw (portfolio: mean of per-asset odds)
  const expected = expectedGoodRate(session.config);

  // "Luck": who drew the most good markets, signed against the benchmark
  const luck = useMemo(
    () =>
      visibleResults
        .map((r) => ({
          id: r.player.id,
          name: r.player.display_name,
          stats: luckStats(goodCount(r.outcomes), r.outcomes.length, expected),
        }))
        .sort((a, b) => (b.stats?.delta ?? -Infinity) - (a.stats?.delta ?? -Infinity)),
    [visibleResults, expected],
  );

  // An expanded row must survive the list collapsing around it.
  const openIndices = useMemo(() => {
    const i = visibleResults.findIndex((r) => r.player.id === openId);
    return i >= 0 ? [i] : [];
  }, [visibleResults, openId]);

  // The index ghost line, sourced from rounds.market_return — the same number
  // the Index bot compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!isManager(session.config)) return null;
    const revealed = rounds
      .filter((r) => r.status === "revealed" && r.market_return != null)
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return null;
    return {
      label: "The Index (no fees)",
      series: indexSeries(
        session.config.starting_wealth,
        revealed.map((r) => Number(r.market_return)),
      ),
    };
  }, [session.config, rounds]);

  function downloadCsv() {
    // the CSV always exports EVERYONE, regardless of the bot toggle
    const csv = buildResultsCsv(
      results,
      rounds,
      portfolio,
      expected,
      isManager(session.config),
      benchmark?.series.at(-1),
    );
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

  // expected number of good draws (luck baseline): benchmark rate × draws made —
  // one per round (basic) or one per round × asset (portfolio)
  const numRevealed = rounds.filter((r) => r.status === "revealed").length;
  const totalDraws = numRevealed * (portfolio ? numAssets(session.config) : 1);
  const expectedGood = expected * totalDraws;
  // ±1σ binomial band on the observed rate — the "this spread is normal" line
  const sigma = totalDraws > 0 ? Math.sqrt((expected * (1 - expected)) / totalDraws) : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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
            {session.config.num_rounds} rounds · {visibleResults.length} players · started at{" "}
            {money(session.config.starting_wealth)}
            {portfolio && (session.config.correlation ?? 0) > 0
              ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManager(session.config) ? (
            <FeeCounter total={sumFees(allocations)} label="Class fees paid" />
          ) : null}
          {hasBots ? (
            <BotToggle
              showBots={showBots}
              onToggle={setShowBots}
              title="Toggle benchmark bots in the standings, luck and chart (CSV always includes them)"
            />
          ) : null}
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

      {/* Who was actually skilled — the payoff of the whole module. */}
      {isManager(session.config) ? (
        <div className="mb-6">
          <ManagerReveal supabase={supabase} session={session} rounds={rounds} />
        </div>
      ) : null}

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
          <p className="mb-3 text-xs text-ink-subtle">
            S = Sharpe (return per unit of risk). Click a player to see every market they faced.
          </p>
          <CondensedList
            items={visibleResults}
            keyOf={(r) => r.player.id}
            keepIndices={openIndices}
            className="space-y-1"
            gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            renderItem={(r) => {
              const open = openId === r.player.id;
              const good = goodCount(r.outcomes);
              const rowLuck = luckStats(good, r.outcomes.length, expected);
              return (
                <li className="overflow-hidden rounded-lg border border-line bg-paper-2">
                  {/* Below sm this wraps to two lines — rank + name + final
                      wealth, then the stats — instead of overflowing a 375px
                      viewport with six items on one row. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.player.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left transition hover:bg-line/40"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-ink">
                      <span className="w-7 shrink-0 text-center font-mono font-bold text-ink-subtle">
                        {r.rank}
                      </span>
                      <span className="truncate">{r.player.display_name}</span>
                      <ChevronDown
                        className={`shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </span>
                    <span className="order-2 font-mono text-xl font-black text-ink sm:order-3 sm:text-2xl">
                      {money(r.finalWealth)}
                    </span>
                    <span className="order-3 flex w-full items-center justify-end gap-3 sm:order-2 sm:w-auto">
                      {independent ? (
                        <LuckChip luck={rowLuck} expected={expected} withWord />
                      ) : null}
                      {/* Permanent column — matches FinalResults so the two host
                          panels read identically. The fuller sentence stays in
                          the expanded panel below. */}
                      <span
                        className="shrink-0 font-mono text-xs text-ink-muted"
                        title="Sharpe ratio — return per unit of risk taken (see MECHANICS.md)"
                      >
                        S {sharpeText(r.sharpe)}
                      </span>
                      {r.totalReturn != null ? (
                        <span
                          className={`font-mono text-xs font-bold ${
                            r.totalReturn > 0 ? "text-gain" : r.totalReturn < 0 ? "text-loss" : "text-ink-muted"
                          }`}
                          title="total return on starting wealth"
                        >
                          {signedPct(r.totalReturn * 100)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-line px-4 py-2">
                      <div className="mb-1 text-xs text-ink-subtle">
                        {good}/{r.outcomes.length} good {portfolio ? "draws" : "markets"} · avg bet{" "}
                        {money(r.avgBet)}
                        {r.totalReturn != null ? (
                          <>
                            {" "}
                            · total return {signedPct(r.totalReturn * 100)}
                            {r.perRoundReturn != null
                              ? ` (${signedPct(r.perRoundReturn * 100, 1)}/round)`
                              : ""}
                          </>
                        ) : null}{" "}
                        · Sharpe{" "}
                        <span title="return per unit of volatility (see MECHANICS.md)">
                          {sharpeText(r.sharpe)}
                        </span>{" "}
                        · full match{portfolio ? " (round by round, per asset)" : ""}:
                      </div>
                      <OutcomeChips outcomes={r.outcomes} empty="no rounds" />
                    </div>
                  ) : null}
                </li>
              );
            }}
          />
        </Card>

        {/* Round history — collapsed shows a bounded, scrollable window; "Show
            all" expands to full height. The bound is a plain max-h at every
            breakpoint, and print variants unbind it so every round makes it
            onto paper regardless of collapse state. */}
        <Card>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex w-full items-center justify-between text-left focus:outline-none"
          >
            <h2 className="text-xl font-bold text-ink">Round history</h2>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              {historyOpen ? "Collapse" : "Show all"}
              <ChevronDown
                className={`text-ink transition-transform ${historyOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          <div className="mt-3 border-t border-line-strong pt-3">
            <SessionHistoryTable
              rounds={rounds}
              allocations={allocations}
              scrollClassName={
                historyOpen ? "" : "max-h-96 print:max-h-none print:overflow-visible"
              }
            />
          </div>
        </Card>
      </div>

      {/* Luck — who drew the best markets (independent outcomes) */}
      <Card className="mt-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Clover className="text-gain" /> Luck
        </h2>
        <p className="mb-3 mt-1 text-sm text-ink-muted">
          ± = GOOD-draw rate vs the expected {Math.round(expected * 100)}%. Expected{" "}
          <span className="font-semibold text-gain">
            ~{expectedGood.toFixed(1)} of {totalDraws}
          </span>{" "}
          good
          {sigma > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-ink">±{Math.round(sigma * 100)}%</span> spread
              is normal chance
            </>
          ) : null}
          .{!independent ? " Everyone faced the same draws." : ""}
        </p>
        <CondensedList
          items={luck}
          keyOf={(l) => l.id}
          className="space-y-1"
          gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
          toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
          renderItem={(l, i) => (
            <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-paper-2 px-4 py-2">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-ink">
                <span className="flex w-7 shrink-0 justify-center">
                  {i === 0 ? (
                    <Clover className="text-gain" />
                  ) : (
                    <span className="font-mono text-ink-subtle">{i + 1}</span>
                  )}
                </span>
                <span className="truncate">{l.name}</span>
              </span>
              <span className="flex items-baseline gap-3 text-sm">
                <span className="text-ink-muted">
                  {l.stats ? `${l.stats.good}/${l.stats.total} good` : "no draws"}
                </span>
                <span
                  className={`w-14 text-right font-mono font-bold ${
                    !l.stats || l.stats.delta === 0
                      ? "text-ink-muted"
                      : l.stats.delta > 0
                        ? "text-gain"
                        : "text-loss"
                  }`}
                >
                  {l.stats ? signedPct(l.stats.delta * 100) : "—"}
                </span>
              </span>
            </li>
          )}
        />
      </Card>

      {/* Wealth chart */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-bold text-ink">Wealth over rounds</h2>
        <WealthChart
          players={visiblePlayers}
          rounds={rounds}
          allocations={allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
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
