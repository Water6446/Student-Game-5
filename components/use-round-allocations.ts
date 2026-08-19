"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow } from "@/lib/game/db";

/**
 * Live allocations for a round. RLS scopes what each caller sees: the host gets
 * every allocation in the round (for the submission counter), while a student
 * gets only their own row. Reused by both.
 *
 * The rows are cleared the instant `roundId` changes. Serving the previous
 * round's rows under the new round is what made the host's submission counter
 * briefly read "5 / 1": round N-1 is revealed, so it has a row for every player
 * (bots included), and that set outlived the round change. `loading` lets a
 * caller render "unknown" instead of a number it cannot trust yet.
 */
export function useRoundAllocations(
  supabase: SupabaseClient,
  roundId: string | null,
): { allocations: AllocationRow[]; loading: boolean } {
  const [allocations, setAllocs] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(roundId != null);

  useEffect(() => {
    setAllocs([]);
    if (!roundId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let active = true;

    supabase
      .from("allocations")
      .select("*")
      .eq("round_id", roundId)
      .then(({ data }) => {
        if (!active) return;
        // Merge rather than replace: a realtime row can land before this
        // initial fetch resolves, and it is the fresher of the two.
        const fetched = (data as AllocationRow[]) ?? [];
        setAllocs((prev) => {
          if (prev.length === 0) return fetched;
          const byId = new Map(fetched.map((a) => [a.id, a]));
          for (const a of prev) byId.set(a.id, a);
          return [...byId.values()];
        });
        setLoading(false);
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

  return { allocations, loading };
}
