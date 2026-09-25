"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import type { MarketOutcome } from "@/lib/game/types";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useRoundPhase, type RoundPhase } from "@/components/use-round-phase";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useSessionHistory } from "@/components/use-session-history";
import { MarketOddsControl } from "@/components/host/MarketOddsControl";
import { AllocationsBreakdown } from "@/components/host/AllocationsBreakdown";
import { WealthChart, seriesColors } from "@/components/host/WealthChart";
import { roundFeed, tickerItems } from "@/components/host/round-feed";
import { Panel, PanelGrid, StatStrip, Ticker, type Stat } from "@/components/terminal";
import { SessionHistoryTable, historyInfo } from "@/components/host/SessionHistoryTable";
import { OutcomeChips } from "@/components/OutcomeChips";
import {
  buildPlayerResults,
  bustRoundByPlayer,
  classLuckSoFar,
  compareStandings,
  expectedGoodRate,
  goodCount,
  goodCountMatrix,
  luckStats,
  marketSummary,
  playerDeltaChipsMap,
  playerOutcomesMap,
  portfolioOutcomeMatrix,
  rankMovement,
  returnSummaryByPlayer,
  submittedHumanCount,
  type LuckStats,
} from "@/lib/game/results";
import { CondensedList } from "@/components/CondensedList";
import { LuckChip } from "@/components/LuckChip";
import { assetName, numAssets } from "@/lib/game/portfolio";
import { indexSeries } from "@/lib/game/manager";
import { feesByPlayer, sumFees } from "@/components/FeeCounter";
import { isManager, isPortfolio } from "@/lib/game/types";
import { ManagerYearResult } from "@/components/ManagerYearResult";
import { cost, money, sharpeText, signedPct } from "@/lib/game/format";
import { Banner, Button, CountUp } from "@/components/ui";
import { useHotkeys } from "@/components/use-hotkeys";
import { useConfirm } from "@/components/ConfirmDialog";
import { useShowBots } from "@/components/use-show-bots";
import { BotToggle } from "@/components/host/BotToggle";
import { FinalResults } from "@/components/host/FinalResults";
import { ManagePlayerButton } from "@/components/host/ManagePlayer";
import { RankBadge } from "@/components/RankBadge";
import { Masthead, TOOL, TOOL_DANGER } from "@/components/Masthead";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SessionCrumbs } from "@/components/host/SessionCrumbs";
import { LineScore, lineScoreKind } from "@/components/host/LineScore";
import { LEDGER, LEDGER_ROW } from "@/components/ledger";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  CircleDashed,
  Flag,
  Lock,
  Monitor,
  Shuffle,
  Sliders,
  Trash,
  Trophy,
} from "@/components/icons";

// Standings columns from sm up: rank, name, stats, wealth. Shared by the
// column heads and every row so they line up.
const STANDINGS_GRID = "sm:grid-cols-[1.75rem_2rem_minmax(0,1fr)_auto_5.5rem_7rem]";
// The manager game drops the Gap column: its wealth cell already carries this
// year's and the annualized return, and Sharpe + fees need the room.
const MANAGER_STANDINGS_GRID = "sm:grid-cols-[1.75rem_2rem_minmax(0,1fr)_auto_7.5rem]";

// The submitted checklist exists to spot who HASN'T submitted, so pending
// players sort first and the collapse keeps them in the visible top slice.
const CHECKLIST_CONDENSE = { top: 5, bottom: 3 };

export function HostRoundControl({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const players = usePlayers(supabase, session.id);
  const loadedRound = useRound(supabase, session.id, session.current_round);
  // What to DISPLAY: gates a stale round row after "Next round" and swallows the
  // transient "locked" state of the one-click auto flow. See use-round-phase.ts.
  const { phase, round, settling } = useRoundPhase(loadedRound, session.current_round, {
    // Auto mode: one click fires lock_round then resolve_round, so the locked
    // panel is a transient nobody asked to see.
    holdLocked: session.config.market_mode === "auto",
  });
  const { allocations: allocs, loading: allocsLoading } = useRoundAllocations(
    supabase,
    round?.id ?? null,
  );
  const history = useSessionHistory(supabase, session.id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<MarketOutcome | null>(null);
  // manual portfolio rounds: one pick per asset
  const [picks, setPicks] = useState<(MarketOutcome | null)[]>([]);
  // Benchmark bots can be hidden mid-game so the class sees only real students
  // in the standings, chart and allocations. Persisted + synced to the present tab.
  const [showBots, setShowBots] = useShowBots(session.id);

  async function deleteSession() {
    const ok = await confirm({
      title: `Delete session ${session.join_code}?`,
      body: "This permanently removes every player, round and allocation in it. It cannot be undone.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("delete_session", { p_session_id: session.id });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    router.push("/host");
  }

  const isManual = session.config.market_mode === "manual";
  const isLastRound = session.current_round >= session.config.num_rounds;
  const portfolioGame = isPortfolio(session.config);
  // The manager game has no good/bad draws, so there is nothing to be lucky in
  // and no odds to tune. Those surfaces are suppressed, not deleted.
  const managerGame = isManager(session.config);
  const nAssets = numAssets(session.config);
  const submittedIds = useMemo(() => new Set(allocs.map((a) => a.player_id)), [allocs]);
  // bots auto-play and never "submit", so they're excluded from BOTH sides of the
  // submission counter — see submittedHumanCount.
  const humanPlayers = useMemo(() => players.filter((p) => !p.is_bot), [players]);
  const submitted = useMemo(() => submittedHumanCount(players, allocs), [players, allocs]);
  const checklist = useMemo(
    () => [
      ...humanPlayers.filter((p) => !submittedIds.has(p.id)),
      ...humanPlayers.filter((p) => submittedIds.has(p.id)),
    ],
    [humanPlayers, submittedIds],
  );
  const hasBots = useMemo(() => players.some((p) => p.is_bot), [players]);
  // What the standings / chart / allocations show, honoring the show-bots toggle.
  const visiblePlayers = useMemo(
    () => (showBots ? players : players.filter((p) => !p.is_bot)),
    [players, showBots],
  );
  // $0-tied players order by when they busted (first to bust sits last)
  const bust = useMemo(
    () => bustRoundByPlayer(history.rounds, history.allocations),
    [history.rounds, history.allocations],
  );
  const standings = useMemo(
    () => [...visiblePlayers].sort((a, b) => compareStandings(a, b, bust)),
    [visiblePlayers, bust],
  );
  // each player's market sequence, computed once (cheap to read per row)
  const outcomesByPlayer = useMemo(
    () => playerOutcomesMap(session, players, history.rounds, history.allocations),
    [session, players, history.rounds, history.allocations],
  );

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message);
  }

  const lock = () =>
    run(() => supabase.rpc("lock_round", { p_session_id: session.id, p_round_number: session.current_round }));
  const reveal = () =>
    run(() =>
      supabase.rpc("resolve_round", {
        p_session_id: session.id,
        p_round_number: session.current_round,
        p_market_override: isManual && !portfolioGame ? pick : null,
        p_market_overrides:
          isManual && portfolioGame
            ? Array.from({ length: nAssets }, (_, i) => picks[i] ?? null)
            : null,
      }),
    );
  // auto mode: one click locks the round and rolls the market
  const lockAndReveal = () =>
    run(async () => {
      const locked = await supabase.rpc("lock_round", {
        p_session_id: session.id,
        p_round_number: session.current_round,
      });
      if (locked.error) return locked;
      return supabase.rpc("resolve_round", {
        p_session_id: session.id,
        p_round_number: session.current_round,
        p_market_override: null,
        p_market_overrides: null,
      });
    });
  const next = () =>
    run(async () => {
      const res = await supabase.rpc("next_round", { p_session_id: session.id });
      setPick(null);
      setPicks([]);
      return res;
    });
  const finish = () => run(() => supabase.rpc("finish_session", { p_session_id: session.id }));

  // Ending the game before the last round is rare and irreversible, so it hides
  // behind a quiet header button + an explicit confirm.
  async function finishEarly() {
    const ok = await confirm({
      title: "Finish the game early?",
      body: (
        <>
          <p>
            You&apos;re at {managerGame ? "year" : "round"} {session.current_round} of{" "}
            {session.config.num_rounds}. The game ends immediately: no more rounds, students see
            their final results, and you get the summary screen.
          </p>
          <p>This cannot be undone.</p>
        </>
      ),
      confirmLabel: "Finish game",
      tone: "danger",
    });
    if (!ok) return;
    void finish();
  }

  // Post-final-round state: the game is effectively over, the host just hasn't
  // clicked "Finish game" yet — show final results, not last-round minutiae.
  const gameOver = isLastRound && phase === "revealed";
  const independent = session.config.market_scope === "independent";
  const picksComplete = Array.from({ length: nAssets }, (_, i) => picks[i]).every(
    (p) => p === "good" || p === "bad",
  );

  /** Manual portfolio: resolve the next unset asset, so "g g b g" walks the list.
   *  Once every asset is set, another press corrects the last one. */
  function pickAsset(outcome: MarketOutcome) {
    setPicks((prev) => {
      const next = Array.from({ length: nAssets }, (_, j) => prev[j] ?? null);
      const i = next.findIndex((p) => p == null);
      next[i === -1 ? nAssets - 1 : i] = outcome;
      return next;
    });
  }

  const setMarket = portfolioGame ? pickAsset : setPick;

  // The pinned primary button and its keyboard shortcut read the SAME choice, so
  // the two can never disagree about what "the main action" currently is.
  // Colour follows DESIGN.md §7: the "lock in / reveal / finish" beats are the
  // gold headline CTA; moving on to the next round is navigation, so blue.
  // Finishing after the last round is the natural end, not a destructive act.
  const primaryAction: { label: string; run: () => void; disabled: boolean;
    variant: "gold" | "primary"; icon?: React.ReactNode } | null =
    phase === "loading"
      ? null
      : phase === "open"
        ? isManual
          ? { label: "Lock allocations", run: lock, disabled: busy, variant: "gold", icon: <Lock /> }
          // `settling` = the row is already locked while we still show the open
          // panel, so the action must not fire a second time.
          : {
              label: "Lock & reveal",
              run: lockAndReveal,
              disabled: busy || settling,
              variant: "gold",
              icon: <Lock />,
            }
        : phase === "locked"
          ? {
              label: "Reveal results",
              run: reveal,
              disabled: busy || (isManual && (portfolioGame ? !picksComplete : !pick)),
              variant: "gold",
            }
          : isLastRound
            ? { label: "Finish game", run: finish, disabled: busy, variant: "gold", icon: <Trophy /> }
            : {
                label: `Next ${managerGame ? "year" : "round"}`,
                run: next,
                disabled: busy,
                variant: "primary",
                icon: <ArrowRight />,
              };

  const primaryReady = primaryAction != null && !primaryAction.disabled;
  const canSetMarket = isManual && phase === "locked";

  // Register a key ONLY while its action is live: a registered key calls
  // preventDefault, and Space has to keep scrolling the page otherwise.
  // Finish early and Delete stay mouse-only — both are irreversible.
  useHotkeys({
    ...(primaryReady
      ? { space: () => primaryAction!.run(), enter: () => primaryAction!.run() }
      : {}),
    ...(canSetMarket
      ? { g: () => setMarket("good"), b: () => setMarket("bad") }
      : {}),
  });

  // Standings chips: basic shows each player's own market draws; portfolio has
  // no single outcome per round, so chips read gained/lost that round instead.
  // The manager game has no per-round market outcome either, so it reuses the
  // portfolio game's gained/lost chips unchanged.
  const deltaChipsByPlayer = useMemo(
    () =>
      portfolioGame || managerGame
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : null,
    [portfolioGame, managerGame, history.rounds, history.allocations],
  );

  // Luck is only per-player when each player draws their own markets.
  const showLuck = independent && !managerGame;

  // benchmark GOOD rate per draw (portfolio: mean of per-asset odds)
  const expected = expectedGoodRate(session.config);

  // Live signed luck per player (only meaningful when draws are independent):
  // observed GOOD rate minus the benchmark, updated as rounds reveal.
  const luckByPlayer = useMemo(() => {
    const m = new Map<string, LuckStats | null>();
    if (!independent || managerGame) return m;
    for (const p of players) {
      if (portfolioGame) {
        const { good, total } = goodCountMatrix(
          portfolioOutcomeMatrix(session, history.rounds, history.allocations, p.id),
        );
        m.set(p.id, luckStats(good, total, expected));
      } else {
        const outs = outcomesByPlayer.get(p.id) ?? [];
        m.set(p.id, luckStats(goodCount(outs), outs.length, expected));
      }
    }
    return m;
  }, [independent, managerGame, players, portfolioGame, session, history.rounds, history.allocations, outcomesByPlayer, expected]);

  // Shared scope: everyone faces the same draws — one class-level luck line.
  const classLuck = useMemo(
    () => (independent || managerGame ? null : classLuckSoFar(session.config, history.rounds)),
    [independent, managerGame, session.config, history.rounds],
  );

  // The index ghost line, sourced from rounds.market_return — the same number
  // the Index bot compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!managerGame) return null;
    const revealed = history.rounds
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
  }, [managerGame, history.rounds, session.config.starting_wealth]);

  // Fees are a loss, and the class total should climb in front of the room.
  const classFees = useMemo(
    () => (managerGame ? sumFees(history.allocations) : 0),
    [managerGame, history.allocations],
  );
  const feesFor = useMemo(
    () => (managerGame ? feesByPlayer(history.allocations) : null),
    [managerGame, history.allocations],
  );

  // Every player in the same units as the market line above them, so the class
  // can read "you did +13.9% this year, the index did +16.3%" straight off the
  // standings instead of comparing a percentage against a dollar balance.
  const returnsFor = useMemo(
    () =>
      managerGame
        ? returnSummaryByPlayer(
            session.config.starting_wealth,
            players,
            history.rounds,
            history.allocations,
          )
        : null,
    [managerGame, session.config.starting_wealth, players, history.rounds, history.allocations],
  );

  // The manager game's class line is the market itself: this year's index
  // return and the annualized rate so far.
  const marketLine = useMemo(() => {
    if (!managerGame) return null;
    return marketSummary(
      history.rounds
        .filter((r) => r.status === "revealed" && r.market_return != null)
        .sort((a, b) => a.round_number - b.round_number)
        .map((r) => Number(r.market_return)),
    );
  }, [managerGame, history.rounds]);

  // Sharpe per player WHILE the game runs — the same series and formula as the
  // end screen, so the live figure and the final one are the same number.
  const sharpeFor = useMemo(
    () =>
      managerGame
        ? new Map(
            buildPlayerResults(session, players, history.rounds, history.allocations).map(
              (r) => [r.player.id, r.sharpe],
            ),
          )
        : null,
    [managerGame, session, players, history.rounds, history.allocations],
  );

  // Full per-player stats for the end-of-game panel (returns, Sharpe, luck),
  // with $0 ties re-ordered by bust round.
  const finalResults = useMemo(
    () =>
      gameOver
        ? buildPlayerResults(session, visiblePlayers, history.rounds, history.allocations).sort(
            (a, b) =>
              compareStandings(
                { id: a.player.id, current_wealth: a.finalWealth },
                { id: b.player.id, current_wealth: b.finalWealth },
                bust,
              ),
          )
        : [],
    [gameOver, session, visiblePlayers, history.rounds, history.allocations, bust],
  );

  // ── The trading-floor layer: tape, key figures, timing-tower columns ──
  const feed = useMemo(
    () => roundFeed(session, players, history.rounds, history.allocations),
    [session, players, history.rounds, history.allocations],
  );
  const ticker = useMemo(() => tickerItems(session, feed), [session, feed]);
  // ▲/▼ over the last resolved round, among the players on show
  const movement = useMemo(
    () => rankMovement(visiblePlayers, history.rounds, history.allocations, bust),
    [visiblePlayers, history.rounds, history.allocations, bust],
  );
  const colors = useMemo(() => seriesColors(visiblePlayers, benchmark != null), [visiblePlayers, benchmark]);
  const leaderWealth = Number(standings[0]?.current_wealth ?? 0);
  const standingsGrid = managerGame ? MANAGER_STANDINGS_GRID : STANDINGS_GRID;
  const unit = managerGame ? "year" : "round";
  const humanIds = useMemo(() => new Set(humanPlayers.map((p) => p.id)), [humanPlayers]);
  const atRiskNow = allocs.reduce(
    (s, a) => (humanIds.has(a.player_id) ? s + Number(a.risky_amount) : s),
    0,
  );
  const start = session.config.starting_wealth;
  const botCount = players.length - humanPlayers.length;
  const stats: Stat[] = [
    {
      label: "Players",
      value: humanPlayers.length,
      sub: botCount > 0 ? `+ ${botCount} benchmark bot${botCount === 1 ? "" : "s"}` : "in the room",
    },
    {
      // a balance, so the figure stays ink; the change under it carries colour
      label: "Class average",
      value: money(feed.avgWealth),
      sub: start > 0 ? `${signedPct((feed.avgWealth / start - 1) * 100)} since the start` : undefined,
      subTone: feed.avgWealth > start + 0.005 ? "gain" : feed.avgWealth < start - 0.005 ? "loss" : undefined,
      spark: feed.avgSeries,
      sparkLabel: `Class average by ${unit}`,
    },
    {
      label: "Leader",
      value: feed.leader?.display_name ?? "—",
      sub: feed.leader ? money(feed.leader.current_wealth) : undefined,
    },
    {
      label: `At risk this ${unit}`,
      value: allocsLoading ? "—" : money(atRiskNow),
      sub: `${submitted.submitted}/${submitted.total} submitted`,
    },
    managerGame
      ? {
          label: "The index",
          value: marketLine ? `${signedPct(marketLine.annualized * 100, 1)}/yr` : "—",
          sub: marketLine ? `${signedPct(marketLine.latest * 100, 1)} last year` : "no years yet",
          tone: marketLine ? (marketLine.annualized >= 0 ? "gain" : "loss") : undefined,
        }
      : classLuck
        ? {
            label: "Markets up",
            value: `${classLuck.good}/${classLuck.total}`,
            sub: `${signedPct(classLuck.delta * 100)} vs ${Math.round(classLuck.expected * 100)}% odds`,
          }
        : {
            label: `${managerGame ? "Years" : "Rounds"} left`,
            value: Math.max(session.config.num_rounds - session.current_round, 0),
            sub: `of ${session.config.num_rounds}`,
          },
    ...(managerGame
      ? [{ label: "Class fees", value: cost(classFees), sub: "paid to managers so far", tone: "loss" as const }]
      : []),
  ];

  return (
    // A paper masthead (title, status, progress, the one action) over a cream
    // sheet of open sections — no cards (DESIGN.md §4, §8).
    <main className="min-h-dvh bg-surface">
      <Masthead
        width="max-w-6xl"
        back={{ href: "/host", label: "Dashboard" }}
        title={
          <>
            {managerGame ? "Year" : "Round"} {session.current_round}
            <span className="text-ink-subtle">/{session.config.num_rounds}</span>
          </>
        }
        status={<StatusBadge phase={phase} />}
        crumbs={<SessionCrumbs session={session} stage="Live" />}
        tools={
          <>
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              aria-label="Present — open the projector view in a new tab"
              className={TOOL}
              title="Open the projector view in a new tab"
            >
              {/* Below sm the labels drop and the icons carry the meaning — the
                  toolbar has to fit a 375px viewport on one line. */}
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <SettingsMenu className={TOOL} />
            <button
              type="button"
              onClick={finishEarly}
              disabled={busy}
              aria-label="Finish early — end the game now and jump to the final summary"
              title="End the game now and jump to the final summary"
              className={TOOL}
            >
              <Flag /> <span className="hidden sm:inline">Finish early</span>
            </button>
            <button
              type="button"
              onClick={deleteSession}
              disabled={busy}
              aria-label="Delete this session"
              title="Delete this session"
              className={TOOL_DANGER}
            >
              <Trash /> <span className="hidden sm:inline">Delete</span>
            </button>
          </>
        }
        action={
          // Primary action — pinned to the masthead's top right so it stays in
          // the same place across open → reveal → next: in auto mode the host
          // clicks "Lock & reveal" then "Next round" without moving the cursor.
          // While the next round loads it keeps its place, disabled — showing
          // the previous round's body there is the bug use-round-phase fixes.
          primaryAction ? (
            <Button
              onClick={primaryAction.run}
              disabled={primaryAction.disabled}
              variant={primaryAction.variant}
              className="w-full text-lg shadow-pop"
            >
              {primaryAction.label}
              {primaryAction.icon}
            </Button>
          ) : (
            <Button disabled variant="secondary" className="w-full text-lg">
              Loading {managerGame ? "year" : "round"} {session.current_round}…
            </Button>
          )
        }
      >
        <LineScore
          total={session.config.num_rounds}
          current={session.current_round}
          phase={phase}
          rounds={history.rounds}
          kind={lineScoreKind(session.config)}
        />
      </Masthead>
      {/* The tape: what the last round did, running under the masthead. */}
      <Ticker items={ticker} className="border-b-2 border-ink" />

      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <StatStrip items={stats} />
      {/* The board: this round and the chart stacked on the left, the
          standings tower down the right, history across the foot. */}
      <PanelGrid className="mt-6 lg:grid-cols-[5fr_7fr] lg:grid-rows-[auto_1fr]">
        {/* This round: who is in, what they bet, what happened */}
        <Panel
          className="lg:col-start-1 lg:row-start-1"
          bodyClassName="space-y-5"
          title={
            phase === "open"
              ? "Submissions"
              : phase === "locked"
                ? "Locked — review, then reveal"
                : phase === "revealed"
                  ? gameOver
                    ? "Final results"
                    : `${managerGame ? "Year" : "Round"} ${session.current_round} result`
                  : "Loading"
          }
        >
          {error ? <Banner kind="error">{error}</Banner> : null}

          {/* Supporting context for each phase, below the pinned action. */}
          {phase === "open" && (
            <>
              <div>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-mono text-6xl font-black leading-none text-ink">
                    {/* "—" while the fetch is in flight: an unknown numerator is
                        honest, a stale one is a lie. */}
                    {allocsLoading ? "—" : <CountUp value={submitted.submitted} duration={400} />}
                    <span className="text-ink-subtle">/{submitted.total}</span>
                  </div>
                  <div className="pb-1 text-right font-display text-xs font-extrabold uppercase tracking-[0.1em] text-ink-muted">
                    {submitted.total > 0 && submitted.submitted === submitted.total && !allocsLoading
                      ? "Everyone's in"
                      : "Submitted"}
                  </div>
                </div>
                <SubmitMeter
                  submitted={allocsLoading ? 0 : submitted.submitted}
                  total={submitted.total}
                />
              </div>
              <CondensedList
                items={checklist}
                keyOf={(p) => p.id}
                as="ul"
                options={CHECKLIST_CONDENSE}
                // A sign-in sheet: ruled cells that fill green as each student
                // locks in — still waiting first, so the gaps are easy to call out.
                className="grid grid-cols-2 border-l-[1.5px] border-t-[1.5px] border-ink/15 text-sm sm:grid-cols-3 lg:grid-cols-2"
                gapItemClassName="border-b-[1.5px] border-r-[1.5px] border-ink/15"
                gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
                toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
                renderItem={(p) => (
                  <li
                    className={`flex min-w-0 items-center gap-2 border-b-[1.5px] border-r-[1.5px] border-ink/15 px-2.5 py-2 transition-colors duration-300 ${
                      submittedIds.has(p.id) ? "bg-gain-soft font-semibold text-ink" : "text-ink-muted"
                    }`}
                  >
                    {submittedIds.has(p.id) ? (
                      <Check className="shrink-0 animate-count-pop text-gain" />
                    ) : (
                      <CircleDashed className="shrink-0 text-ink-subtle" />
                    )}
                    <span className="truncate">{p.display_name}</span>
                    <span className="sr-only">{submittedIds.has(p.id) ? " — locked in" : " — waiting"}</span>
                  </li>
                )}
              />
              {/* Rarely used, so it sits last. */}
              {!isManual && !managerGame ? (
                <OddsDisclosure supabase={supabase} session={session} />
              ) : null}
            </>
          )}

          {phase === "locked" && (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-4 py-1.5 font-display text-lg font-black uppercase tracking-tight text-ink shadow-card">
                  <Lock /> Bets locked
                </span>
                <p className="font-editorial text-sm italic text-ink-muted">
                  Review the allocations, then reveal.
                </p>
              </div>
              {isManual ? (
                portfolioGame ? (
                  <div className="space-y-2">
                    <p className="text-center font-editorial text-sm italic text-ink-muted">
                      Resolve each asset&apos;s market:
                    </p>
                    <ul className="space-y-1.5">
                      {Array.from({ length: nAssets }, (_, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-sm font-bold text-ink">
                            {assetName(session.config, i)}
                          </span>
                          <AssetPickButton
                            label="Up"
                            good
                            active={picks[i] === "good"}
                            onClick={() =>
                              setPicks((prev) => {
                                const next = Array.from({ length: nAssets }, (_, j) => prev[j] ?? null);
                                next[i] = "good";
                                return next;
                              })
                            }
                          />
                          <AssetPickButton
                            label="Down"
                            active={picks[i] === "bad"}
                            onClick={() =>
                              setPicks((prev) => {
                                const next = Array.from({ length: nAssets }, (_, j) => prev[j] ?? null);
                                next[i] = "bad";
                                return next;
                              })
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-center font-editorial text-sm italic text-ink-muted">
                      Resolve the round:
                    </p>
                    <div className="flex gap-3">
                      <OutcomeButton label="Market up" active={pick === "good"} onClick={() => setPick("good")} good />
                      <OutcomeButton label="Market down" active={pick === "bad"} onClick={() => setPick("bad")} />
                    </div>
                  </div>
                )
              ) : (
                <p className="text-center font-editorial text-sm italic text-ink-muted">
                  Auto market — the server will roll the outcome{portfolioGame ? "s" : ""}.
                </p>
              )}
              <AllocationsBreakdown
                players={visiblePlayers}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
                portfolio={portfolioGame}
                manager={managerGame}
              />
              {!isManual && !managerGame ? (
                <OddsDisclosure supabase={supabase} session={session} />
              ) : null}
            </>
          )}

          {phase === "revealed" && (
            <>
              {managerGame && round ? (
                <ManagerYearResult
                  config={session.config}
                  round={round}
                  allocation={null}
                  startWealth={0}
                />
              ) : portfolioGame && round?.market_outcomes ? (
                <div>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {round.market_outcomes.map((o, i) => (
                      <li
                        key={i}
                        style={{ "--i": i } as React.CSSProperties}
                        className={`stagger flex animate-pop-in items-center justify-between rounded-lg border-2 border-ink px-2.5 py-1.5 text-sm font-bold ${
                          o === "good" ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"
                        }`}
                      >
                        <span className="truncate text-ink">{assetName(session.config, i)}</span>
                        <span className="flex items-center gap-0.5">
                          {o === "good" ? <ArrowUp /> : <ArrowDown />}
                          {o === "good" ? "UP" : "DOWN"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : session.config.market_scope === "independent" ? (
                <div className="-mx-4 -mt-4 flex animate-pop-in items-center gap-2 border-b-[1.5px] border-ink/15 bg-paper-2/50 px-4 py-3 font-editorial text-base italic text-ink-muted sm:-mx-5 sm:-mt-5 sm:px-5">
                  <Shuffle className="shrink-0 not-italic text-ink" />
                  Independent market — each player drew their own outcome
                  {portfolioGame ? "s" : ""}.
                </div>
              ) : (
                // The verdict runs the panel's full width, flush under its title
                // strip — a band, not a box inside the panel.
                <div
                  className={`-mx-4 -mt-4 flex items-center justify-center overflow-hidden border-b-2 border-ink bg-dots-light px-4 py-5 text-center font-display text-3xl font-black uppercase tracking-tight text-white sm:-mx-5 sm:-mt-5 ${
                    round?.market_outcome === "good" ? "bg-gain" : "bg-loss"
                  }`}
                >
                  <span key={round?.id} className="inline-flex animate-stamp items-center gap-2">
                    Market {round?.market_outcome === "good" ? "up" : "down"}
                    {round?.market_outcome === "good" ? <ArrowUp /> : <ArrowDown />}
                  </span>
                </div>
              )}
              {/* what everyone bet this round (still visible after the roll) —
                  except after the FINAL round, where the last round's bets are
                  no longer interesting: show final portfolios + luck instead */}
              {gameOver ? (
                <FinalResults results={finalResults} expected={expected} independent={independent} />
              ) : (
                <AllocationsBreakdown
                  players={visiblePlayers}
                  allocations={allocs}
                  goodProb={session.config.good_prob ?? 0.6}
                  portfolio={portfolioGame}
                  manager={managerGame}
                />
              )}
            </>
          )}
        </Panel>

        {/* Live standings — a timing tower: position, movement, gap to the lead */}
        <Panel
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          bodyClassName="px-2 pb-2 pt-3 sm:px-3"
          infoLabel="About the standings"
            info={
              <>
                {managerGame
                  ? "Arrows show each player's last 5 years (up = gained, down = lost)"
                  : portfolioGame
                    ? "Arrows show each player's last 5 rounds (up = gained, down = lost)"
                    : "Arrows show each player's last 5 markets"}
                {independent ? ". Luck is their share of good draws vs the expected odds" : ""}
                {sharpeFor ? ". Sharpe = return per unit of risk" : ""}
                {feesFor ? ". Fees are what each player has paid managers so far" : ""}. ± is
                the places gained or lost last {managerGame ? "year" : "round"}; Gap is the
                distance to the leader. The colour bar matches each player&apos;s line on the chart.
              </>
            }
            action={hasBots ? <BotToggle showBots={showBots} onToggle={setShowBots} /> : null}
            title={gameOver ? "Final standings" : "Standings"}
          >
          {/* Column heads, so every row's figures line up under a name. */}
          <div
            aria-hidden="true"
            className={`hidden gap-x-3 px-2 pb-1.5 font-display text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted sm:grid ${standingsGrid}`}
          >
            <span className="text-center">#</span>
            <span className="text-center">±</span>
            <span>Player</span>
            <span className="flex justify-end gap-3">
              {showLuck ? <span className="w-14 text-right">Luck</span> : null}
              {sharpeFor ? <span className="w-12 text-right">Sharpe</span> : null}
              {feesFor ? <span className="w-14 text-right">Fees</span> : null}
              <span className="w-[5.75rem] text-right">Last 5</span>
            </span>
            {managerGame ? null : <span className="text-right">Gap</span>}
            <span className="text-right">Wealth</span>
          </div>
          <CondensedList
            items={standings}
            keyOf={(p) => p.id}
            className={LEDGER}
            gapClassName="py-1 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
            renderItem={(p, index) => {
              const last5 = (
                (portfolioGame || managerGame
                  ? deltaChipsByPlayer?.get(p.id)
                  : outcomesByPlayer.get(p.id)) ?? []
              ).slice(-5);
              const rowLuck = luckByPlayer.get(p.id) ?? null;
              const ret = returnsFor?.get(p.id) ?? null;
              return (
                // A grid row whose columns line up with the heads above: rank,
                // name, the stats, wealth. Below sm the stats drop to a second
                // line under the name instead of overflowing a 375px viewport.
                <li
                  style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
                  className={`stagger grid animate-rise grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 ${standingsGrid} ${LEDGER_ROW}`}
                >
                  <span className="col-start-1 row-start-1">
                    <RankBadge rank={index + 1} />
                  </span>
                  <span className="hidden justify-center sm:col-start-2 sm:row-start-1 sm:flex">
                    <Movement d={movement.get(p.id)} />
                  </span>
                  <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 text-ink sm:col-start-3">
                    {/* the player's colour on the chart below: the table is its key */}
                    {colors?.get(p.id) ? (
                      <span
                        aria-hidden="true"
                        className="h-5 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: colors.get(p.id) }}
                      />
                    ) : null}
                    <span className="min-w-0 truncate font-semibold">{p.display_name}</span>
                    {/* on a phone only a real move earns space beside the name */}
                    {movement.get(p.id) ? (
                      <span className="sm:hidden">
                        <Movement d={movement.get(p.id)} />
                      </span>
                    ) : null}
                    <ManagePlayerButton supabase={supabase} session={session} player={p} />
                  </span>
                  <span className="col-span-3 row-start-2 flex items-center justify-end gap-3 sm:col-span-1 sm:col-start-4 sm:row-start-1">
                    {showLuck ? (
                      <span className="flex w-14 justify-end">
                        <LuckChip luck={rowLuck} expected={expected} />
                      </span>
                    ) : null}
                    {sharpeFor ? (
                      <span
                        className="w-12 shrink-0 text-right font-mono text-xs text-ink-muted"
                        title="Sharpe ratio: return per unit of risk taken, across the years so far"
                      >
                        {sharpeText(sharpeFor.get(p.id) ?? null)}
                      </span>
                    ) : null}
                    {feesFor ? (
                      <span
                        className="w-14 shrink-0 text-right font-mono text-xs text-loss"
                        title="fees paid to managers so far"
                      >
                        {cost(feesFor.get(p.id) ?? 0)}
                      </span>
                    ) : null}
                    <span className="flex w-[5.75rem] justify-end">
                      <OutcomeChips outcomes={last5} />
                    </span>
                  </span>
                  {managerGame ? null : (
                  <span className="hidden text-right font-mono text-xs text-ink-muted sm:col-start-5 sm:row-start-1 sm:block">
                    {index === 0 ? (
                      <span className="font-display text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink">
                        Leader
                      </span>
                    ) : (
                      `−${money(Math.max(leaderWealth - Number(p.current_wealth), 0))}`
                    )}
                  </span>
                  )}
                  <span className={`col-start-3 row-start-1 text-right ${managerGame ? "sm:col-start-5" : "sm:col-start-6"}`}>
                    {/* Ink, not green: a balance is not a gain. The chips beside it
                        say which way each round went. */}
                    <span className="block font-mono text-lg font-bold text-ink">
                      {money(p.current_wealth)}
                    </span>
                    {ret ? (
                      <span className="block font-mono text-[11px] leading-tight text-ink-subtle">
                        {ret.latest != null ? (
                          <>
                            <span className={ret.latest >= 0 ? "text-gain" : "text-loss"}>
                              {signedPct(ret.latest * 100, 1)}
                            </span>{" "}
                            this yr ·{" "}
                          </>
                        ) : null}
                        {ret.annualized != null ? (
                          <span className={ret.annualized >= 0 ? "text-gain" : "text-loss"}>
                            {signedPct(ret.annualized * 100, 1)}/yr
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            }}
          />
        </Panel>

      {/* Wealth over rounds, under this round — the standings' colour bars are its key */}
      <Panel
        className="lg:col-start-1 lg:row-start-2"
        bodyClassName="p-3 sm:p-4"
        title={`Wealth over ${managerGame ? "years" : "rounds"}`}
      >
        <WealthChart
          players={visiblePlayers}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
          unitLabel={managerGame ? "Year" : "Round"}
        />
      </Panel>

      {/* Per-round history */}
      <Panel
        className="lg:col-span-2"
        bodyClassName="px-2 pb-2 pt-2 sm:px-3"
        info={historyInfo(managerGame)}
        infoLabel="About the history table"
        title={`${managerGame ? "Year" : "Round"} history`}
      >
        <SessionHistoryTable
          rounds={history.rounds}
          allocations={history.allocations}
          manager={managerGame}
        />
      </Panel>
      </PanelGrid>
      </div>
    </main>
  );
}

// Mid-game odds tuning is rarely used, so it's tucked behind a disclosure to
// keep the control panel compact.
function OddsDisclosure({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between border-y-[1.5px] border-ink/15 px-1 text-sm font-semibold text-ink transition marker:content-none hover:bg-brand-soft/60 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Sliders /> Adjust market odds
        </span>
        <ChevronDown className="transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-2">
        <MarketOddsControl supabase={supabase} session={session} />
      </div>
    </details>
  );
}

function StatusBadge({ phase }: { phase: RoundPhase }) {
  // A label, not a button — plain text with a dot, no pill. The dot pings
  // while students can still act.
  const styles: Record<RoundPhase, { cls: string; dot: string; label: string }> = {
    loading: { cls: "text-ink-muted", dot: "bg-ink-subtle", label: "Loading" },
    open: { cls: "text-gain", dot: "bg-gain", label: "Open" },
    locked: { cls: "text-ink", dot: "bg-brand-strong", label: "Locked" },
    revealed: { cls: "text-play", dot: "bg-play", label: "Revealed" },
  };
  const s = styles[phase];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-wide ${s.cls}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {phase === "open" ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${s.dot}`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}

/** Places gained (▲) or lost (▼) over the last round; a quiet dash for none. */
function Movement({ d }: { d: number | undefined }) {
  if (d == null || d === 0) {
    return <span className="font-mono text-xs text-ink-subtle" aria-label="no change">–</span>;
  }
  const up = d > 0;
  return (
    <span
      className={`inline-flex items-center font-mono text-xs font-bold ${up ? "text-gain" : "text-loss"}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(d)}`}
    >
      {up ? <ArrowUp /> : <ArrowDown />}
      {Math.abs(d)}
    </span>
  );
}

/** A slim bar under the submitted counter that fills as students lock in. */
function SubmitMeter({ submitted, total }: { submitted: number; total: number }) {
  const pct = total > 0 ? Math.min(submitted / total, 1) * 100 : 0;
  return (
    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
      <div
        className="h-full rounded-full bg-gain transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Compact per-asset GOOD/BAD pick for manual portfolio rounds. */
function AssetPickButton({
  label,
  active,
  onClick,
  good,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  good?: boolean;
}) {
  const activeCls = good ? "bg-gain text-white" : "bg-loss text-white";
  const idleCls = "bg-surface text-ink-muted hover:bg-paper-2 hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl border-2 border-ink text-sm font-bold transition ${
        active ? activeCls : idleCls
      }`}
    >
      {good ? <ArrowUp /> : <ArrowDown />}
      {label}
    </button>
  );
}

function OutcomeButton({
  label,
  active,
  onClick,
  good,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  good?: boolean;
}) {
  // Static class strings (Tailwind JIT can't see interpolated class names).
  const activeCls = good ? "bg-gain text-white" : "bg-loss text-white";
  const idleCls = "bg-surface text-ink-muted hover:bg-paper-2";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink py-4 font-display text-lg font-extrabold uppercase tracking-tight transition-colors ${
        active ? activeCls : idleCls
      }`}
    >
      {good ? <ArrowUp /> : <ArrowDown />}
      {label}
    </button>
  );
}
