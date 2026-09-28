"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { usePlayers } from "@/components/use-players";
import { useSessionHistory } from "@/components/use-session-history";
import { WealthChart, seriesColors } from "@/components/host/WealthChart";
import { SessionHistoryTable, historyInfo } from "@/components/host/SessionHistoryTable";
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
import { edgeFraction, strategyText, type StrategyKey } from "@/lib/game/counterfactual";
import { assetName, numAssets, portfolioStrategyText, type PortfolioStrategyKey } from "@/lib/game/portfolio";
import { isManager, isPortfolio } from "@/lib/game/types";
import { indexSeries } from "@/lib/game/manager";
import { money, sharpeText, signedPct } from "@/lib/game/format";
import { Button } from "@/components/ui";
import { Panel, PanelGrid, StatStrip, type Stat } from "@/components/terminal";
import { RankBadge } from "@/components/RankBadge";
import { LEDGER, LEDGER_ROW } from "@/components/ledger";
import { Masthead, TOOL } from "@/components/Masthead";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SessionCrumbs } from "@/components/host/SessionCrumbs";
import { LineScore, lineScoreKind } from "@/components/host/LineScore";
import { CondensedList } from "@/components/CondensedList";
import { ManagerReveal } from "@/components/ManagerReveal";
import { FeeCounter, sumFees } from "@/components/FeeCounter";
import { LuckChip } from "@/components/LuckChip";
import { useShowBots } from "@/components/use-show-bots";
import { BotToggle } from "@/components/host/BotToggle";
import { ArrowDown, ArrowUp, Download, Trophy, Clover, ChevronDown, Monitor } from "@/components/icons";

// The final standings' columns: rank, player, the stats, wealth — the same
// grid for the heads and every row, so the figures line up (DESIGN.md §8).
const FINAL_GRID = "sm:grid-cols-[1.75rem_minmax(0,1fr)_auto_8.5rem]";
// Rounds the collapsed history lists before "Show all".
const HISTORY_ROWS = 8;

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
  const basicText = strategyText(edgePct);
  const pfText = portfolioStrategyText(assetName(session.config, 0));
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

  // Shared markets: the draws everyone faced, from the player who saw the most
  // (a late joiner saw fewer).
  const classDraws = useMemo(() => {
    const full = [...visibleResults].sort((a, b) => b.outcomes.length - a.outcomes.length)[0];
    return full ? luckStats(goodCount(full.outcomes), full.outcomes.length, expected) : null;
  }, [visibleResults, expected]);

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
  const revealedCount = rounds.filter((r) => r.status === "revealed").length;
  // the wealth chart's colour per player, so the standings are its key
  const colors = useMemo(() => seriesColors(visiblePlayers, benchmark != null), [visiblePlayers, benchmark]);

  // ── manager game: the index comparison that replaces the counterfactual ──
  const managerGame = isManager(session.config);
  const indexFinal = benchmark?.series.at(-1);
  const classFees = useMemo(() => sumFees(allocations), [allocations]);
  // Humans only: The Index must not be counted among the players racing it.
  const humanResults = useMemo(
    () => results.filter((r) => !r.player.is_bot),
    [results],
  );
  const medianWealth = useMemo(() => {
    if (humanResults.length === 0) return session.config.starting_wealth;
    // results are already sorted by final wealth descending
    const mid = Math.floor(humanResults.length / 2);
    return humanResults.length % 2
      ? humanResults[mid].finalWealth
      : (humanResults[mid - 1].finalWealth + humanResults[mid].finalWealth) / 2;
  }, [humanResults, session.config.starting_wealth]);
  const beatIndex = useMemo(
    () =>
      indexFinal == null
        ? 0
        : humanResults.filter((r) => r.finalWealth > indexFinal + 1e-9).length,
    [humanResults, indexFinal],
  );

  function downloadCsv() {
    // the CSV always exports EVERYONE, regardless of the bot toggle
    const csv = buildResultsCsv(
      results,
      rounds,
      portfolio,
      expected,
      managerGame,
      indexFinal,
      managerGame ? (session.config.managers ?? []).map((m) => m.name) : undefined,
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
  // The strategy that finished highest gets the "came out on top" tag.
  const shownKeys: (StrategyKey | PortfolioStrategyKey)[] = portfolio
    ? ["all_safe", "concentrated", "half_diversified", "diversified"]
    : ["all_safe", "edge", "fifty_fifty", "all_risky"];
  const bestKey = shownKeys.reduce((a, k) => (cardValue(k) > cardValue(a) ? k : a), shownKeys[0]);

  // expected number of good draws (luck baseline): benchmark rate × draws made —
  // one per round (basic) or one per round × asset (portfolio)
  const numRevealed = rounds.filter((r) => r.status === "revealed").length;
  const totalDraws = numRevealed * (portfolio ? numAssets(session.config) : 1);
  const expectedGood = expected * totalDraws;
  // ±1σ binomial band on the observed rate — the "this spread is normal" line
  const sigma = totalDraws > 0 ? Math.sqrt((expected * (1 - expected)) / totalDraws) : 0;

  // The summary's market-data row: who won, how the class did, the lesson.
  const start = session.config.starting_wealth;
  const winner = humanResults[0] ?? null;
  const classAvg =
    humanResults.length > 0
      ? humanResults.reduce((sum, r) => sum + r.finalWealth, 0) / humanResults.length
      : start;
  const toneOf = (v: number) => (v > start + 0.005 ? "gain" : v < start - 0.005 ? "loss" : undefined);
  const summaryStats: Stat[] = [
    {
      label: "Winner",
      value: winner?.player.display_name ?? "—",
      sub: winner ? money(winner.finalWealth) : undefined,
    },
    {
      label: "Class average",
      value: money(classAvg),
      sub: start > 0 ? `${signedPct((classAvg / start - 1) * 100)} on ${money(start)}` : undefined,
      // balances stay ink; the change under them carries the colour
      subTone: toneOf(classAvg),
    },
    {
      label: "Class median",
      value: money(medianWealth),
      sub: start > 0 ? `${signedPct((medianWealth / start - 1) * 100)} on ${money(start)}` : undefined,
      subTone: toneOf(medianWealth),
    },
    managerGame
      ? {
          label: "Beat the index",
          value: `${beatIndex}/${humanResults.length}`,
          sub: indexFinal != null ? `index finished at ${money(indexFinal)}` : undefined,
        }
      : {
          label: "Beat all-safe",
          value: `${cf.beatAllSafe}/${cf.total}`,
          sub: `all-safe kept ${money(cf.strategy.all_safe)}`,
        },
    managerGame
      ? { label: "Fees paid", value: money(classFees), sub: "by the class, in total", tone: "loss" }
      : {
          label: "Wiped out",
          value: humanResults.filter((r) => r.finalWealth <= 0).length,
          sub: "finished at $0",
        },
  ];

  return (
    // One cream sheet, no cards: sections sit on the page (DESIGN.md §4).
    <main className="min-h-dvh bg-surface">
      <Masthead
        width="max-w-6xl"
        back={{ href: "/host", label: "Dashboard" }}
        title={
          <span className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 animate-stamp items-center justify-center rounded-xl border-2 border-ink bg-brand text-2xl shadow-card sm:h-12 sm:w-12">
              <Trophy />
            </span>
            Game over
          </span>
        }
        crumbs={<SessionCrumbs session={session} stage="Results" />}
        shortTitle="Game over"
        tools={
          <>
            {hasBots ? (
              <BotToggle
                showBots={showBots}
                onToggle={setShowBots}
                title="Toggle benchmark bots in the standings, luck and chart (CSV always includes them)"
                className={TOOL}
              />
            ) : null}
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              className={TOOL}
              title="Open the projector view in a new tab"
            >
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <SettingsMenu className={TOOL} />
          </>
        }
        action={
          <Button
            onClick={downloadCsv}
            variant="secondary"
            disabled={results.length === 0}
            className="w-full"
          >
            <Download /> Download CSV
          </Button>
        }
      >
        {/* The whole game's scoreboard: every round, and the total. */}
        <LineScore
          total={session.config.num_rounds}
          current={0}
          phase="revealed"
          rounds={rounds}
          kind={lineScoreKind(session.config)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-editorial text-lg italic text-ink-muted">
            {session.config.num_rounds} {managerGame ? "years" : "rounds"} ·{" "}
            {visibleResults.length} players · started at{" "}
            {money(session.config.starting_wealth)}
            {portfolio && (session.config.correlation ?? 0) > 0
              ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
              : ""}
          </p>
          {managerGame ? <FeeCounter total={classFees} label="Class fees paid" /> : null}
        </div>
      </Masthead>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <StatStrip items={summaryStats} />
      <PanelGrid className="mt-6 lg:grid-cols-2">

      {/* Who was actually skilled — the payoff of the whole module. */}
      {managerGame ? (
        <ManagerReveal supabase={supabase} session={session} rounds={rounds} className="lg:col-span-2" />
      ) : null}

      {/* The class against the index. The strategy counterfactual cannot run
          here — it replays good/bad draws, and a manager game has none, so every
          card came out at the starting wealth. This is what replaces it. */}
      {managerGame ? (
        <Panel className="lg:col-span-2"
            infoLabel="About the index comparison"
            info={
              <>
                The index charges no fees and nobody could buy it. Starting wealth was{" "}
                {money(session.config.starting_wealth)}.
              </>
            }
          title="How the class did against the index"
        >
          <div className="grid grid-cols-2 border-y-[1.5px] border-ink/15 sm:grid-cols-4 [&>*]:border-ink/15 [&>*:nth-child(even)]:border-l-[1.5px] sm:[&>*:not(:first-child)]:border-l-[1.5px] [&>*:nth-child(n+3)]:border-t-[1.5px] sm:[&>*:nth-child(n+3)]:border-t-0">
            <StrategyCard
              label="The Index"
              desc="passive, no fees"
              value={indexFinal ?? session.config.starting_wealth}
              start={session.config.starting_wealth}
            />
            <StrategyCard
              label="Best student"
              desc="highest final wealth"
              value={humanResults[0]?.finalWealth ?? session.config.starting_wealth}
              start={session.config.starting_wealth}
            />
            <StrategyCard
              label="Class median"
              desc="the middle student"
              value={medianWealth}
              start={session.config.starting_wealth}
            />
            <StrategyCard
              label="Fees paid"
              desc="to the managers, in total"
              value={classFees}
              start={session.config.starting_wealth}
              cost
            />
          </div>
          <p className="mt-4 text-sm text-ink">
            <span className="font-bold text-gain">{beatIndex}</span> of {humanResults.length}{" "}
            {humanResults.length === 1 ? "player" : "players"} beat the index
            {indexFinal != null ? ` of ${money(indexFinal)}` : ""}.
          </p>
        </Panel>
      ) : null}

      {/* Counterfactual */}
      {managerGame ? null : (
      <Panel className="lg:col-span-2"
          infoLabel="About the strategy comparison"
          info={
            <>
              {hasBots
                ? "Your 4 benchmark students' actual final wealth."
                : `Final wealth under the actual market outcomes (${avgLabel}).`}{" "}
              Starting wealth was {money(cf.startWealth)}. Green finished above it, red below.
            </>
          }
          title="If everyone had picked one strategy"
        >
        <div className="grid grid-cols-2 border-y-[1.5px] border-ink/15 sm:grid-cols-4 [&>*]:border-ink/15 [&>*:nth-child(even)]:border-l-[1.5px] sm:[&>*:not(:first-child)]:border-l-[1.5px] [&>*:nth-child(n+3)]:border-t-[1.5px] sm:[&>*:nth-child(n+3)]:border-t-0">
          {portfolio ? (
            <>
              <StrategyCard
                label={pfText.all_safe.label}
                desc={pfText.all_safe.desc}
                value={cardValue("all_safe")}
                start={cf.startWealth}
                best={bestKey === "all_safe"}
              />
              <StrategyCard
                label={pfText.concentrated.label}
                desc={pfText.concentrated.desc}
                value={cardValue("concentrated")}
                start={cf.startWealth}
                best={bestKey === "concentrated"}
              />
              <StrategyCard
                label={pfText.half_diversified.label}
                desc={pfText.half_diversified.desc}
                value={cardValue("half_diversified")}
                start={cf.startWealth}
                best={bestKey === "half_diversified"}
              />
              <StrategyCard
                label={pfText.diversified.label}
                desc={pfText.diversified.desc}
                value={cardValue("diversified")}
                start={cf.startWealth}
                best={bestKey === "diversified"}
              />
            </>
          ) : (
            <>
              <StrategyCard
                label={basicText.all_safe.label}
                desc={basicText.all_safe.desc}
                value={cardValue("all_safe")}
                start={cf.startWealth}
                best={bestKey === "all_safe"}
              />
              <StrategyCard
                label={basicText.edge.label}
                desc={basicText.edge.desc}
                value={cardValue("edge")}
                start={cf.startWealth}
                best={bestKey === "edge"}
              />
              <StrategyCard
                label={basicText.fifty_fifty.label}
                desc={basicText.fifty_fifty.desc}
                value={cardValue("fifty_fifty")}
                start={cf.startWealth}
                best={bestKey === "fifty_fifty"}
              />
              <StrategyCard
                label={basicText.all_risky.label}
                desc={basicText.all_risky.desc}
                value={cardValue("all_risky")}
                start={cf.startWealth}
                best={bestKey === "all_risky"}
              />
            </>
          )}
        </div>
        <p className="mt-4 text-sm text-ink">
          <span className="font-bold text-gain">{cf.beatAllSafe}</span> of {cf.total}{" "}
          players beat the all-safe baseline of {money(cf.strategy.all_safe)}.
        </p>
      </Panel>
      )}

        {/* Final standings — click a player to see their whole-match outcomes */}
        <Panel
            infoLabel="About the final standings"
            info={
              <>
                S = Sharpe Ratio (return per unit of risk).
                {independent ? " The clover is each player's luck vs the expected odds." : ""}
              </>
            }
          title="Final standings"
        >
          {/* Kept on screen: it is how the rows work, not background. A manager
              game has no market outcomes to list, so it names what opens. */}
          <p className="mb-3 font-editorial text-sm italic text-ink-muted">
            Click a player to see{" "}
            {managerGame ? "their full record" : "every market outcome they faced"}.
          </p>
          {/* Column heads over the same grid as the rows: the control
              screen's timing tower, at the finish. */}
          <div
            aria-hidden="true"
            // sticks under the masthead's condensed bar in a long class
            className={`sticky top-[58px] z-10 hidden gap-x-3 border-b-[1.5px] border-ink/15 bg-surface px-2 pb-1.5 pt-1 font-display text-[10px] font-extrabold uppercase tracking-label text-ink-muted sm:grid ${FINAL_GRID}`}
          >
            <span className="text-center">#</span>
            <span>Player</span>
            <span className="flex justify-end gap-3">
              {independent ? <span className="w-[4.5rem] text-right">Luck</span> : null}
              <span className="w-12 text-right">Sharpe</span>
              <span className="w-16 text-right">Return</span>
            </span>
            <span className="text-right">Wealth</span>
          </div>
          <CondensedList
            items={visibleResults}
            keyOf={(r) => r.player.id}
            keepIndices={openIndices}
            // the sticky heads above carry the top rule
            className={`${LEDGER} border-t-0`}
            gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            renderItem={(r, i) => {
              const open = openId === r.player.id;
              const good = goodCount(r.outcomes);
              const rowLuck = luckStats(good, r.outcomes.length, expected);
              return (
                <li
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                  className={`stagger animate-rise transition-colors ${open ? "bg-brand-soft/50" : ""}`}
                >
                  {/* Below sm this wraps to two lines — rank + name + final
                      wealth, then the stats — instead of overflowing a 375px
                      viewport with six items on one row. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.player.id)}
                    aria-expanded={open}
                    className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-left ${FINAL_GRID} ${LEDGER_ROW}`}
                  >
                    <span className="col-start-1 row-start-1">
                      <RankBadge rank={r.rank} />
                    </span>
                    <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 text-ink">
                      {/* the player's line on the wealth chart below */}
                      {colors?.get(r.player.id) ? (
                        <span
                          aria-hidden="true"
                          className="h-5 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: colors.get(r.player.id) }}
                        />
                      ) : null}
                      <span className="truncate font-semibold">{r.player.display_name}</span>
                      <ChevronDown
                        className={`shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </span>
                    {/* Permanent columns — the same figures FinalResults shows,
                        so the two host panels read identically. The fuller
                        sentence stays in the expanded panel below. Below sm
                        they drop to a second line under the name. */}
                    <span className="col-span-3 row-start-2 flex items-center justify-end gap-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                      {independent ? (
                        <span className="flex w-[4.5rem] justify-end">
                          <LuckChip luck={rowLuck} expected={expected} withWord />
                        </span>
                      ) : null}
                      <span
                        className="w-12 shrink-0 text-right font-mono text-xs text-ink-muted"
                        title="Sharpe ratio — return per unit of risk taken (see MECHANICS.md)"
                      >
                        <span className="sm:hidden">S </span>
                        {sharpeText(r.sharpe)}
                      </span>
                      <span
                        className={`w-16 shrink-0 text-right font-mono text-xs font-bold ${
                          r.totalReturn == null
                            ? "text-ink-subtle"
                            : r.totalReturn > 0
                              ? "text-gain"
                              : r.totalReturn < 0
                                ? "text-loss"
                                : "text-ink-muted"
                        }`}
                        title="total return on starting wealth"
                      >
                        {r.totalReturn != null ? signedPct(r.totalReturn * 100) : "—"}
                      </span>
                    </span>
                    <span className="col-start-3 row-start-1 text-right font-mono text-xl font-black text-ink sm:col-start-4 sm:text-2xl">
                      {money(r.finalWealth)}
                    </span>
                  </button>
                  {open ? (
                    <div className="animate-rise px-3 pb-3 pt-1">
                      <div className="mb-1 text-xs text-ink-subtle">
                        {/* A manager game has no good/bad draws, so this read
                            "0/0 good markets" under a chip row saying "no
                            rounds". Fees are the number that belongs here. */}
                        {managerGame ? (
                          <>
                            fees paid{" "}
                            <span className="font-mono font-semibold text-loss">
                              {money(r.feesPaid)}
                            </span>{" "}
                            ·{" "}
                          </>
                        ) : (
                          <>
                            {good}/{r.outcomes.length} good {portfolio ? "draws" : "markets"} ·{" "}
                          </>
                        )}
                        avg {managerGame ? "invested" : "bet"} {money(r.avgBet)}
                        {r.totalReturn != null ? (
                          <>
                            {" "}
                            · total return {signedPct(r.totalReturn * 100)}
                            {r.perRoundReturn != null
                              ? ` (${signedPct(r.perRoundReturn * 100, 1)}/${
                                  managerGame ? "yr" : "round"
                                })`
                              : ""}
                          </>
                        ) : null}{" "}
                        · Sharpe{" "}
                        <span title="return per unit of volatility (see MECHANICS.md)">
                          {sharpeText(r.sharpe)}
                        </span>
                        {managerGame ? null : (
                          <>
                            {" "}
                            · full match{portfolio ? " (round by round, per asset)" : ""}:
                          </>
                        )}
                      </div>
                      {managerGame ? null : (
                        <OutcomeChips outcomes={r.outcomes} empty="no rounds" />
                      )}
                    </div>
                  ) : null}
                </li>
              );
            }}
          />
        </Panel>

        {/* Round history — collapsed shows the latest rounds as whole rows
            (a clipped scroll box cut the last one in half); "Show all" lists
            every round. The toggle only appears when there is more to show. */}
        <Panel
            info={historyInfo(managerGame)}
            infoLabel="About the history table"
            action={
              revealedCount > HISTORY_ROWS ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
              >
                {historyOpen ? "Collapse" : "Show all"}
                <ChevronDown
                  className={`transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`}
                />
              </Button>
              ) : null
            }
          title={<>{managerGame ? "Year" : "Round"} history</>}
        >
          <div className="mt-3">
            <SessionHistoryTable
              rounds={rounds}
              allocations={allocations}
              manager={managerGame}
              limit={historyOpen ? undefined : HISTORY_ROWS}
            />
          </div>
        </Panel>

      {/* Luck — who drew the best markets (independent outcomes), or one line
          when the whole class shared a market. Suppressed for manager games:
          there are no good/bad draws to be lucky in, so every row would read
          "no draws". */}
      {managerGame ? null : (
      <Panel className="lg:col-span-2"
          icon={<Clover />}
          infoLabel="About luck"
          info={
            <>
            ± = GOOD-draw rate vs the expected {Math.round(expected * 100)}%. Expected{" "}
            <span>
              ~{expectedGood.toFixed(1)} of {totalDraws}
            </span>{" "}
            good
            {sigma > 0 ? (
              <>
                {" "}
                · <span>±{Math.round(sigma * 100)}%</span> spread is
                normal chance
              </>
            ) : null}
            .{!independent ? " Everyone faced the same draws." : ""}
            </>
          }
          title="Luck"
        >
        {independent ? (
          // Two newspaper columns on a wide screen: a ranked list this narrow
          // would otherwise leave half the panel blank.
          <CondensedList
            items={luck}
            keyOf={(l) => l.id}
            className="border-t-[1.5px] border-ink/15 lg:columns-2 lg:gap-x-10 lg:border-t-0"
            gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            renderItem={(l, i) => (
              <li
                style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                className={`stagger flex animate-rise break-inside-avoid flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-[1.5px] border-ink/15 ${LEDGER_ROW}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 text-ink">
                  <span className="flex w-7 shrink-0 justify-center">
                    {i === 0 ? (
                      <Clover className="text-lg text-gain" aria-label="Luckiest" />
                    ) : (
                      <span className="font-mono text-sm font-bold text-ink-subtle">{i + 1}</span>
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
        ) : classDraws ? (
          // One market for the class: every row would read the same, so the
          // panel says it once.
          <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-y-[1.5px] border-ink/15 px-2 py-3">
            <span className="font-editorial italic text-ink-muted">
              One market for the whole class, so everyone faced the same draws.
            </span>
            <span className="font-mono text-sm text-ink-muted">
              {classDraws.good}/{classDraws.total} good ·{" "}
              <span
                className={`font-bold ${
                  classDraws.delta > 0 ? "text-gain" : classDraws.delta < 0 ? "text-loss" : "text-ink"
                }`}
              >
                {signedPct(classDraws.delta * 100)}
              </span>{" "}
              vs {Math.round(expected * 100)}% odds
            </span>
          </p>
        ) : null}
      </Panel>
      )}

      {/* Wealth chart */}
      <Panel className="lg:col-span-2"
          title={<>Wealth over {managerGame ? "years" : "rounds"}</>}
        >
        <WealthChart
          players={visiblePlayers}
          rounds={rounds}
          allocations={allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
          unitLabel={managerGame ? "Year" : "Round"}
        />
      </Panel>
      </PanelGrid>
      </div>
    </main>
  );
}

/**
 * One "what if everyone had done X" result. Coloured by what it did to the
 * starting wealth — green above, red below — never by which strategy it is:
 * colour here is a verdict (DESIGN.md §1.3), and the arrow says it too.
 */
function StrategyCard({
  label,
  desc,
  value,
  start,
  best,
  cost,
}: {
  label: string;
  desc?: string;
  value: number;
  /** starting wealth — the line between a gain and a loss */
  start: number;
  /** the top result among the cards on show */
  best?: boolean;
  /** money paid out (fees), not a balance: always the loss tone, no arrow */
  cost?: boolean;
}) {
  const up = !cost && value > start + 0.005;
  const down = cost || value < start - 0.005;
  const fg = up ? "text-gain" : down ? "text-loss" : "text-ink";
  // A column in a ruled strip, not a tinted card: the value's colour and arrow
  // carry the verdict, and only the winner gets a band.
  return (
    <div className={`flex flex-col px-4 py-4 text-center ${best ? "bg-brand-soft" : ""}`}>
      {best ? (
        <span className="mx-auto mb-1 font-display text-[10px] font-extrabold uppercase tracking-label text-ink">
          Came out on top
        </span>
      ) : null}
      <div className="font-display text-base font-extrabold text-ink">{label}</div>
      {desc ? <div className="font-editorial text-xs italic text-ink-muted">{desc}</div> : null}
      <div className={`mt-auto flex items-center justify-center gap-1 pt-2 font-mono text-2xl font-black ${fg}`}>
        {up ? <ArrowUp className="text-lg" /> : down && !cost ? <ArrowDown className="text-lg" /> : null}
        {money(value)}
      </div>
    </div>
  );
}
