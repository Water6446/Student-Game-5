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
import { SessionHistoryTable } from "@/components/host/SessionHistoryTable";
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
  playerDeltaChipsMap,
  playerOutcomesMap,
  portfolioOutcomeMatrix,
  type LuckStats,
} from "@/lib/game/results";
import { condenseRanked } from "@/lib/game/condense";
import { assetName, numAssets } from "@/lib/game/portfolio";
import { isPortfolio } from "@/lib/game/types";
import { money, signedPct } from "@/lib/game/format";
import { Banner, Button, Card } from "@/components/ui";
import { useShowBots } from "@/components/use-show-bots";
import { BotToggle } from "@/components/host/BotToggle";
import { FinalResults } from "@/components/host/FinalResults";
import { ArrowLeft, ArrowUp, ArrowDown, Lock, Check, ArrowRight, Shuffle, Monitor, Sliders, ChevronDown, Flag, Clover } from "@/components/icons";

export function HostRoundControl({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const router = useRouter();
  const players = usePlayers(supabase, session.id);
  const loadedRound = useRound(supabase, session.id, session.current_round);
  // What to DISPLAY: gates a stale round row after "Next round" and swallows the
  // transient "locked" state of the one-click auto flow. See use-round-phase.ts.
  const { phase, round } = useRoundPhase(loadedRound, session.current_round);
  const allocs = useRoundAllocations(supabase, round?.id ?? null);
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
    const ok = window.confirm(
      `Delete session ${session.join_code}? This permanently removes all players, rounds and allocations. This cannot be undone.`,
    );
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
  const nAssets = numAssets(session.config);
  const submittedIds = useMemo(() => new Set(allocs.map((a) => a.player_id)), [allocs]);
  // bots auto-play and never "submit", so they're excluded from the submission counter
  const humanPlayers = useMemo(() => players.filter((p) => !p.is_bot), [players]);
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
  // >10 players: top 5 + bottom 3, middle behind an expander
  const [showAllStandings, setShowAllStandings] = useState(false);
  const standingItems = useMemo(
    () =>
      showAllStandings ? condenseRanked(standings, { threshold: Infinity }) : condenseRanked(standings),
    [standings, showAllStandings],
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
  function finishEarly() {
    const ok = window.confirm(
      `Finish the game early, at round ${session.current_round} of ${session.config.num_rounds}?\n\n` +
        "The game ends immediately: no more rounds, students see their final results, " +
        "and you get the summary screen. This cannot be undone.",
    );
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

  // Standings chips: basic shows each player's own market draws; portfolio has
  // no single outcome per round, so chips read gained/lost that round instead.
  const deltaChipsByPlayer = useMemo(
    () => (portfolioGame ? playerDeltaChipsMap(history.rounds, history.allocations) : null),
    [portfolioGame, history.rounds, history.allocations],
  );

  // benchmark GOOD rate per draw (portfolio: mean of per-asset odds)
  const expected = expectedGoodRate(session.config);

  // Live signed luck per player (only meaningful when draws are independent):
  // observed GOOD rate minus the benchmark, updated as rounds reveal.
  const luckByPlayer = useMemo(() => {
    const m = new Map<string, LuckStats | null>();
    if (!independent) return m;
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
  }, [independent, players, portfolioGame, session, history.rounds, history.allocations, outcomesByPlayer, expected]);

  // Shared scope: everyone faces the same draws — one class-level luck line.
  const classLuck = useMemo(
    () => (independent ? null : classLuckSoFar(session.config, history.rounds)),
    [independent, session.config, history.rounds],
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
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/host"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft /> Dashboard
          </Link>
          <h1 className="text-3xl font-black text-ink">
            Round {session.current_round}{" "}
            <span className="text-ink-subtle">/ {session.config.num_rounds}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge phase={phase} />
          <Link
            href={`/host/${session.id}/present`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink shadow-card transition hover:border-brand"
            title="Open the projector view in a new tab"
          >
            <Monitor /> Present
          </Link>
          <button
            type="button"
            onClick={finishEarly}
            disabled={busy}
            title="End the game now and jump to the final summary"
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:bg-paper-2 hover:text-ink disabled:opacity-50"
          >
            <Flag /> Finish early
          </button>
          <button
            type="button"
            onClick={deleteSession}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-loss transition hover:bg-loss-soft disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Control panel */}
        <Card className="space-y-5">
          {/* Primary action — pinned to the top of the panel so it stays in the
              same place across open → reveal → next. In auto mode the host can
              click "Lock & reveal" then "Next round" without moving the cursor. */}
          {phase === "loading" && (
            <>
              {/* One fetch round-trip after "Next round" lands. The panel keeps
                  its shape and the action stays pinned but disabled — showing
                  the previous round's body here is the bug this fixes. */}
              <Button disabled className="w-full text-lg">
                Loading round {session.current_round}…
              </Button>
              <p className="text-center font-editorial text-sm italic text-ink-subtle">
                Syncing with the server…
              </p>
            </>
          )}
          {phase === "open" &&
            (isManual ? (
              <Button onClick={lock} disabled={busy} className="w-full text-lg">
                Lock allocations
              </Button>
            ) : (
              <Button onClick={lockAndReveal} disabled={busy} className="w-full text-lg">
                Lock &amp; reveal
              </Button>
            ))}
          {phase === "locked" && (
            <Button
              onClick={reveal}
              disabled={busy || (isManual && (portfolioGame ? !picksComplete : !pick))}
              className="w-full text-lg"
            >
              Reveal results
            </Button>
          )}
          {phase === "revealed" &&
            (isLastRound ? (
              <Button onClick={finish} disabled={busy} variant="danger" className="w-full text-lg">
                Finish game
              </Button>
            ) : (
              <Button onClick={next} disabled={busy} variant="success" className="w-full text-lg">
                Next round <ArrowRight />
              </Button>
            ))}

          {error ? <Banner kind="error">{error}</Banner> : null}

          {/* Supporting context for each phase, below the pinned action. */}
          {phase === "open" && (
            <>
              <div className="text-center">
                <div className="font-mono text-6xl font-black text-gain">
                  {submittedIds.size}
                  <span className="text-line-strong"> / {humanPlayers.length}</span>
                </div>
                <div className="text-sm font-medium text-ink-muted">submitted</div>
              </div>
              {!isManual ? <OddsDisclosure supabase={supabase} session={session} /> : null}
              <ul className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto text-sm">
                {humanPlayers.map((p) => (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 rounded px-2 py-1 ${
                      submittedIds.has(p.id) ? "font-medium text-gain" : "text-ink-subtle"
                    }`}
                  >
                    {submittedIds.has(p.id) ? (
                      <Check className="shrink-0" />
                    ) : (
                      <span className="shrink-0 text-line-strong">•</span>
                    )}
                    <span className="truncate">{p.display_name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === "locked" && (
            <>
              <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-brand-soft px-4 py-2 text-sm font-display font-extrabold uppercase tracking-tight text-ink shadow-card">
                <Lock /> Bets locked in — review, then reveal
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
                <p className="text-center text-sm text-ink-muted">
                  Auto market — the server will roll the outcome{portfolioGame ? "s" : ""}.
                </p>
              )}
              <AllocationsBreakdown
                players={visiblePlayers}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
                portfolio={portfolioGame}
              />
              {!isManual ? <OddsDisclosure supabase={supabase} session={session} /> : null}
            </>
          )}

          {phase === "revealed" && (
            <>
              {portfolioGame && round?.market_outcomes ? (
                <div className="rounded-xl border-2 border-ink bg-paper-2 p-3 shadow-card">
                  <ul className="grid grid-cols-2 gap-1.5">
                    {round.market_outcomes.map((o, i) => (
                      <li
                        key={i}
                        className={`flex items-center justify-between rounded-lg border-2 border-ink px-2.5 py-1.5 text-sm font-bold ${
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
                <div className="flex items-center gap-2 rounded-xl border border-line bg-paper-2 px-4 py-2.5 text-sm text-ink-muted">
                  <Shuffle className="shrink-0 text-ink-subtle" />
                  Independent market — each player drew their own outcome
                  {portfolioGame ? "s" : ""}.
                </div>
              ) : (
                <div
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 border-ink p-4 text-center font-display text-2xl font-black uppercase tracking-tight text-white shadow-card ${
                    round?.market_outcome === "good" ? "bg-gain" : "bg-loss"
                  }`}
                >
                  Market {round?.market_outcome === "good" ? "up" : "down"}
                  {round?.market_outcome === "good" ? <ArrowUp /> : <ArrowDown />}
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
                />
              )}
            </>
          )}
        </Card>

        {/* Live standings — each player's last 5 markets shown inline */}
        <Card>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-ink">
              {gameOver ? "Final standings" : "Standings"}
            </h2>
            {hasBots ? <BotToggle showBots={showBots} onToggle={setShowBots} /> : null}
          </div>
          <p className="mb-3 text-xs text-ink-subtle">
            {portfolioGame
              ? "Last 5 rounds per player (up = gained, down = lost)"
              : "Last 5 markets per player"}
            {independent ? " · ± = luck vs expected odds" : ""}
            {hasBots && !showBots ? " · bots hidden" : ""}.
          </p>
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
          <ol className="space-y-1">
            {standingItems.map((c) => {
              if (c.kind === "gap") {
                return (
                  <li key="gap" className="py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setShowAllStandings(true)}
                      className="font-editorial text-sm italic text-ink-subtle transition hover:text-ink"
                    >
                      +{c.hidden} more ▾
                    </button>
                  </li>
                );
              }
              const p = c.item;
              const last5 = (
                (portfolioGame ? deltaChipsByPlayer?.get(p.id) : outcomesByPlayer.get(p.id)) ?? []
              ).slice(-5);
              const rowLuck = luckByPlayer.get(p.id) ?? null;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-line bg-paper-2 px-4 py-2"
                >
                  <span className="text-ink">
                    <span className="mr-2 font-mono text-ink-subtle">{c.index + 1}.</span>
                    {p.display_name}
                  </span>
                  <span className="flex items-center gap-3">
                    {rowLuck ? (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          rowLuck.delta > 0 ? "text-gain" : rowLuck.delta < 0 ? "text-loss" : "text-ink-muted"
                        }`}
                        title={`GOOD-draw rate vs the expected ${Math.round(expected * 100)}%`}
                      >
                        <Clover className={rowLuck.delta >= 0 ? "text-gain" : "text-loss"} />
                        {signedPct(rowLuck.delta * 100)}
                      </span>
                    ) : null}
                    <OutcomeChips outcomes={last5} />
                    <span className="font-mono text-lg font-bold text-gain">
                      {money(p.current_wealth)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {showAllStandings && standings.length > 10 ? (
            <p className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setShowAllStandings(false)}
                className="font-editorial text-sm italic text-ink-subtle transition hover:text-ink"
              >
                Show fewer ▴
              </button>
            </p>
          ) : null}
        </Card>
      </div>

      {/* Wealth over rounds */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-bold text-ink">Wealth over rounds</h2>
        <WealthChart
          players={visiblePlayers}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
        />
      </Card>

      {/* Per-round history */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-bold text-ink">Round history</h2>
        <SessionHistoryTable rounds={history.rounds} allocations={history.allocations} />
      </Card>
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
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-line bg-paper-2 px-4 py-2.5 text-sm font-semibold text-ink-muted transition marker:content-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Sliders /> Adjust market odds
        </span>
        <ChevronDown className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">
        <MarketOddsControl supabase={supabase} session={session} />
      </div>
    </details>
  );
}

function StatusBadge({ phase }: { phase: RoundPhase }) {
  const styles: Record<RoundPhase, string> = {
    loading: "bg-paper-2 text-ink-subtle",
    open: "bg-gain-soft text-gain",
    locked: "bg-brand-soft text-ink",
    revealed: "bg-play-soft text-play",
  };
  return (
    <span
      className={`rounded-full border-2 border-ink px-4 py-1.5 text-sm font-display font-extrabold capitalize shadow-card ${styles[phase]}`}
    >
      {phase === "loading" ? "…" : phase}
    </span>
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
  const activeCls = good ? "border-ink bg-gain text-white" : "border-ink bg-loss text-white";
  const idleCls = "border-line-strong bg-paper text-ink-muted hover:border-ink-subtle";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border-2 py-2 text-sm font-bold transition active:scale-[0.98] ${
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
  const activeCls = good ? "bg-gain text-white shadow-card" : "bg-loss text-white shadow-card";
  const idleCls = "bg-surface text-ink-muted shadow-card hover:bg-paper-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink py-4 font-display text-lg font-extrabold uppercase tracking-tight transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
        active ? activeCls : idleCls
      }`}
    >
      {good ? <ArrowUp /> : <ArrowDown />}
      {label}
    </button>
  );
}
