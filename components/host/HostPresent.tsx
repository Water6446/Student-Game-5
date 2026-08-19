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
  playerDeltaChipsMap,
  playerOutcomesMap,
  submittedHumanCount,
} from "@/lib/game/results";
import { condenseRanked } from "@/lib/game/condense";
import { assetName } from "@/lib/game/portfolio";
import { isPortfolio, type MarketOutcome, type SessionConfig } from "@/lib/game/types";
import { money, signedPct } from "@/lib/game/format";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Coins, Users, Shuffle, Maximize, X, Trophy } from "@/components/icons";

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
    <main className="flex min-h-dvh flex-col px-[3vw] py-[2.5vh]">
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
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-brand text-ink">
          <Coins />
        </span>
        <span className="font-display text-2xl font-black uppercase tracking-tight">The Risk Game</span>
      </div>

      <div className="flex items-center gap-3">
        {session.status !== "finished" ? (
          <span className="hidden items-baseline gap-2 rounded-full border-2 border-ink bg-surface px-4 py-1.5 shadow-card sm:flex">
            <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-muted">
              join code
            </span>
            <span className="font-mono text-xl font-bold tracking-[0.25em] text-ink">
              {session.join_code}
            </span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleFs}
          aria-label={fs ? "Exit fullscreen" : "Go fullscreen"}
          title={fs ? "Exit fullscreen" : "Go fullscreen"}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-surface text-ink-muted shadow-card transition hover:text-ink"
        >
          <Maximize />
        </button>
        <Link
          href={`/host/${session.id}`}
          aria-label="Exit present mode"
          title="Exit present mode"
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-surface text-ink-muted shadow-card transition hover:text-ink"
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
    <div className="grid flex-1 items-center gap-8 py-4 lg:grid-cols-2">
      {/* Dark ink panel: giant game code + join caption */}
      <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-ink bg-ink p-10 text-center text-[#F6EFDD] shadow-lift">
        <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-[#F6EFDD]/70">
          Game code
        </p>
        <p className="font-mono text-7xl font-black tracking-[0.3em] text-[#F6EFDD] sm:text-8xl">
          {session.join_code}
        </p>
        <div className="mt-8 rounded-3xl border-2 border-ink bg-white p-6 shadow-card">
          <QRCodeSVG value={link} size={220} fgColor="#211A12" />
        </div>
        <p className="mt-6 break-all font-editorial text-2xl italic text-[#F6EFDD]/80">
          join from your phone — {link}
        </p>
      </div>

      {/* Live count */}
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
          In the room
        </p>
        <p className="flex items-center gap-4 font-mono text-[clamp(5rem,16vw,11rem)] font-black leading-none text-ink">
          {players.length}
        </p>
        <p className="flex items-center gap-3 text-3xl font-bold text-ink">
          <Users className="text-[0.8em] text-ink-muted" />
          {players.length === 1 ? "player" : "players"} in
        </p>
      </div>
    </div>
  );
}

/* ── Active: status panel + live leaderboard, with a reveal takeover ────────── */
function PresentActive({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const players = usePlayers(supabase, session.id);
  const loadedRound = useRound(supabase, session.id, session.current_round);
  // What to DISPLAY: gates a stale round row after "Next round" and swallows the
  // transient "locked" state of the one-click auto flow. See use-round-phase.ts.
  const { phase, round } = useRoundPhase(loadedRound, session.current_round);
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
  // basic: each player's market draws; portfolio: gained/lost chips per round
  const outcomesByPlayer = useMemo(
    () =>
      portfolio
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : playerOutcomesMap(session, players, history.rounds, history.allocations),
    [portfolio, session, players, history.rounds, history.allocations],
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
      const t = setTimeout(() => setRevealFor(null), 5000);
      return () => clearTimeout(t);
    }
  }, [round, phase]);

  return (
    <div className="grid flex-1 gap-6 py-4 lg:grid-cols-[1fr_1.1fr]">
      {/* Left column: status panel on top, wealth chart below */}
      <div className="flex min-h-0 flex-col gap-6">
        <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-ink bg-play-soft p-8 text-center shadow-card">
          <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
            Round {session.current_round} / {session.config.num_rounds}
          </p>

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
                {allocsLoading ? "—" : submitted}
                <span className="text-ink-muted">/{humanCount}</span>
              </div>
              <p className="mt-2 font-display text-2xl font-extrabold uppercase tracking-wide text-ink-muted">
                locked in
              </p>
            </>
          ) : phase === "locked" ? (
            <>
              <p className="mt-6 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
                Bets are locked
              </p>
              <p className="mt-4 animate-pulse-soft font-editorial text-2xl italic text-ink-muted">
                Revealing the market…
              </p>
            </>
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
        </section>

        <section className="rounded-3xl border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="mb-2 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
            Wealth over rounds
          </h2>
          <WealthChart
            players={visiblePlayers}
            rounds={history.rounds}
            allocations={history.allocations}
            startingWealth={session.config.starting_wealth}
            hideToggle={true}
          />
        </section>
      </div>

      {/* Leaderboard */}
      <section className="rounded-3xl border-2 border-ink bg-surface p-6 shadow-card sm:p-8">
        <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-black uppercase tracking-tight text-ink">
          <Trophy className="text-ink" /> Standings so far
        </h2>
        {classLuck ? (
          <p className="mb-4 font-editorial text-lg italic text-ink-muted">
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
        ) : (
          <div className="mb-4" />
        )}
        <Leaderboard ranked={ranked} outcomesByPlayer={outcomesByPlayer} />
      </section>

      {revealFor ? (
        <RevealTakeover
          shared={shared && !portfolio}
          good={round?.market_outcome === "good"}
          roundNumber={session.current_round}
          config={session.config}
          assetOutcomes={portfolio ? round?.market_outcomes ?? null : null}
          onDismiss={() => setRevealFor(null)}
        />
      ) : null}
    </div>
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
            className={`flex items-center justify-between rounded-xl border-2 border-ink px-4 py-2.5 text-white shadow-card ${
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

function RoundOutcomeBig({ good }: { good: boolean }) {
  return (
    <div
      className={`mt-6 flex flex-col items-center gap-3 rounded-2xl border-2 border-ink px-8 py-6 text-white shadow-card ${
        good ? "bg-gain" : "bg-loss"
      }`}
    >
      <span className="text-[clamp(3rem,9vw,7rem)] leading-none">
        {good ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="font-display text-4xl font-black uppercase tracking-tight sm:text-5xl">
        {good ? "Market up!" : "Market down!"}
      </span>
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
  onDismiss,
}: {
  shared: boolean;
  good: boolean;
  roundNumber: number;
  config: SessionConfig;
  /** portfolio, shared scope: the class-wide per-asset outcomes */
  assetOutcomes: MarketOutcome[] | null;
  onDismiss: () => void;
}) {
  // Portfolio with class-wide outcomes: a grid of asset results. All-good gets
  // the full green flood + confetti; all-bad the red; a mixed round stays ink.
  if (assetOutcomes && assetOutcomes.length > 0) {
    const allGood = assetOutcomes.every((o) => o === "good");
    const allBad = assetOutcomes.every((o) => o === "bad");
    const cls = allGood ? "bg-gain text-white" : allBad ? "bg-loss text-white" : "bg-ink text-paper";
    return (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss reveal"
        className={`animate-pop-in fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 px-6 ${cls}`}
      >
        {allGood ? <Confetti /> : null}
        <span className="font-display text-sm font-extrabold uppercase tracking-[0.3em] opacity-80">
          Round {roundNumber}
        </span>
        <span className="font-display text-[clamp(2rem,7vw,5rem)] font-black uppercase leading-none tracking-tight">
          {allGood ? "Everything up!" : allBad ? "Everything down!" : "The markets moved"}
        </span>
        <ul
          className={`grid w-full max-w-3xl gap-3 ${
            assetOutcomes.length > 4 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {assetOutcomes.map((o, i) => (
            <li
              key={i}
              className={`flex items-center justify-between rounded-2xl border-2 px-5 py-3 ${
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

  const neutral = !shared;
  const cls = neutral ? "bg-ink text-paper" : good ? "bg-gain text-white" : "bg-loss text-white";
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss reveal"
      className={`animate-pop-in fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 ${cls}`}
    >
      {!neutral && good ? <Confetti /> : null}
      <span className="font-display text-sm font-extrabold uppercase tracking-[0.3em] opacity-80">
        Round {roundNumber}
      </span>
      <span className="text-[clamp(5rem,22vw,16rem)] leading-none">
        {neutral ? <Shuffle /> : good ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="font-display text-[clamp(2.5rem,9vw,7rem)] font-black uppercase leading-none tracking-tight">
        {neutral ? "Results are in" : good ? "Market up!" : "Market down!"}
      </span>
      {!neutral ? (
        <span className="font-editorial text-2xl italic opacity-90">
          Risky bets {good ? "paid off" : "took a hit"}
        </span>
      ) : null}
    </button>
  );
}

/* ── Finished: final standings, projector-sized ────────────────────────────── */
function PresentFinished({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const players = usePlayers(supabase, session.id);
  const history = useSessionHistory(supabase, session.id);
  // Mirrors the control screen's show/hide-bots toggle, like PresentActive.
  const [showBots] = useShowBots(session.id);
  const outcomesByPlayer = useMemo(
    () =>
      isPortfolio(session.config)
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : playerOutcomesMap(session, players, history.rounds, history.allocations),
    [session, players, history.rounds, history.allocations],
  );
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

  return (
    <div className="flex flex-1 flex-col py-4">
      <div className="mb-6 text-center">
        <h2 className="flex items-center justify-center gap-3 font-display text-5xl font-black uppercase tracking-tight text-ink">
          <Trophy className="text-ink" /> Final standings
        </h2>
        <p className="mt-1 font-editorial text-xl italic text-ink-muted">
          {session.config.num_rounds} rounds · game over
        </p>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard ranked={ranked} outcomesByPlayer={outcomesByPlayer} />
      </div>
    </div>
  );
}

/* ── Shared big leaderboard ─────────────────────────────────────────────────── */
function Leaderboard({
  ranked,
  outcomesByPlayer,
}: {
  ranked: PlayerRow[];
  outcomesByPlayer: Map<string, ("good" | "bad")[]>;
}) {
  // >10 players: top 5 + bottom 3, with the middle behind an expander.
  const [showAll, setShowAll] = useState(false);
  const items = useMemo(
    () => (showAll ? condenseRanked(ranked, { threshold: Infinity }) : condenseRanked(ranked)),
    [ranked, showAll],
  );

  if (ranked.length === 0) {
    return <p className="text-center font-editorial text-xl italic text-ink-subtle">No players yet.</p>;
  }

  return (
    <div>
      <ol className="space-y-2">
        {items.map((c) => {
          if (c.kind === "gap") {
            return (
              <li key="gap" className="text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  aria-expanded={false}
                  className="font-editorial text-lg italic text-ink-subtle transition hover:text-ink"
                >
                  +{c.hidden} more players ▾
                </button>
              </li>
            );
          }
          const p = c.item;
          const i = c.index;
          const last = outcomesByPlayer.get(p.id)?.at(-1) ?? null;
          const top = i < 3;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border-2 border-ink px-5 py-3 shadow-card ${
                i === 0 ? "bg-brand-soft" : top ? "bg-surface" : "bg-paper-2"
              }`}
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className="w-9 shrink-0 text-center font-mono text-2xl font-bold text-ink-muted">
                  {i + 1}
                </span>
                <span className="truncate font-display text-2xl font-extrabold text-ink sm:text-3xl">
                  {p.display_name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {last === "good" ? (
                  <ArrowUp className="text-xl text-gain" />
                ) : last === "bad" ? (
                  <ArrowDown className="text-xl text-loss" />
                ) : null}
                <span
                  className={`font-mono text-2xl font-bold sm:text-3xl ${
                    last === "good" ? "text-gain" : last === "bad" ? "text-loss" : "text-ink"
                  }`}
                >
                  {money(p.current_wealth)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {showAll && ranked.length > 10 ? (
        <p className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="font-editorial text-lg italic text-ink-subtle transition hover:text-ink"
          >
            Show fewer ▴
          </button>
        </p>
      ) : null}
    </div>
  );
}
