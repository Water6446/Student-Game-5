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
import { WealthChart } from "@/components/host/WealthChart";
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
  returnSummaryByPlayer,
  submittedHumanCount,
  type LuckStats,
} from "@/lib/game/results";
import { CondensedList } from "@/components/CondensedList";
import { LuckChip } from "@/components/LuckChip";
import { assetName, numAssets } from "@/lib/game/portfolio";
import { indexSeries } from "@/lib/game/manager";
import { FeeCounter, feesByPlayer, sumFees } from "@/components/FeeCounter";
import { isManager, isPortfolio } from "@/lib/game/types";
import { ManagerYearResult } from "@/components/ManagerYearResult";
import { cost, money, sharpeText, signedPct } from "@/lib/game/format";
import { Banner, Button, CountUp, SectionTitle, buttonClasses } from "@/components/ui";
import { useHotkeys } from "@/components/use-hotkeys";
import { useConfirm } from "@/components/ConfirmDialog";
import { useShowBots } from "@/components/use-show-bots";
import { BotToggle } from "@/components/host/BotToggle";
import { FinalResults } from "@/components/host/FinalResults";
import { ManagePlayerButton } from "@/components/host/ManagePlayer";
import { RankBadge } from "@/components/RankBadge";
import { LEDGER, LEDGER_ROW, SECTION } from "@/components/ledger";
import {
  ArrowDown,
  ArrowLeft,
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

  return (
    // One cream sheet, no cards: sections sit on the page under a heavy rule
    // (DESIGN.md §4). Only real objects — buttons, stamps, the verdict — box up.
    <main className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <Link
              href="/host"
              className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft /> Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
                {managerGame ? "Year" : "Round"} {session.current_round}
                <span className="text-ink-subtle"> / {session.config.num_rounds}</span>
              </h1>
              <StatusBadge phase={phase} />
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              aria-label="Present — open the projector view in a new tab"
              className={buttonClasses("secondary", "sm", "min-w-[44px]")}
              title="Open the projector view in a new tab"
            >
              {/* Below sm the labels drop and the icons carry the meaning — the
                  header has to fit a 375px viewport without wrapping to three rows. */}
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={finishEarly}
              disabled={busy}
              aria-label="Finish early — end the game now and jump to the final summary"
              title="End the game now and jump to the final summary"
              className="min-w-[44px]"
            >
              <Flag /> <span className="hidden sm:inline">Finish early</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteSession}
              disabled={busy}
              aria-label="Delete this session"
              title="Delete this session"
              className="min-w-[44px] text-loss hover:bg-loss-soft hover:text-loss"
            >
              <Trash /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
        <RoundTrack
          total={session.config.num_rounds}
          current={session.current_round}
          phase={phase}
          rounds={history.rounds}
          sharedBasic={!portfolioGame && !managerGame && !independent}
        />
      </header>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {/* Control panel */}
        <section className={`space-y-5 ${SECTION}`}>
          <SectionTitle>{managerGame ? "This year" : "This round"}</SectionTitle>
          {/* Primary action — pinned to the top of the panel so it stays in the
              same place across open → reveal → next. In auto mode the host can
              click "Lock & reveal" then "Next round" without moving the cursor. */}
          {primaryAction ? (
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
            <>
              {/* One fetch round-trip after "Next round" lands. The panel keeps
                  its shape and the action stays pinned but disabled — showing
                  the previous round's body here is the bug this fixes. */}
              <Button disabled variant="secondary" className="w-full text-lg">
                Loading {managerGame ? "year" : "round"} {session.current_round}…
              </Button>
              <p className="text-center font-editorial text-sm italic text-ink-subtle">
                Syncing with the server…
              </p>
            </>
          )}


          {error ? <Banner kind="error">{error}</Banner> : null}

          {/* Supporting context for each phase, below the pinned action. */}
          {phase === "open" && (
            <>
              <div className="text-center">
                <div className="font-mono text-6xl font-black text-ink">
                  {/* "—" while the fetch is in flight: an unknown numerator is
                      honest, a stale one is a lie. */}
                  {allocsLoading ? "—" : <CountUp value={submitted.submitted} duration={400} />}
                  <span className="text-ink-subtle"> / {submitted.total}</span>
                </div>
                <SubmitMeter
                  submitted={allocsLoading ? 0 : submitted.submitted}
                  total={submitted.total}
                />
                <div className="mt-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
                  {submitted.total > 0 && submitted.submitted === submitted.total && !allocsLoading
                    ? "Everyone's in"
                    : "Submitted"}
                </div>
              </div>
              {!isManual && !managerGame ? (
                <OddsDisclosure supabase={supabase} session={session} />
              ) : null}
              <CondensedList
                items={checklist}
                keyOf={(p) => p.id}
                as="ul"
                options={CHECKLIST_CONDENSE}
                className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2"
                gapClassName="font-editorial text-sm italic text-ink-subtle hover:text-ink"
                toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
                renderItem={(p) => (
                  <li
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${
                      submittedIds.has(p.id) ? "font-semibold text-gain" : "text-ink-muted"
                    }`}
                  >
                    {submittedIds.has(p.id) ? (
                      <Check className="shrink-0 animate-count-pop" />
                    ) : (
                      <CircleDashed className="shrink-0 text-ink-subtle" />
                    )}
                    <span className="truncate">{p.display_name}</span>
                  </li>
                )}
              />
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
                <div className="flex animate-pop-in items-center gap-2 font-editorial text-base italic text-ink-muted">
                  <Shuffle className="shrink-0 not-italic text-ink" />
                  Independent market — each player drew their own outcome
                  {portfolioGame ? "s" : ""}.
                </div>
              ) : (
                <div
                  className={`flex items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-dots-light p-4 text-center font-display text-2xl font-black uppercase tracking-tight text-white shadow-card ${
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
        </section>

        {/* Live standings — each player's last 5 markets shown inline */}
        <section className={SECTION}>
          <SectionTitle
            className="mb-3"
            infoLabel="About the standings"
            info={
              <>
                {managerGame
                  ? "Arrows show each player's last 5 years (up = gained, down = lost)"
                  : portfolioGame
                    ? "Arrows show each player's last 5 rounds (up = gained, down = lost)"
                    : "Arrows show each player's last 5 markets"}
                {independent ? ". ± is their luck vs the expected odds" : ""}
                {sharpeFor ? ". S = Sharpe Ratio (return per unit of risk)" : ""}
                {feesFor ? ". Red figures are fees paid to managers so far" : ""}.
              </>
            }
            action={hasBots ? <BotToggle showBots={showBots} onToggle={setShowBots} /> : null}
          >
            {gameOver ? "Final standings" : "Standings"}
          </SectionTitle>
          {marketLine ? (
            <p className="mb-3 font-editorial text-sm italic text-ink-muted">
              Market: <span className={marketLine.latest >= 0 ? "text-gain" : "text-loss"}>
                {signedPct(marketLine.latest * 100, 1)}
              </span>{" "}
              this year ·{" "}
              <span className={marketLine.annualized >= 0 ? "text-gain" : "text-loss"}>
                {signedPct(marketLine.annualized * 100, 1)}
              </span>
              /yr over {marketLine.years} year{marketLine.years === 1 ? "" : "s"}
            </p>
          ) : null}
          {managerGame ? (
            <p className="mb-3">
              <FeeCounter total={classFees} label="Class fees so far" />
            </p>
          ) : null}
          {classLuck ? (
            <p className="mb-3 font-editorial text-sm italic text-ink-muted">
              Markets: {classLuck.good}/{classLuck.total} good ·{" "}
              <span
                className={
                  classLuck.delta > 0 ? "text-gain" : classLuck.delta < 0 ? "text-loss" : "text-ink-muted"
                }
              >
                {signedPct(classLuck.delta * 100)}
              </span>{" "}
              vs {Math.round(classLuck.expected * 100)}% expected
            </p>
          ) : null}
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
                // Below sm this wraps to two lines — name + money, then luck and
                // the market chips — instead of overflowing a 375px viewport.
                <li
                  style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
                  className={`stagger flex animate-rise flex-wrap items-center justify-between gap-x-3 gap-y-1 ${LEDGER_ROW}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-ink">
                    <RankBadge rank={index + 1} />
                    <span className="min-w-0 truncate font-semibold">{p.display_name}</span>
                    <ManagePlayerButton supabase={supabase} session={session} player={p} />
                  </span>
                  <span className="order-2 text-right sm:order-3">
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
                  <span className="order-3 flex w-full items-center justify-end gap-3 sm:order-2 sm:w-auto">
                    <LuckChip luck={rowLuck} expected={expected} />
                    {sharpeFor ? (
                      <span
                        className="shrink-0 font-mono text-xs text-ink-muted"
                        title="Sharpe ratio: return per unit of risk taken, across the years so far"
                      >
                        S {sharpeText(sharpeFor.get(p.id) ?? null)}
                      </span>
                    ) : null}
                    {feesFor ? (
                      <span
                        className="shrink-0 font-mono text-xs text-loss"
                        title="fees paid to managers so far"
                      >
                        {cost(feesFor.get(p.id) ?? 0)}
                      </span>
                    ) : null}
                    <OutcomeChips outcomes={last5} />
                  </span>
                </li>
              );
            }}
          />
        </section>
      </div>

      {/* Wealth over rounds */}
      <section className={`mt-12 ${SECTION}`}>
        <SectionTitle className="mb-3">Wealth over {managerGame ? "years" : "rounds"}</SectionTitle>
        <WealthChart
          players={visiblePlayers}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
          unitLabel={managerGame ? "Year" : "Round"}
        />
      </section>

      {/* Per-round history */}
      <section className={`mt-12 ${SECTION}`}>
        <SectionTitle
          className="mb-3"
          info={historyInfo(managerGame)}
          infoLabel="About the history table"
        >
          {managerGame ? "Year" : "Round"} history
        </SectionTitle>
        <SessionHistoryTable
          rounds={history.rounds}
          allocations={history.allocations}
          manager={managerGame}
        />
      </section>
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

/**
 * The game as a strip of segments under the round title: one per round,
 * coloured once it resolves (green/red for a class-wide basic market, ink
 * otherwise), amber for the round in play. Where the class has been, at a glance.
 */
function RoundTrack({
  total,
  current,
  phase,
  rounds,
  sharedBasic,
}: {
  total: number;
  current: number;
  phase: RoundPhase;
  rounds: { round_number: number; status: string; market_outcome: MarketOutcome | null }[];
  sharedBasic: boolean;
}) {
  const byNumber = new Map(rounds.map((r) => [r.round_number, r]));
  // Past ~40 rounds a segment is thinner than the gap between segments; a long
  // game gets one continuous bar instead.
  if (total > 40) {
    const pct = total > 0 ? Math.min(current / total, 1) * 100 : 0;
    return (
      <div
        className="mt-4 h-3 overflow-hidden rounded-full border-2 border-ink bg-surface"
        role="img"
        aria-label={`Round ${current} of ${total}`}
      >
        <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <ol
      className="mt-4 flex h-3 gap-[3px]"
      aria-label={`Round ${current} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const r = byNumber.get(n);
        const revealed = r?.status === "revealed" && !(n === current && phase !== "revealed");
        const cls = revealed
          ? sharedBasic
            ? r?.market_outcome === "good"
              ? "bg-gain"
              : r?.market_outcome === "bad"
                ? "bg-loss"
                : "bg-ink"
            : "bg-ink"
          : n === current
            ? "bg-brand animate-pulse-soft"
            : "bg-surface";
        return (
          <li
            key={n}
            title={`${n}${revealed && sharedBasic && r?.market_outcome ? ` · ${r.market_outcome === "good" ? "up" : "down"}` : ""}`}
            className={`min-w-0 flex-1 rounded-[3px] border-[1.5px] border-ink transition-colors duration-300 ${cls}`}
          />
        );
      })}
    </ol>
  );
}

/** A chunky meter under the submitted counter that fills as students lock in. */
function SubmitMeter({ submitted, total }: { submitted: number; total: number }) {
  const pct = total > 0 ? Math.min(submitted / total, 1) * 100 : 0;
  return (
    <div className="mx-auto mt-3 h-4 w-full max-w-xs overflow-hidden rounded-full border-2 border-ink bg-paper-2">
      <div
        className="h-full rounded-r-full border-r-2 border-ink bg-gain transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, borderRightWidth: pct > 0 && pct < 100 ? 2 : 0 }}
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
