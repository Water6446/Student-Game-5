"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { buildPlayerResults, type PlayerResult } from "@/lib/game/results";
import { money, ordinal, signedMoney } from "@/lib/game/format";
import { Card } from "@/components/ui";

export function StudentFinished({
  supabase,
  session,
  me,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
}) {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);

  useEffect(() => {
    let active = true;

    supabase.rpc("get_my_rank", { p_session_id: session.id }).then(({ data }) => {
      if (!active || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRank({ rank: row.rank, total: row.total });
    });

    // Build my personal counterfactual from my own rounds + allocations (RLS lets
    // a student read rounds in their session and their OWN allocation rows).
    (async () => {
      const { data: roundData } = await supabase
        .from("rounds")
        .select("*")
        .eq("session_id", session.id)
        .order("round_number", { ascending: true });
      const rounds = (roundData as RoundRow[]) ?? [];
      const ids = rounds.map((r) => r.id);
      let allocs: AllocationRow[] = [];
      if (ids.length > 0) {
        const { data: allocData } = await supabase
          .from("allocations")
          .select("*")
          .in("round_id", ids);
        allocs = (allocData as AllocationRow[]) ?? [];
      }
      if (!active) return;
      const [res] = buildPlayerResults(session, [me], rounds, allocs);
      setResult(res ?? null);
    })();

    return () => {
      active = false;
    };
  }, [supabase, session, me]);

  const cf = result?.counterfactual;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-8">
      <Card className="text-center">
        <div className="text-5xl">🏁</div>
        <h1 className="mt-3 text-2xl font-semibold">Game over</h1>

        <div className="mt-6 rounded-xl bg-slate-800/60 p-5">
          <div className="text-sm text-slate-400">Final wealth</div>
          <div className="font-mono text-4xl font-black text-emerald-400">
            {money(me.current_wealth)}
          </div>
        </div>

        {rank ? (
          <div className="mt-4 text-lg">
            You finished <span className="font-bold text-indigo-300">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {cf ? (
          <div className="mt-6 text-left">
            <h2 className="mb-2 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
              How other strategies would have done
            </h2>
            <ul className="space-y-2">
              <CfRow
                label="All safe"
                desc="0% at risk each round"
                value={cf.all_safe}
                actual={me.current_wealth}
              />
              <CfRow
                label="50 / 50"
                desc="half at risk each round"
                value={cf.fifty_fifty}
                actual={me.current_wealth}
              />
              <CfRow
                label="All risky"
                desc="everything at risk each round"
                value={cf.all_risky}
                actual={me.current_wealth}
              />
            </ul>
            <p className="mt-3 text-center text-xs text-slate-500">
              Same market outcomes you faced — only your strategy changes.
            </p>
          </div>
        ) : null}

        <Link href="/" className="mt-8 inline-block text-sm text-slate-500 hover:text-slate-300">
          ← Home
        </Link>
      </Card>
    </main>
  );
}

function CfRow({
  label,
  desc,
  value,
  actual,
}: {
  label: string;
  desc: string;
  value: number;
  actual: number;
}) {
  const diff = actual - value;
  return (
    <li className="flex items-center justify-between rounded-lg bg-slate-800/40 px-4 py-2">
      <span className="flex flex-col">
        <span className="text-slate-300">{label}</span>
        <span className="text-xs text-slate-500">{desc}</span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-slate-200">{money(value)}</span>
        <span
          className={`font-mono text-xs ${
            diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-slate-500"
          }`}
          title="your actual result vs this strategy"
        >
          (you {signedMoney(diff)})
        </span>
      </span>
    </li>
  );
}
