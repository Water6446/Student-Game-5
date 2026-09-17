"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow } from "@/lib/auth/account";
import { Card } from "@/components/ui";
import { money, ordinal } from "@/lib/game/format";

/**
 * Every session this account has played — the actual payoff for claiming an
 * account, so it is worth showing even when empty.
 *
 * get_my_history() is SECURITY DEFINER and filters on auth.uid(), so it reaches
 * sessions the caller is no longer a readable member of without widening RLS.
 */
export function HistoryPanel({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc("get_my_history").then(({ data }) => {
      if (active) setRows((data as HistoryRow[]) ?? []);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <Card>
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
        Your sessions
      </h2>
      <p className="mt-1 font-editorial text-sm italic text-ink-muted">
        Games you played as a student. Sessions you hosted are on the host dashboard.
      </p>

      {rows === null ? (
        <p className="mt-5 text-sm text-ink-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-ink-subtle">
          Nothing yet. Join a game with a code and it will show up here.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map((r) => (
            <li
              key={r.session_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper-2 px-4 py-3"
            >
              <span className="flex flex-col">
                <span className="font-semibold text-ink">{r.display_name}</span>
                <span className="font-mono text-xs text-ink-subtle">
                  {new Date(r.played_at).toLocaleDateString()} ·{" "}
                  {r.status === "finished" ? "finished" : r.status}
                </span>
              </span>
              <span className="flex items-baseline gap-3">
                <span className="font-mono font-bold text-ink">{money(r.final_wealth)}</span>
                <span className="font-mono text-xs text-ink-muted">
                  {ordinal(r.rank)} of {r.total}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
