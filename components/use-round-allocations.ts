"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow } from "@/lib/game/db";

/**
 * Live allocations for a round. RLS scopes what each caller sees: the host gets
 * every allocation in the round (for the submission counter), while a student
 * gets only their own row. Reused by both.
 */
export function useRoundAllocations(
  supabase: SupabaseClient,
  roundId: string | null,
): AllocationRow[] {
  const [allocs, setAllocs] = useState<AllocationRow[]>([]);

  useEffect(() => {
    if (!roundId) {
      setAllocs([]);
      return;
    }
    let active = true;

    supabase
      .from("allocations")
      .select("*")
      .eq("round_id", roundId)
      .then(({ data }) => {
        if (active) setAllocs((data as AllocationRow[]) ?? []);
      });

    const channel = supabase
      .channel(`allocs:${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "allocations", filter: `round_id=eq.${roundId}` },
        (payload) => {
          setAllocs((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== (payload.old as AllocationRow).id);
            }
            const row = payload.new as AllocationRow;
            const idx = prev.findIndex((a) => a.id === row.id);
            return idx === -1 ? [...prev, row] : prev.map((a) => (a.id === row.id ? row : a));
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, roundId]);

  return allocs;
}
