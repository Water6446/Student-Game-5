"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useRoundPhase } from "@/components/use-round-phase";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useSessionHistory } from "@/components/use-session-history";
import { useShowBots } from "@/components/use-show-bots";
import { WealthChart } from "@/components/host/WealthChart";
import {
  bustRoundByPlayer,
  classLuckSoFar,
  compareStandings,
  rankMovement,
  submittedHumanCount,
} from "@/lib/game/results";
import type { AllocationRow, RoundRow } from "@/lib/game/db";
import { CondensedList } from "@/components/CondensedList";
import { COLOR } from "@/lib/design/colors";
import { assetName } from "@/lib/game/portfolio";
import { indexSeries } from "@/lib/game/manager";
import { isManager, isPortfolio, type MarketOutcome, type SessionConfig } from "@/lib/game/types";
import { money, signedMoney, signedPct } from "@/lib/game/format";
import { CountUp } from "@/components/ui";
import { FlapText, Panel, PanelGrid, Ticker } from "@/components/terminal";
import { roundFeed, tickerItems } from "@/components/host/round-feed";
import { LineScore, lineScoreKind } from "@/components/host/LineScore";
import { seriesColors } from "@/components/host/WealthChart";
import { Confetti } from "@/components/Confetti";
import { SettingsMenu } from "@/components/SettingsMenu";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { ManagerReveal } from "@/components/ManagerReveal";
import { ArrowUp, ArrowDown, Coins, Lock, Users, Shuffle, Maximize, X, Trophy } from "@/components/icons";

/**
 * Read-only, projector-optimized view of a session. The host keeps the real
 * controls on their laptop (/host/[id]); this screen just reflects live state
 * for the class: big leaderboard + a dramatic market reveal moment. Auto-updates
 * via the same realtime hooks the control screen uses.
 */
export function HostPresent({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-surface px-[3vw] py-[2.5vh]">
      <PresentHeader session={session} />
      <div className="flex flex-1 flex-col">
        {session.status === "lobby" ? (
          <PresentLobby session={session} supabase={supabase} />
        ) : session.status === "finished" ? (
          <PresentFinished supabase={supabase} session={session} />
        ) : (
          <PresentActive supabase={supabase} session={session} />
        )}
      </div>
    </main>
  );
}

function PresentHeader({ session }: { session: SessionRow }) {
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return (
    // The paper masthead every game screen shares, edge to edge.
    <header className="-mx-[3vw] -mt-[2.5vh] mb-[1vh] flex items-center justify-between gap-4 border-b-2 border-ink bg-paper px-[3vw] py-3">
      <div className="flex items-center gap-2 text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-brand text-ink">
          <Coins />
        </span>
        <span className="font-display text-2xl font-black uppercase tracking-tight">The Risk Game</span>
      </div>

      <div className="flex items-center gap-3">
        {session.status !== "finished" ? (
          <span className="hidden items-baseline gap-2 px-2 sm:flex">
            <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-muted">
              join code
            </span>
            <FlapText text={session.join_code} className="text-xl" />
          </span>
        ) : null}
        <SettingsMenu className="flex h-10 items-center gap-2 rounded-xl border-2 border-ink bg-surface px-3 text-sm font-semibold text-ink-muted transition hover:bg-paper-2 hover:text-ink" />
        <button
          type="button"
          onClick={toggleFs}
          aria-label={fs ? "Exit fullscreen" : "Go fullscreen"}
          title={fs ? "Exit fullscreen" : "Go fullscreen"}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-surface text-ink-muted transition hover:bg-paper-2 hover:text-ink"
        >
          <Maximize />
        </button>
        <Link
          href={`/host/${session.id}`}
          aria-label="Exit present mode"
          title="Exit present mode"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-surface text-ink-muted transition hover:bg-paper-2 hover:text-ink"
        >
          <X />
        </Link>
      </div>
    </header>
  );
}

/* ── Lobby: big join call-to-action so latecomers can still get in ─────────── */
function PresentLobby({ session, supabase }: { session: SessionRow; supabase: SupabaseClient }) {
  const players = usePlayers(supabase, session.id).filter((p) => !p.is_bot);
  const link = joinUrl(session.join_code);

  return (
    // The same tiled board as the rest of the game: the join panel and the
    // room, one ink frame around both (DESIGN.md §8).
    <PanelGrid className="my-4 flex-1 animate-pop-in lg:grid-cols-[1fr_1.15fr]">
      <Panel
        size="lg"
        title="Join the game"
        bodyClassName="flex flex-col items-center justify-center bg-ink p-10 text-center text-paper-inverse"
      >
        <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
          Game code
        </p>
        {/* A split-flap board, as at a station: the code flips in, tile by tile. */}
        <FlapText text={session.join_code} onInk className="mt-4 text-7xl sm:text-8xl" />
        <div className="mt-8 rounded-lg bg-white p-6">
          <QRCodeSVG value={link} size={220} fgColor={COLOR.ink} />
        </div>
        <p className="mt-6 break-all font-editorial text-2xl italic text-paper-inverse/80">
          join from your phone — {link}
        </p>
      </Panel>

      {/* Live count — or, in a manager game, the line-up the class is reading */}
      <Panel
        size="lg"
        title={isManager(session.config) ? "The manager line-up" : "In the room"}
        bodyClassName="flex flex-col"
        action={
          <span
            key={players.length}
            className="flex animate-count-pop items-center gap-2 font-mono text-2xl font-black text-ink"
            aria-label={`${players.length} in the room`}
          >
            <Users className="text-[0.8em] text-ink-muted" />
            <CountUp value={players.length} duration={400} />
          </span>
        }
      >
        {isManager(session.config) ? (
          <ManagerProspectus config={session.config} />
        ) : (
          <>
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <p
                key={players.length}
                className="animate-count-pop font-mono text-[clamp(5rem,14vw,10rem)] font-black leading-none text-ink"
              >
                {players.length}
              </p>
              <p className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[0.12em] text-ink-muted">
                {players.length === 1 ? "player" : "players"} in
              </p>
            </div>
            {/* The newest names land on a printed roster as they join — the
                room sees itself arrive. Only the latest few dozen: this is a
                welcome, not the register. */}
            {players.length > 0 ? (
              <ul className="grid max-h-[30vh] grid-cols-3 content-start gap-x-8 overflow-hidden border-t-2 border-ink pt-2">
                {players.slice(-36).map((p, i) => (
                  <li
                    key={p.id}
                    className="flex min-w-0 animate-pop-in items-center gap-3 border-b-2 border-ink/10 py-2 font-display text-2xl font-extrabold text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 shrink-0 rounded-[3px] ${
                        ["bg-brand", "bg-play", "bg-gain", "bg-loss"][i % 4]
                      }`}
                    />
                    <span className="truncate">{p.display_name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pb-6 text-center font-editorial text-2xl italic text-ink-muted">
                Waiting for the first player…
              </p>
            )}
          </>
        )}
      </Panel>
    </PanelGrid>
  );
}

/* ── Active: status panel + live leaderboard, with a reveal takeover ────────── */
function PresentActive({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const players = usePlayers(supabase, session.id);
  const loadedRound = useRound(supabase, session.id, session.current_round);
  // What to DISPLAY: gates a stale round row after "Next round" and swallows the
  // transient "locked" state of the one-click auto flow. See use-round-phase.ts.
  const { phase, round } = useRoundPhase(loadedRound, session.current_round, {
    holdLocked: session.config.market_mode === "auto",
  });
  const history = useSessionHistory(supabase, session.id);
  // Live allocations for the current round so the "submitted" counter updates the
  // instant a student locks in (history only refetches on round status changes).
  const { allocations: allocs, loading: allocsLoading } = useRoundAllocations(
    supabase,
    round?.id ?? null,
  );
  // Mirrors the control screen's show/hide-bots toggle across tabs.
  const [showBots] = useShowBots(session.id);

  // Bots never "submit" — resolve_round writes their rows at reveal time — so
  // they are excluded from both sides of the counter. Shared with the control
  // screen so the two surfaces can't drift.
  const { submitted, total: humanCount } = useMemo(
    () => submittedHumanCount(players, allocs),
    [players, allocs],
  );

  const visiblePlayers = useMemo(
    () => (showBots ? players : players.filter((p) => !p.is_bot)),
    [players, showBots],
  );

  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);

  // The index ghost line, from the same rounds.market_return the Index bot
  // compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!manager) return null;
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
  }, [manager, history.rounds, session.config.starting_wealth]);

  // What each player's balance did in the latest revealed round. The row used
  // to show the MARKET's arrow, so in a shared up-market an all-safe player who
  // gained nothing — or a player who lost money — still read "up" in green.
  const lastDelta = useMemo(
    () => lastRoundDeltas(history.rounds, history.allocations),
    [history.rounds, history.allocations],
  );
  const ticker = useMemo(
    () => tickerItems(session, roundFeed(session, players, history.rounds, history.allocations)),
    [session, players, history.rounds, history.allocations],
  );

  // $0-tied players order by when they busted (first to bust sits last)
  const bust = useMemo(
    () => bustRoundByPlayer(history.rounds, history.allocations),
    [history.rounds, history.allocations],
  );
  const ranked = useMemo(
    () => [...visiblePlayers].sort((a, b) => compareStandings(a, b, bust)),
    [visiblePlayers, bust],
  );
  const movement = useMemo(
    () => rankMovement(visiblePlayers, history.rounds, history.allocations, bust),
    [visiblePlayers, history.rounds, history.allocations, bust],
  );
  const colors = useMemo(
    () => seriesColors(visiblePlayers, manager),
    [visiblePlayers, manager],
  );

  const shared = session.config.market_scope === "shared";
  // shared scope: everyone faces the same draws, so luck is one class-level line
  const classLuck = useMemo(
    () => (shared ? classLuckSoFar(session.config, history.rounds) : null),
    [shared, session.config, history.rounds],
  );

  // Reveal takeover: fire once per round when it flips to "revealed".
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    // Gate on the displayed phase, not the raw status, so the takeover can never
    // fire off a stale round id mid round-change.
    if (!round || phase !== "revealed") return;
    if (shownRef.current !== round.id) {
      shownRef.current = round.id;
      setRevealFor(round.id);
      const t = setTimeout(() => setRevealFor(null), 2500);
      return () => clearTimeout(t);
    }
  }, [round, phase]);

  return (
    <>
    {/* A tiled board: status and chart on the left, the standings tower on
        the right, one ink frame around them all (DESIGN.md §8). */}
    <PanelGrid className="my-4 flex-1 lg:grid-cols-[1fr_1.1fr] lg:grid-rows-[1fr_auto]">
        <Panel
          size="lg"
          title={manager ? "This year" : "This round"}
          bodyClassName="flex flex-1 flex-col px-8 pb-6 pt-8 text-center"
          action={
            // The round counter as a split-flap board: it flips when the round turns.
            <span className="flex items-center gap-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">
              {manager ? "Year" : "Round"}
              <FlapText text={String(session.current_round).padStart(2, "0")} className="text-lg" />
              <span className="font-mono text-lg font-bold text-ink-muted">/{session.config.num_rounds}</span>
            </span>
          }
        >
          <div className="flex flex-1 flex-col items-center justify-center">
            {phase === "loading" ? (
              /* One fetch round-trip while the next round loads. Showing the
                 previous round's outcome under a new round number is the bug. */
              <p className="mt-6 animate-pulse-soft font-editorial text-3xl italic text-ink-muted">
                Getting round {session.current_round} ready…
              </p>
            ) : phase === "open" ? (
              <>
                <p className="mt-6 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
                  Place your bets
                </p>
                <div className="mt-8 font-mono text-[clamp(4rem,12vw,9rem)] font-black leading-none text-ink">
                  {/* "—" while the fetch is in flight: an unknown numerator is
                      honest, a stale one is a lie. */}
                  {allocsLoading ? "—" : <CountUp value={submitted} duration={400} />}
                  <span className="text-ink-muted">/{humanCount}</span>
                </div>
                <div className="mt-6 h-6 w-full max-w-md overflow-hidden rounded-full border-[3px] border-ink bg-surface">
                  <div
                    className="h-full bg-gain transition-[width] duration-700 ease-out"
                    style={{
                      width: `${humanCount > 0 && !allocsLoading ? Math.min(submitted / humanCount, 1) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-3 font-display text-2xl font-extrabold uppercase tracking-wide text-ink-muted">
                  {humanCount > 0 && submitted === humanCount && !allocsLoading ? "Everyone's in" : "locked in"}
                </p>
              </>
            ) : phase === "locked" ? (
              <>
                <p className="mt-8 inline-flex animate-stamp items-center gap-4 rounded-2xl border-[3px] border-ink bg-brand px-8 py-3 font-display text-4xl font-black uppercase tracking-tight text-ink shadow-lift sm:text-5xl">
                  <Lock /> Bets are locked
                </p>
                <p className="mt-4 animate-pulse-soft font-editorial text-2xl italic text-ink-muted">
                  Revealing the market…
                </p>
              </>
            ) : manager && round?.market_return != null ? (
              /* Manager years have no good/bad outcome — the field is null, and
                 reading it here shouted "Market down!" over every up year. */
              <RoundOutcomeBig
                good={Number(round.market_return) >= 0}
                pct={Number(round.market_return)}
              />
            ) : portfolio && round?.market_outcomes ? (
              <PortfolioOutcomeBig config={session.config} outcomes={round.market_outcomes} />
            ) : shared && !portfolio ? (
              <RoundOutcomeBig good={round?.market_outcome === "good"} />
            ) : (
              <>
                <Shuffle className="mt-6 text-5xl text-ink-muted" />
                <p className="mt-4 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
                  Results are in
                </p>
                <p className="mt-2 font-editorial text-2xl italic text-ink-muted">
                  Each player drew their own market{portfolio ? "s" : ""}.
                </p>
              </>
            )}
          </div>
          {/* The game so far, as a scoreboard along the foot of the panel. */}
          <div className="mt-8 text-left">
            <LineScore
              size="lg"
              total={session.config.num_rounds}
              current={session.current_round}
              phase={phase}
              rounds={history.rounds}
              kind={lineScoreKind(session.config)}
            />
          </div>
        </Panel>

        <Panel size="lg" title={`Wealth over ${manager ? "years" : "rounds"}`} className="lg:row-start-2" bodyClassName="p-3 sm:p-4">
          <WealthChart
            players={visiblePlayers}
            rounds={history.rounds}
            allocations={history.allocations}
            startingWealth={session.config.starting_wealth}
            hideToggle={true}
            benchmark={benchmark}
            unitLabel={manager ? "Year" : "Round"}
          />
        </Panel>

      {/* Leaderboard — a timing tower: position, movement, the colour key */}
      <Panel
        size="lg"
        title="Standings"
        icon={<Trophy />}
        className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
        bodyClassName="px-3 pb-3 pt-2"
        action={
          classLuck ? (
            <span className="font-mono text-base text-ink-muted">
              Markets {classLuck.good}/{classLuck.total} up ·{" "}
              <span className={classLuck.delta > 0 ? "text-gain" : classLuck.delta < 0 ? "text-loss" : ""}>
                {signedPct(classLuck.delta * 100)}
              </span>{" "}
              vs {Math.round(classLuck.expected * 100)}%
            </span>
          ) : null
        }
      >
        <Leaderboard ranked={ranked} lastDelta={lastDelta} movement={movement} colors={colors} />
      </Panel>
    </PanelGrid>

    {/* The tape along the bottom of the screen, news-channel style. */}
    <Ticker items={ticker} size="lg" className="-mx-[3vw] -mb-[2.5vh] border-t-2 border-ink" />

      {revealFor ? (
        <RevealTakeover
          shared={shared && !portfolio}
          good={round?.market_outcome === "good"}
          roundNumber={session.current_round}
          config={session.config}
          assetOutcomes={portfolio ? round?.market_outcomes ?? null : null}
          marketReturn={manager ? round?.market_return ?? null : null}
          onDismiss={() => setRevealFor(null)}
        />
      ) : null}
    </>
  );
}

/** Portfolio, shared scope: the round's per-asset outcomes, projector-sized. */
function PortfolioOutcomeBig({
  config,
  outcomes,
}: {
  config: SessionConfig;
  outcomes: MarketOutcome[];
}) {
  return (
    <div className="mt-6 w-full max-w-xl">
      <p className="mb-3 font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
        The markets moved
      </p>
      <ul className={`grid gap-2 ${outcomes.length > 4 ? "grid-cols-2" : "grid-cols-1"}`}>
        {outcomes.map((o, i) => (
          <li
            key={i}
            className={`flex items-center justify-between rounded-xl border-2 border-ink px-4 py-2.5 text-white ${
              o === "good" ? "bg-gain" : "bg-loss"
            }`}
          >
            <span className="truncate font-display text-xl font-extrabold sm:text-2xl">
              {assetName(config, i)}
            </span>
            <span className="flex items-center gap-1 font-display text-xl font-black uppercase sm:text-2xl">
              {o === "good" ? <ArrowUp /> : <ArrowDown />}
              {o === "good" ? "Up" : "Down"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoundOutcomeBig({ good, pct }: { good: boolean; pct?: number }) {
  return (
    <div
      className={`mt-6 flex animate-pop-in flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-dots-light px-8 py-6 text-white shadow-lift ${
        good ? "bg-gain" : "bg-loss"
      }`}
    >
      <span className="text-[clamp(3rem,9vw,7rem)] leading-none">
        {good ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="animate-stamp font-display text-4xl font-black uppercase tracking-tight sm:text-5xl">
        {good ? "Market up!" : "Market down!"}
      </span>
      {pct != null ? (
        <span className="font-mono text-3xl font-black sm:text-4xl">
          {signedPct(pct * 100, 1)}
        </span>
      ) : null}
    </div>
  );
}

/* Full-screen reveal "moment" that briefly takes over, then settles. */
function RevealTakeover({
  shared,
  good,
  roundNumber,
  config,
  assetOutcomes,
  marketReturn,
  onDismiss,
}: {
  shared: boolean;
  good: boolean;
  roundNumber: number;
  config: SessionConfig;
  /** portfolio, shared scope: the class-wide per-asset outcomes */
  assetOutcomes: MarketOutcome[] | null;
  /** manager game: the year's index return — replaces the good/bad flag */
  marketReturn?: number | null;
  onDismiss: () => void;
}) {
  // Portfolio with class-wide outcomes: a grid of asset results. All-good gets
  // the full green flood + confetti; all-bad the red; a mixed round stays ink.
  if (assetOutcomes && assetOutcomes.length > 0) {
    const allGood = assetOutcomes.every((o) => o === "good");
    const allBad = assetOutcomes.every((o) => o === "bad");
    const cls = allGood ? "bg-gain text-white" : allBad ? "bg-loss text-white" : "bg-ink text-paper-inverse";
    return (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss reveal"
        className={`animate-pop-in fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden px-6 ${cls}`}
      >
        <Sunburst />
        {allGood ? <Confetti /> : null}
        <span className="relative font-display text-sm font-extrabold uppercase tracking-[0.3em] opacity-80">
          Round {roundNumber}
        </span>
        <span className="relative animate-stamp font-display text-[clamp(2rem,7vw,5rem)] font-black uppercase leading-none tracking-tight">
          {allGood ? "Everything up!" : allBad ? "Everything down!" : "The markets moved"}
        </span>
        <ul
          className={`relative grid w-full max-w-3xl gap-3 ${
            assetOutcomes.length > 4 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {assetOutcomes.map((o, i) => (
            <li
              key={i}
              style={{ "--i": i + 4 } as React.CSSProperties}
              className={`stagger flex animate-rise items-center justify-between rounded-2xl border-2 px-5 py-3 ${
                o === "good"
                  ? "border-white/60 bg-gain text-white"
                  : "border-white/60 bg-loss text-white"
              }`}
            >
              <span className="truncate font-display text-2xl font-extrabold sm:text-3xl">
                {assetName(config, i)}
              </span>
              <span className="flex items-center gap-1 font-display text-2xl font-black uppercase sm:text-3xl">
                {o === "good" ? <ArrowUp /> : <ArrowDown />}
                {o === "good" ? "Up" : "Down"}
              </span>
            </li>
          ))}
        </ul>
      </button>
    );
  }

  // Manager years carry a continuous return, not a good/bad flag: the sign
  // drives the colour and the number itself is the headline detail.
  const isGood = marketReturn != null ? marketReturn >= 0 : good;
  const neutral = !shared && marketReturn == null;
  const cls = neutral
    ? "bg-ink text-paper-inverse"
    : isGood
      ? "bg-gain text-white"
      : "bg-loss text-white";
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss reveal"
      className={`animate-pop-in fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden ${cls}`}
    >
      <Sunburst />
      {!neutral && isGood ? <Confetti /> : null}
      <span className="relative font-display text-sm font-extrabold uppercase tracking-[0.3em] opacity-80">
        {marketReturn != null ? "Year" : "Round"} {roundNumber}
      </span>
      {/* The arrow flies in from the direction it points. */}
      <span
        className={`relative text-[clamp(5rem,22vw,16rem)] leading-none ${
          neutral ? "animate-pop-in" : isGood ? "animate-rise-tall" : "animate-drop-in"
        }`}
      >
        {neutral ? <Shuffle /> : isGood ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="relative animate-stamp font-display text-[clamp(2.5rem,9vw,7rem)] font-black uppercase leading-none tracking-tight [animation-delay:0.15s]">
        {neutral ? "Results are in" : isGood ? "Market up!" : "Market down!"}
      </span>
      {marketReturn != null ? (
        <span className="relative animate-count-pop font-mono text-[clamp(2rem,6vw,4rem)] font-black [animation-delay:0.4s]">
          {signedPct(marketReturn * 100, 1)}
        </span>
      ) : !neutral ? (
        <span className="relative animate-rise font-editorial text-2xl italic opacity-90 [animation-delay:0.45s]">
          Risky bets {isGood ? "paid off" : "took a hit"}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Slow-turning rays behind a takeover — the game-show sunburst. Faint white on
 * the flood colour, so the verdict stays the only thing that shouts. Reduced
 * motion freezes it (globals.css).
 */
function Sunburst() {
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
 * Each player's change in the latest revealed round (resulting − stake). A
 * player with no row that round (joined late, removed) is absent.
 */
function lastRoundDeltas(rounds: RoundRow[], allocations: AllocationRow[]): Map<string, number> {
  const last = rounds
    .filter((r) => r.status === "revealed")
    .reduce<RoundRow | null>((a, r) => (!a || r.round_number > a.round_number ? r : a), null);
  const out = new Map<string, number>();
  if (!last) return out;
  for (const a of allocations) {
    if (a.round_id !== last.id || a.resulting_wealth == null) continue;
    out.set(
      a.player_id,
      Number(a.resulting_wealth) - (Number(a.risky_amount) + Number(a.safe_amount)),
    );
  }
  return out;
}

/* ── Finished: final standings, projector-sized ────────────────────────────── */
function PresentFinished({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const players = usePlayers(supabase, session.id);
  const history = useSessionHistory(supabase, session.id);
  // Mirrors the control screen's show/hide-bots toggle, like PresentActive.
  const [showBots] = useShowBots(session.id);
  const bust = useMemo(
    () => bustRoundByPlayer(history.rounds, history.allocations),
    [history.rounds, history.allocations],
  );
  const ranked = useMemo(
    () =>
      [...(showBots ? players : players.filter((p) => !p.is_bot))].sort((a, b) =>
        compareStandings(a, b, bust),
      ),
    [players, showBots, bust],
  );
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="flex flex-1 flex-col py-4">
      <div className="mb-8 text-center">
        <h2 className="flex animate-rise items-center justify-center gap-3 font-display text-5xl font-black uppercase tracking-tight text-ink">
          <Trophy className="text-ink" /> Final standings
        </h2>
        <p className="mt-1 font-editorial text-xl italic text-ink-muted">
          {session.config.num_rounds} {isManager(session.config) ? "years" : "rounds"} · game
          over
        </p>
      </div>

      {podium.length > 0 ? (
        <Podium players={podium} startingWealth={session.config.starting_wealth} />
      ) : null}

      {/* Below the podium, the rest of the field and (manager) the reveal on
          one tiled frame. */}
      {rest.length > 0 || isManager(session.config) ? (
        <PanelGrid className="mx-auto mt-8 w-full max-w-3xl">
          {rest.length > 0 ? (
            <Panel size="lg" title="The rest of the class" bodyClassName="px-3 pb-3 pt-2">
              <Leaderboard ranked={rest} rankOffset={3} />
            </Panel>
          ) : null}
          {/* The reveal belongs on the projector too — it is the moment the
              class finds out whether the fund they trusted ever had an edge. */}
          {isManager(session.config) ? (
            <ManagerReveal supabase={supabase} session={session} rounds={history.rounds} />
          ) : null}
        </PanelGrid>
      ) : null}
    </div>
  );
}

/**
 * The top three on blocks of 1st/2nd/3rd height, 2-1-3 order. The blocks rise
 * from the floor in reverse order — third, second, then the winner — each
 * balance rolling up from the starting wealth, and confetti for the winner.
 */
function Podium({ players, startingWealth }: { players: PlayerRow[]; startingWealth: number }) {
  // visual order: 2nd, 1st, 3rd
  const slots = [1, 0, 2].filter((i) => players[i]);
  const height = ["h-[34vh]", "h-[24vh]", "h-[17vh]"];
  const fill = ["bg-brand", "bg-surface", "bg-paper-2"];
  const delay = [0.9, 0.45, 0];
  return (
    <div className="mx-auto flex w-full max-w-4xl items-end justify-center gap-4">
      <Confetti count={90} />
      {slots.map((i) => {
        const p = players[i];
        return (
          <div
            key={p.id}
            className="flex w-1/3 max-w-[18rem] animate-rise-tall flex-col items-center"
            style={{ animationDelay: `${delay[i]}s` }}
          >
            <span className="mb-2 max-w-full truncate px-2 font-display text-[clamp(1.4rem,2.6vw,2.4rem)] font-black text-ink">
              {p.display_name}
            </span>
            <CountUp
              value={p.current_wealth}
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

/* ── Shared big leaderboard ─────────────────────────────────────────────────── */
function Leaderboard({
  ranked,
  lastDelta,
  rankOffset = 0,
  movement,
  colors,
}: {
  ranked: PlayerRow[];
  /** each player's change in the latest round; omit to show balances only */
  lastDelta?: Map<string, number>;
  /** places gained (+) or lost (−) last round — the timing tower's arrows */
  movement?: Map<string, number>;
  /** each player's line colour on the chart, shown as a key bar */
  colors?: Map<string, string> | null;
  /** the final screen lists places 4+ under the podium */
  rankOffset?: number;
}) {
  // >10 players: top 5 + bottom 3, with the middle behind an expander.
  if (ranked.length === 0) {
    return <p className="text-center font-editorial text-xl italic text-ink-subtle">No players yet.</p>;
  }

  return (
    <div>
      <CondensedList
        items={ranked}
        keyOf={(p) => p.id}
        moreNoun="players"
        className="divide-y-2 divide-ink/15 border-b-2 border-ink/15"
        gapClassName="font-editorial text-lg italic text-ink-muted hover:text-ink"
        toggleClassName="mt-3 font-editorial text-lg italic text-ink-muted hover:text-ink"
        renderItem={(p, i) => {
          const rank = i + 1 + rankOffset;
          const d = lastDelta?.get(p.id);
          return (
            <li
              style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
              className={`stagger flex animate-rise items-center justify-between gap-3 px-3 py-3 ${
                rank === 1 ? "bg-brand-soft" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-4">
                <span
                  className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 px-1 font-mono text-2xl font-bold ${
                    rank === 1
                      ? "border-ink bg-brand text-ink"
                      : rank <= 3
                        ? "border-transparent font-black text-ink"
                        : "border-transparent text-ink-muted"
                  }`}
                >
                  {rank}
                </span>
                {movement ? <TowerMove d={movement.get(p.id)} /> : null}
                {colors?.get(p.id) ? (
                  <span
                    aria-hidden="true"
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colors.get(p.id) }}
                  />
                ) : null}
                <span className="truncate font-display text-2xl font-extrabold text-ink sm:text-3xl">
                  {p.display_name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {d != null && Math.abs(d) >= 0.005 ? (
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-xl font-bold ${
                      d > 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {d > 0 ? <ArrowUp /> : <ArrowDown />}
                    {signedMoney(d)}
                  </span>
                ) : null}
                {/* Ink: a balance is not a gain. The chip says which way it moved. */}
                <CountUp
                  value={p.current_wealth}
                  format={money}
                  className="font-mono text-2xl font-bold text-ink sm:text-3xl"
                />
              </span>
            </li>
          );
        }}
      />
    </div>
  );
}

/** Places gained (▲) or lost (▼) last round, projector-sized; a dash for none. */
function TowerMove({ d }: { d: number | undefined }) {
  if (d == null || d === 0) {
    return <span className="w-10 shrink-0 text-center font-mono text-lg text-ink-subtle">–</span>;
  }
  const up = d > 0;
  return (
    <span
      className={`inline-flex w-10 shrink-0 items-center justify-center font-mono text-lg font-bold ${
        up ? "text-gain" : "text-loss"
      }`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(d)}`}
    >
      {up ? <ArrowUp /> : <ArrowDown />}
      {Math.abs(d)}
    </span>
  );
}
