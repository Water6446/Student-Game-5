"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import type { MarketOutcome } from "@/lib/game/types";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useSessionHistory } from "@/components/use-session-history";
import { MarketOddsControl } from "@/components/host/MarketOddsControl";
import { AllocationsBreakdown } from "@/components/host/AllocationsBreakdown";
import { WealthChart } from "@/components/host/WealthChart";
import { SessionHistoryTable } from "@/components/host/SessionHistoryTable";
import { OutcomeChips } from "@/components/OutcomeChips";
import { playerOutcomesMap } from "@/lib/game/results";
import { money } from "@/lib/game/format";
import { Banner, Button, Card } from "@/components/ui";

export function HostRoundControl({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const router = useRouter();
  const players = usePlayers(supabase, session.id);
  const round = useRound(supabase, session.id, session.current_round);
  const allocs = useRoundAllocations(supabase, round?.id ?? null);
  const history = useSessionHistory(supabase, session.id);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<MarketOutcome | null>(null);

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
  const submittedIds = useMemo(() => new Set(allocs.map((a) => a.player_id)), [allocs]);
  // bots auto-play and never "submit", so they're excluded from the submission counter
  const humanPlayers = useMemo(() => players.filter((p) => !p.is_bot), [players]);
  const standings = useMemo(
    () => [...players].sort((a, b) => b.current_wealth - a.current_wealth),
    [players],
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
        p_market_override: isManual ? pick : null,
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
      });
    });
  const next = () =>
    run(async () => {
      const res = await supabase.rpc("next_round", { p_session_id: session.id });
      setPick(null);
      return res;
    });
  const finish = () => run(() => supabase.rpc("finish_session", { p_session_id: session.id }));

  const status = round?.status ?? "open";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/host" className="text-sm text-slate-500 hover:text-slate-300">
            ← Dashboard
          </Link>
          <h1 className="text-3xl font-bold">
            Round {session.current_round}{" "}
            <span className="text-slate-500">/ {session.config.num_rounds}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <button
            type="button"
            onClick={deleteSession}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Control panel */}
        <Card className="space-y-5">
          {status === "open" && (
            <>
              <div className="text-center">
                <div className="font-mono text-6xl font-black text-emerald-400">
                  {submittedIds.size}
                  <span className="text-slate-600"> / {humanPlayers.length}</span>
                </div>
                <div className="text-sm text-slate-400">submitted</div>
              </div>
              {isManual ? (
                <Button onClick={lock} disabled={busy} className="w-full text-lg">
                  Lock allocations
                </Button>
              ) : (
                <>
                  <Button onClick={lockAndReveal} disabled={busy} className="w-full text-lg">
                    Lock &amp; reveal
                  </Button>
                  <MarketOddsControl supabase={supabase} session={session} />
                </>
              )}
            </>
          )}

          {status === "locked" && (
            <>
              <div className="text-center text-sm font-semibold text-amber-300">
                Bets locked in 🔒 — review, then reveal
              </div>
              <AllocationsBreakdown
                players={players}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
              />
              {!isManual ? <MarketOddsControl supabase={supabase} session={session} /> : null}
              {isManual ? (
                <div className="space-y-3">
                  <p className="text-center text-sm text-slate-400">Set this round&apos;s market:</p>
                  <div className="flex gap-3">
                    <OutcomeButton label="GOOD ▲" active={pick === "good"} onClick={() => setPick("good")} good />
                    <OutcomeButton label="BAD ▼" active={pick === "bad"} onClick={() => setPick("bad")} />
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-400">
                  Auto market — the server will roll the outcome.
                </p>
              )}
              <Button
                onClick={reveal}
                disabled={busy || (isManual && !pick)}
                className="w-full text-lg"
              >
                Reveal results
              </Button>
            </>
          )}

          {status === "revealed" && (
            <>
              {session.config.market_scope === "independent" ? (
                <div className="rounded-xl bg-slate-800/60 p-4 text-center text-lg text-slate-200">
                  Independent outcomes were drawn per player.
                </div>
              ) : (
                <div
                  className={`rounded-xl p-4 text-center text-2xl font-black ${
                    round?.market_outcome === "good"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  Market was {round?.market_outcome === "good" ? "GOOD ▲" : "BAD ▼"}
                </div>
              )}
              {/* what everyone bet this round (still visible after the roll) */}
              <AllocationsBreakdown
                players={players}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
              />
              {isLastRound ? (
                <Button onClick={finish} disabled={busy} variant="danger" className="w-full text-lg">
                  Finish game
                </Button>
              ) : (
                <Button onClick={next} disabled={busy} className="w-full text-lg">
                  Next round →
                </Button>
              )}
            </>
          )}

          {error ? <Banner kind="error">{error}</Banner> : null}

          {/* per-player submission ticks while the round is open (humans only) */}
          {status === "open" && (
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {humanPlayers.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    submittedIds.has(p.id) ? "text-emerald-300" : "text-slate-500"
                  }`}
                >
                  <span>{submittedIds.has(p.id) ? "✓" : "•"}</span>
                  <span className="truncate">{p.display_name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Live standings — each player's last 5 markets shown inline */}
        <Card>
          <h2 className="mb-1 text-xl font-semibold">Standings</h2>
          <p className="mb-3 text-xs text-slate-500">Last 5 markets shown per player.</p>
          <ol className="space-y-1">
            {standings.map((p, i) => {
              const last5 = (outcomesByPlayer.get(p.id) ?? []).slice(-5);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/40 px-4 py-2"
                >
                  <span className="text-slate-200">
                    <span className="mr-2 font-mono text-slate-500">{i + 1}.</span>
                    {p.display_name}
                  </span>
                  <span className="flex items-center gap-3">
                    <OutcomeChips outcomes={last5} />
                    <span className="font-mono text-lg font-semibold text-emerald-300">
                      {money(p.current_wealth)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {/* Wealth over rounds */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Wealth over rounds</h2>
        <WealthChart
          players={players}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
        />
      </Card>

      {/* Per-round history */}
      <Card className="mt-6">
        <h2 className="mb-3 text-xl font-semibold">Round history</h2>
        <SessionHistoryTable rounds={history.rounds} allocations={history.allocations} />
      </Card>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-emerald-500/20 text-emerald-300",
    locked: "bg-amber-500/20 text-amber-300",
    revealed: "bg-sky-500/20 text-sky-300",
  };
  return (
    <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${styles[status] ?? ""}`}>
      {status}
    </span>
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
  const activeCls = good
    ? "border-emerald-400 bg-emerald-500/30 text-emerald-200"
    : "border-rose-400 bg-rose-500/30 text-rose-200";
  const idleCls = "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 py-4 text-lg font-bold transition ${
        active ? activeCls : idleCls
      }`}
    >
      {label}
    </button>
  );
}
