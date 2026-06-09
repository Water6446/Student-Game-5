"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { AllocationInput } from "@/components/student/AllocationInput";
import { money, signedMoney, ordinal } from "@/lib/game/format";
import { Banner, Button, Card } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Lock, Check } from "@/components/icons";

export function StudentRound({
  supabase,
  session,
  me,
  round,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
}) {
  const myAllocs = useRoundAllocations(supabase, round.id);
  const mine = myAllocs.find((a) => a.player_id === me.id) ?? null;

  const [risky, setRisky] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the slider when a new round opens; pre-fill with any saved allocation.
  useEffect(() => {
    setRisky(mine ? Number(mine.risky_amount) : 0);
    setError(null);
    // depend on round id + whether a saved alloc exists, not on every alloc change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id]);

  async function submit() {
    setBusy(true);
    setError(null);
    // All writes go through a SECURITY DEFINER RPC. The server validates the
    // round is open, that this is our own player, clamps 0 <= risky <= wealth,
    // and derives safe = wealth - risky. Students have no direct write grant.
    const { error } = await supabase.rpc("submit_allocation", {
      p_round_id: round.id,
      p_risky_amount: Math.round(risky * 100) / 100,
    });
    setBusy(false);
    if (error) setError(error.message);
  }

  if (round.status === "open") {
    return (
      <Shell wealth={me.current_wealth} round={round} session={session}>
        <AllocationInput
          wealth={me.current_wealth}
          risky={risky}
          onChange={setRisky}
          disabled={busy}
        />
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button onClick={submit} disabled={busy} className="w-full text-lg">
          {busy ? "Saving…" : mine ? "Update allocation" : "Lock in my bet"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))} risky — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center text-sm text-ink-subtle">
            Choose how much to put at risk, then submit.
          </p>
        )}
      </Shell>
    );
  }

  if (round.status === "locked") {
    return (
      <Shell wealth={me.current_wealth} round={round} session={session}>
        <div className="rounded-xl border border-brand/20 bg-brand-soft/60 p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-lg font-bold text-brand-strong">
            <Lock /> Allocations locked
          </div>
          <p className="mt-1 text-sm text-ink-muted">Waiting for the reveal…</p>
          {mine ? (
            <p className="mt-3 font-mono text-ink">
              You risked {money(Number(mine.risky_amount))} · safe{" "}
              {money(Number(mine.safe_amount))}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink-subtle">
              You didn&apos;t submit — you&apos;ll default to all-safe.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // revealed
  return <Reveal supabase={supabase} session={session} me={me} round={round} mine={mine} />;
}

function Shell({
  children,
  wealth,
  round,
  session,
}: {
  children: React.ReactNode;
  wealth: number;
  round: RoundRow;
  session: SessionRow;
}) {
  const showOdds =
    session.config.show_odds_to_students && session.config.market_mode === "auto";
  const goodPct = Math.round((session.config.good_prob ?? 0.6) * 100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-paper-2 px-3 py-1 text-sm font-semibold text-ink-muted">
          Round {round.round_number} / {session.config.num_rounds}
        </span>
        <span className="font-mono text-xl font-bold text-gain">{money(wealth)}</span>
      </div>
      {showOdds ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2 text-sm shadow-card">
          <span className="text-ink-muted">This round&apos;s market odds</span>
          <span className="flex items-center gap-2 font-mono font-semibold">
            <span className="inline-flex items-center gap-0.5 text-gain">
              <ArrowUp /> {goodPct}%
            </span>
            <span className="text-line-strong">·</span>
            <span className="inline-flex items-center gap-0.5 text-loss">
              <ArrowDown /> {100 - goodPct}%
            </span>
          </span>
        </div>
      ) : null}
      <Card className="animate-pop-in space-y-5">{children}</Card>
    </main>
  );
}

function Reveal({
  supabase,
  session,
  me,
  round,
  mine,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
  mine: ReturnType<typeof useRoundAllocations>[number] | null;
}) {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);

  // per-player outcome (independent scope) falls back to the shared round outcome
  const outcome = mine?.market_outcome ?? round.market_outcome;
  const resulting = mine?.resulting_wealth != null ? Number(mine.resulting_wealth) : me.current_wealth;
  const before = mine ? Number(mine.safe_amount) + Number(mine.risky_amount) : me.current_wealth;
  const delta = resulting - before;

  useEffect(() => {
    let active = true;
    supabase.rpc("get_my_rank", { p_session_id: session.id }).then(({ data }) => {
      if (!active || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRank({ rank: row.rank, total: row.total });
    });
    if (session.config.show_full_leaderboard_to_students) {
      supabase.rpc("get_leaderboard", { p_session_id: session.id }).then(({ data }) => {
        if (active && data) setBoard(data as LeaderboardRow[]);
      });
    }
    return () => {
      active = false;
    };
  }, [supabase, session.id, session.config.show_full_leaderboard_to_students, round.id]);

  const good = outcome === "good";
  // Celebrate a personal win (gained money this round).
  const celebrate = delta > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      {celebrate ? <Confetti /> : null}
      <div className="mb-4 text-center text-sm font-semibold text-ink-muted">
        Round {round.round_number} / {session.config.num_rounds}
      </div>
      <Card className={`space-y-5 text-center ${good ? "animate-pop-in" : "animate-shake"}`}>
        <div
          className={`mx-auto flex w-fit items-center gap-2 rounded-full px-6 py-2 text-2xl font-black ${
            good ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss"
          }`}
        >
          {good ? <ArrowUp /> : <ArrowDown />}
          {good ? "GOOD market" : "BAD market"}
        </div>

        <div>
          <div className="text-sm text-ink-muted">New wealth</div>
          <div className="animate-count-pop font-mono text-5xl font-black text-ink">
            {money(resulting)}
          </div>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-ink-subtle"
            }`}
          >
            {signedMoney(delta)} this round
          </div>
        </div>

        {rank ? (
          <div className="rounded-xl bg-play-soft py-3 text-lg text-ink">
            You&apos;re <span className="font-bold text-play">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {board ? (
          <ol className="space-y-1 text-left">
            {board.map((r) => (
              <li
                key={r.player_id}
                className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${
                  r.is_me
                    ? "bg-play-soft font-semibold text-ink ring-1 ring-play/30"
                    : "bg-paper-2 text-ink-muted"
                }`}
              >
                <span>
                  {r.rank}. {r.display_name}
                  {r.is_me ? " (you)" : ""}
                </span>
                <span className="font-mono">{money(Number(r.current_wealth))}</span>
              </li>
            ))}
          </ol>
        ) : null}

        <p className="flex items-center justify-center gap-2 text-sm text-ink-subtle">
          <Check className="text-gain" /> Waiting for the next round…
        </p>
      </Card>
    </main>
  );
}
