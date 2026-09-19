"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow } from "@/lib/auth/account";
import { Card, InfoTip, Skeleton } from "@/components/ui";
import { money, ordinal } from "@/lib/game/format";
import { whenText } from "@/lib/game/session-format";
import { ArrowRight } from "@/components/icons";

const STATUS_TEXT: Record<string, string> = {
  lobby: "waiting to start",
  active: "in progress",
  finished: "finished",
};

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
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
          Your sessions
        </h2>
        <InfoTip label="About your sessions">
          Games you played as a student. Sessions you hosted are on the host dashboard.
        </InfoTip>
      </div>

      {rows === null ? (
        <div role="status" className="mt-5 space-y-2">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-ink-subtle">
          Nothing yet. Join a game with a code and it will show up here.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map((r) => (
            <li key={r.session_id}>
              {/* The whole row opens the game: its results once finished, the
                  live game (a rejoin) while it is still running. */}
              <Link
                href={`/play/${r.session_id}`}
                className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper-2 px-4 py-3 transition hover:bg-brand-soft"
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-ink">{r.display_name}</span>
                  <span className="font-mono text-xs text-ink-subtle">
                    {whenText(r.played_at)} · {STATUS_TEXT[r.status] ?? r.status}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono font-bold text-ink">{money(r.final_wealth)}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {ordinal(r.rank)} of {r.total}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 font-display text-xs font-extrabold text-ink-muted transition group-hover:text-ink">
                    {r.status === "finished" ? "Results" : "Rejoin"}
                    <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
