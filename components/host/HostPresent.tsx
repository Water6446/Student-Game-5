"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useSessionHistory } from "@/components/use-session-history";
import { useShowBots } from "@/components/use-show-bots";
import { WealthChart } from "@/components/host/WealthChart";
import { playerOutcomesMap } from "@/lib/game/results";
import { money } from "@/lib/game/format";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Coins, Users, Shuffle, Maximize, X, Trophy } from "@/components/icons";

const MEDALS = ["🥇", "🥈", "🥉"];

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
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
          <Coins />
        </span>
        <span className="font-display text-2xl font-black tracking-tight">The Risk Game</span>
      </div>

      <div className="flex items-center gap-3">
        {session.status !== "finished" ? (
          <span className="hidden items-baseline gap-2 rounded-full border border-line bg-surface px-4 py-1.5 shadow-card sm:flex">
            <span className="text-sm text-ink-muted">join code</span>
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
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-muted shadow-card transition hover:text-ink"
        >
          <Maximize />
        </button>
        <Link
          href={`/host/${session.id}`}
          aria-label="Exit present mode"
          title="Exit present mode"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-muted shadow-card transition hover:text-ink"
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
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div>
        <p className="text-2xl text-ink-muted">Join the game at</p>
        <p className="mt-1 break-all font-mono text-3xl font-bold text-brand-strong sm:text-4xl">
          {link}
        </p>
      </div>
      <div className="rounded-3xl border border-line bg-white p-6 shadow-lift">
        <QRCodeSVG value={link} size={260} fgColor="#1C1917" />
      </div>
      <div>
        <p className="text-2xl text-ink-muted">or enter code</p>
        <p className="font-mono text-7xl font-black tracking-[0.3em] text-ink sm:text-8xl">
          {session.join_code}
        </p>
      </div>
      <p className="flex items-center gap-3 text-3xl font-bold text-ink">
        <Users className="text-[0.8em] text-ink-subtle" />
        {players.length} {players.length === 1 ? "player" : "players"} in
      </p>
    </div>
  );
}

/* ── Active: status panel + live leaderboard, with a reveal takeover ────────── */
function PresentActive({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const players = usePlayers(supabase, session.id);
  const round = useRound(supabase, session.id, session.current_round);
  const history = useSessionHistory(supabase, session.id);
  // Live allocations for the current round so the "submitted" counter updates the
  // instant a student locks in (history only refetches on round status changes).
  const allocs = useRoundAllocations(supabase, round?.id ?? null);
  // Mirrors the control screen's show/hide-bots toggle across tabs.
  const [showBots] = useShowBots(session.id);

  const humanIds = useMemo(
    () => new Set(players.filter((p) => !p.is_bot).map((p) => p.id)),
    [players],
  );
  const humanCount = humanIds.size;
  const submitted = useMemo(
    () => new Set(allocs.filter((a) => humanIds.has(a.player_id)).map((a) => a.player_id)).size,
    [allocs, humanIds],
  );

  const visiblePlayers = useMemo(
    () => (showBots ? players : players.filter((p) => !p.is_bot)),
    [players, showBots],
  );

  const outcomesByPlayer = useMemo(
    () => playerOutcomesMap(session, players, history.rounds, history.allocations),
    [session, players, history.rounds, history.allocations],
  );

  const ranked = useMemo(
    () => [...visiblePlayers].sort((a, b) => b.current_wealth - a.current_wealth),
    [visiblePlayers],
  );

  const status = round?.status ?? "open";
  const shared = session.config.market_scope === "shared";

  // Reveal takeover: fire once per round when it flips to "revealed".
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!round) return;
    if (round.status === "revealed" && shownRef.current !== round.id) {
      shownRef.current = round.id;
      setRevealFor(round.id);
      const t = setTimeout(() => setRevealFor(null), 5000);
      return () => clearTimeout(t);
    }
  }, [round]);

  return (
    <div className="grid flex-1 gap-6 py-4 lg:grid-cols-[1fr_1.1fr]">
      {/* Left column: status panel on top, wealth chart below */}
      <div className="flex min-h-0 flex-col gap-6">
        <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="text-xl font-semibold uppercase tracking-[0.2em] text-ink-subtle">
            Round {session.current_round} / {session.config.num_rounds}
          </p>

          {status === "open" ? (
            <>
              <p className="mt-6 font-display text-4xl font-black text-ink sm:text-5xl">
                Place your bets
              </p>
              <div className="mt-8 font-mono text-[clamp(4rem,12vw,9rem)] font-black leading-none text-gain">
                {submitted}
                <span className="text-line-strong">/{humanCount}</span>
              </div>
              <p className="mt-2 text-2xl text-ink-muted">locked in</p>
            </>
          ) : status === "locked" ? (
            <>
              <p className="mt-6 font-display text-4xl font-black text-brand-strong sm:text-5xl">
                Bets are locked
              </p>
              <p className="mt-4 animate-pulse-soft text-2xl text-ink-muted">
                Revealing the market…
              </p>
            </>
          ) : shared ? (
            <RoundOutcomeBig good={round?.market_outcome === "good"} />
          ) : (
            <>
              <Shuffle className="mt-6 text-5xl text-ink-subtle" />
              <p className="mt-4 font-display text-4xl font-black text-ink sm:text-5xl">
                Results are in
              </p>
              <p className="mt-2 text-2xl text-ink-muted">Each player drew their own market.</p>
            </>
          )}
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-2 text-lg font-bold text-ink">Wealth over rounds</h2>
          <WealthChart
            players={visiblePlayers}
            rounds={history.rounds}
            allocations={history.allocations}
            startingWealth={session.config.starting_wealth}
          />
        </section>
      </div>

      {/* Leaderboard */}
      <section className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-black text-ink">
          <Trophy className="text-brand" /> Leaderboard
        </h2>
        <Leaderboard ranked={ranked} outcomesByPlayer={outcomesByPlayer} />
      </section>

      {revealFor ? (
        <RevealTakeover
          shared={shared}
          good={round?.market_outcome === "good"}
          roundNumber={session.current_round}
          onDismiss={() => setRevealFor(null)}
        />
      ) : null}
    </div>
  );
}

function RoundOutcomeBig({ good }: { good: boolean }) {
  return (
    <div
      className={`mt-6 flex flex-col items-center gap-3 rounded-2xl px-8 py-6 ${
        good ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"
      }`}
    >
      <span className="text-[clamp(3rem,9vw,7rem)] leading-none">
        {good ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="font-display text-4xl font-black sm:text-5xl">
        {good ? "GOOD market" : "BAD market"}
      </span>
    </div>
  );
}

/* Full-screen reveal "moment" that briefly takes over, then settles. */
function RevealTakeover({
  shared,
  good,
  roundNumber,
  onDismiss,
}: {
  shared: boolean;
  good: boolean;
  roundNumber: number;
  onDismiss: () => void;
}) {
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
      <span className="text-sm font-bold uppercase tracking-[0.3em] opacity-80">
        Round {roundNumber}
      </span>
      <span className="text-[clamp(5rem,22vw,16rem)] leading-none">
        {neutral ? <Shuffle /> : good ? <ArrowUp /> : <ArrowDown />}
      </span>
      <span className="font-display text-[clamp(2.5rem,9vw,7rem)] font-black leading-none">
        {neutral ? "Results are in" : good ? "GOOD market" : "BAD market"}
      </span>
      {!neutral ? (
        <span className="text-2xl font-semibold opacity-90">
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
  const outcomesByPlayer = useMemo(
    () => playerOutcomesMap(session, players, history.rounds, history.allocations),
    [session, players, history.rounds, history.allocations],
  );
  const ranked = useMemo(
    () => [...players].sort((a, b) => b.current_wealth - a.current_wealth),
    [players],
  );

  return (
    <div className="flex flex-1 flex-col py-4">
      <div className="mb-6 text-center">
        <h2 className="flex items-center justify-center gap-3 font-display text-5xl font-black text-ink">
          <Trophy className="text-brand" /> Final standings
        </h2>
        <p className="mt-1 text-xl text-ink-muted">{session.config.num_rounds} rounds · game over</p>
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
  const CAP = 12;
  const shown = ranked.slice(0, CAP);
  const extra = ranked.length - shown.length;

  if (ranked.length === 0) {
    return <p className="text-center text-xl text-ink-subtle">No players yet.</p>;
  }

  return (
    <div>
      <ol className="space-y-2">
        {shown.map((p, i) => {
          const last = outcomesByPlayer.get(p.id)?.at(-1) ?? null;
          const top = i < 3;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-5 py-3 ${
                i === 0
                  ? "border-brand/40 bg-brand-soft"
                  : top
                    ? "border-line-strong bg-paper-2"
                    : "border-line bg-paper"
              }`}
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className="w-9 shrink-0 text-center font-mono text-2xl font-bold text-ink-subtle">
                  {top ? <span className="text-3xl">{MEDALS[i]}</span> : i + 1}
                </span>
                <span className="truncate text-2xl font-semibold text-ink sm:text-3xl">
                  {p.display_name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {last === "good" ? (
                  <ArrowUp className="text-xl text-gain" />
                ) : last === "bad" ? (
                  <ArrowDown className="text-xl text-loss" />
                ) : null}
                <span className="font-mono text-2xl font-bold text-ink sm:text-3xl">
                  {money(p.current_wealth)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {extra > 0 ? (
        <p className="mt-3 text-center text-lg text-ink-subtle">+{extra} more players</p>
      ) : null}
    </div>
  );
}
