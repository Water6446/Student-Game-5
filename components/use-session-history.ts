"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow, RoundRow } from "@/lib/game/db";

export interface SessionHistory {
  rounds: RoundRow[];
  allocations: AllocationRow[];
}

/**
 * Host-only: every round + every allocation in a session, for the wealth chart
 * and per-round history. RLS lets the host read all allocations in their own
 * session (is_host_of_round); a student would get only their own rows, so this
 * hook is intended for host screens. Re-fetches whenever a round changes status
 * (e.g. flips to 'revealed'), keeping the chart live without polling.
 */
export function useSessionHistory(supabase: SupabaseClient, sessionId: string): SessionHistory {
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const refetch = useCallback(async () => {
    const { data: roundData } = await supabase
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });
    const rs = (roundData as RoundRow[]) ?? [];
    setRounds(rs);

    const ids = rs.map((r) => r.id);
    if (ids.length === 0) {
      setAllocations([]);
      return;
    }
    const { data: allocData } = await supabase.from("allocations").select("*").in("round_id", ids);
    setAllocations((allocData as AllocationRow[]) ?? []);
  }, [supabase, sessionId]);

  useEffect(() => {
    let active = true;
    refetch();

    const channel = supabase
      .channel(`history:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `session_id=eq.${sessionId}` },
        () => {
          if (active) refetch();
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
