"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { AllocationInput } from "@/components/student/AllocationInput";
import { money, signedMoney, ordinal } from "@/lib/game/format";
import { Banner, Button, Card } from "@/components/ui";

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
    const safe = Math.round((me.current_wealth - risky) * 100) / 100;
    const { error } = await supabase.from("allocations").upsert(
      {
        round_id: round.id,
        player_id: me.id,
        risky_amount: Math.round(risky * 100) / 100,
        safe_amount: safe,
      },
      { onConflict: "round_id,player_id" },
    );
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
          {busy ? "Saving…" : mine ? "Update allocation" : "Submit allocation"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))} risky — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center text-sm text-slate-500">
            Choose how much to put at risk, then submit.
          </p>
        )}
      </Shell>
    );
  }

  if (round.status === "locked") {
    return (
      <Shell wealth={me.current_wealth} round={round} session={session}>
        <div className="rounded-xl bg-slate-800/60 p-5 text-center">
          <div className="text-lg font-semibold text-amber-300">Allocations locked 🔒</div>
          <p className="mt-1 text-sm text-slate-400">Waiting for the reveal…</p>
          {mine ? (
            <p className="mt-3 font-mono text-slate-300">
              You risked {money(Number(mine.risky_amount))} · safe{" "}
              {money(Number(mine.safe_amount))}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
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
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
        <span>
          Round {round.round_number} / {session.config.num_rounds}
        </span>
        <span className="font-mono text-lg font-bold text-emerald-400">{money(wealth)}</span>
      </div>
      <Card className="space-y-5">{children}</Card>
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-4 text-center text-sm text-slate-400">
        Round {round.round_number} / {session.config.num_rounds}
      </div>
      <Card className="space-y-5 text-center">
        <div
          className={`mx-auto w-fit rounded-full px-6 py-2 text-2xl font-black ${
            good ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {good ? "GOOD market ▲" : "BAD market ▼"}
        </div>

        <div>
          <div className="text-sm text-slate-400">New wealth</div>
          <div className="font-mono text-5xl font-black text-white">{money(resulting)}</div>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400"
            }`}
          >
            {signedMoney(delta)} this round
          </div>
        </div>

        {rank ? (
          <div className="rounded-xl bg-slate-800/60 py-3 text-lg">
            You&apos;re <span className="font-bold text-indigo-300">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {board ? (
          <ol className="space-y-1 text-left">
            {board.map((r) => (
              <li
                key={r.player_id}
                className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${
                  r.is_me ? "bg-indigo-500/20 text-indigo-100" : "bg-slate-800/40 text-slate-300"
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

        <p className="animate-pulse text-sm text-slate-500">Waiting for the next round…</p>
      </Card>
    </main>
  );
}
