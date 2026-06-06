"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { money, ordinal } from "@/lib/game/format";
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

  useEffect(() => {
    let active = true;
    supabase.rpc("get_my_rank", { p_session_id: session.id }).then(({ data }) => {
      if (!active || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRank({ rank: row.rank, total: row.total });
    });
    return () => {
      active = false;
    };
  }, [supabase, session.id]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
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

        <Link href="/" className="mt-8 inline-block text-sm text-slate-500 hover:text-slate-300">
          ← Home
        </Link>
      </Card>
    </main>
  );
}
