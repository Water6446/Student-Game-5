"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow } from "@/lib/auth/account";
import { ArrowRight } from "@/components/icons";

/**
 * Only games joined this recently count as "in progress". A host who never
 * pressed Finish leaves a session active forever, and a strip inviting a student
 * back into last month's class is noise, not help.
 */
const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * "You're in a game — rejoin", for a student who closed the tab or lost the
 * link mid-class. The student counterpart of the host's LiveSessionStrip.
 *
 * Works for guests as well as accounts: get_my_history() keys on auth.uid(),
 * and a guest's anonymous session survives in the browser that joined.
 * Renders nothing for anyone signed out or not in a live game, so pages can
 * mount it unconditionally.
 */
export function StudentResumeStrip({
  supabase,
  className,
}: {
  supabase: SupabaseClient;
  className?: string;
}) {
  const [games, setGames] = useState<HistoryRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      // getSession reads local storage: no network at all for someone signed out.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: rows } = await supabase.rpc("get_my_history");
      if (!active) return;
      const now = Date.now();
      setGames(
        ((rows as HistoryRow[] | null) ?? []).filter(
          (r) => r.status !== "finished" && now - new Date(r.played_at).getTime() < RECENT_MS,
        ),
      );
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  if (games.length === 0) return null;

  return (
    <section aria-label="Your game in progress" className={className}>
      <ul className="space-y-2">
        {games.slice(0, 3).map((g) => (
          <li
            key={g.session_id}
            className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-play bg-play-soft px-4 py-3 sm:px-5"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-play">
                <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-play" />
                {g.status === "lobby" ? "Waiting to start" : "Game in progress"}
              </span>
              <span className="mt-0.5 block truncate font-display text-lg font-extrabold text-ink">
                You&apos;re playing as {g.display_name}
              </span>
            </span>
            <Link
              href={`/play/${g.session_id}`}
              className="group inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border-2 border-ink bg-play px-5 font-display font-extrabold text-white shadow-card transition hover:brightness-110 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Rejoin
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                <ArrowRight />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
