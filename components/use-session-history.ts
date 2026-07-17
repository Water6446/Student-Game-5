"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow, RoundRow } from "@/lib/game/db";

export interface SessionHistory {
  rounds: RoundRow[];
  allocations: AllocationRow[];
}

/** PostgREST's max rows per response (supabase/config.toml `max_rows`, same
 * default on hosted projects) — the page size for paginated fetches. */
const PAGE_SIZE = 1000;

/**
 * Host-only: every round + every allocation in a session, for the wealth chart
 * and per-round history. RLS lets the host read all allocations in their own
 * session (is_host_of_round); a student would get only their own rows, so this
 * hook is intended for host screens. Re-fetches whenever a round flips to
 * 'revealed' (or is deleted), keeping the chart live without polling.
 */
export function useSessionHistory(supabase: SupabaseClient, sessionId: string): SessionHistory {
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const refetch = useCallback(async () => {
    // Rounds are capped at 200 per session (create_session), so one query is
    // always complete.
    const { data: roundData, error: roundErr } = await supabase
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });
    if (roundErr) return;
    const rs = (roundData as RoundRow[]) ?? [];

    const ids = rs.map((r) => r.id);
    if (ids.length === 0) {
      setRounds(rs);
      setAllocations([]);
      return;
    }

    // PostgREST silently caps every response at 1,000 rows (max_rows), and a
    // session's allocations are players × rounds — 40 players over 25 rounds
    // already hits the cap. Page through the full set; a single .select()
    // would silently truncate the history table, wealth chart and CSV export.
    const all: AllocationRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("allocations")
        .select("*")
        .in("round_id", ids)
        .order("id", { ascending: true }) // stable order so pages don't overlap
        .range(from, from + PAGE_SIZE - 1);
      if (error) return; // keep last-known-good data over a truncated set
      const page = (data as AllocationRow[]) ?? [];
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    setRounds(rs);
    setAllocations(all);
  }, [supabase, sessionId]);

  useEffect(() => {
    let active = true;
    refetch();

    const channel = supabase
      .channel(`history:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          // Every consumer renders only revealed data (revealedRounds, the
          // history table and wealth chart all filter status === "revealed"),
          // so skip the full refetch for open/locked transitions — two of
          // every three round events.
          if (!active) return;
          if (
            payload.eventType === "DELETE" ||
            (payload.new as RoundRow).status === "revealed"
          ) {
            refetch();
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, refetch]);

  return { rounds, allocations };
}
