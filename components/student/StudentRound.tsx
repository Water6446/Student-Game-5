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

  const [risky, setRisky] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each new round opens blank — never pre-filled and never carrying over the
  // previous round's choice. Students must deliberately enter an amount every
  // round (even to repeat the same number), so the field stays empty until they do.
  useEffect(() => {
    setRisky(null);
    setError(null);
  }, [round.id]);

  async function submit() {
    if (risky === null) return;
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
        <Button variant="gold" onClick={submit} disabled={busy || risky === null} className="w-full text-lg shadow-pop">
          {busy ? "Saving…" : mine ? "Update allocation 🔒" : "Lock in my bet 🔒"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))} risky — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center font-editorial text-sm italic text-ink-subtle">
            Choose how much to put at risk, then lock it in.
          </p>
        )}
      </Shell>
    );
  }

  if (round.status === "locked") {
    return (
      <Shell wealth={me.current_wealth} round={round} session={session}>
        <div className="rounded-xl border-2 border-ink bg-brand-soft p-5 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
            <Lock /> Nice. Now we wait.
          </div>
          <p className="mt-1 font-editorial text-sm italic text-ink-muted">Waiting for the reveal…</p>
          {mine ? (
            <p className="mt-3 font-mono text-ink">
              You risked {money(Number(mine.risky_amount))} · safe{" "}
              {money(Number(mine.safe_amount))}
            </p>
          ) : (
            <p className="mt-3 font-editorial text-sm italic text-ink-subtle">
              You didn&apos;t submit — you&apos;ll default to all-safe.
            </p>
          )}
          <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-3 w-3 animate-pulse-soft rounded-full border-2 border-ink bg-brand"
                style={{ animationDelay: `${i * 0.25}s` }}
              />
            ))}
          </div>
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
        <span className="rounded-full border-2 border-ink bg-ink px-3 py-1 font-mono text-sm font-bold uppercase text-paper">
          Round {round.round_number} / {session.config.num_rounds}
        </span>
        <span className="text-right">
          <span className="block font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            Your wealth
          </span>
          <span className="font-mono text-xl font-bold text-ink">{money(wealth)}</span>
        </span>
      </div>
      {showOdds ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-ink bg-surface px-4 py-2 text-sm shadow-card">
          <span className="font-editorial italic text-ink-muted">The market looks like</span>
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
          className={`-mx-6 -mt-6 mb-1 flex items-center justify-center gap-2 border-b-2 border-ink px-6 py-4 font-display text-3xl font-black uppercase tracking-tight text-white ${
            good ? "bg-gain" : "bg-loss"
          }`}
        >
          {good ? <ArrowUp /> : <ArrowDown />}
          {good ? "Good! ▲" : "Down ▼"}
        </div>

        <div>
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            New wealth
          </div>
          <div className="animate-count-pop font-mono text-5xl font-black text-ink">
            {money(resulting)}
          </div>
          <div
            className={`mt-2 inline-block rounded-full border-2 border-ink px-3 py-0.5 font-mono text-lg font-bold text-white ${
              delta > 0 ? "bg-gain" : delta < 0 ? "bg-loss" : "bg-ink-subtle"
            }`}
          >
            {signedMoney(delta)} this round
          </div>
        </div>

        {rank ? (
          <div className="rounded-xl border-2 border-ink bg-brand-soft py-3 text-lg font-semibold text-ink shadow-card">
            🏆 You&apos;re <span className="font-display font-black">{ordinal(rank.rank)}</span> of{" "}
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
