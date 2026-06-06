"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundRow } from "@/lib/game/db";

/**
 * Live view of a single round (by session + round number). Tracks status
 * transitions (open → locked → revealed) and the revealed market outcome.
 * When the host advances the round, the parent passes a new roundNumber and
 * this refetches.
 */
export function useRound(
  supabase: SupabaseClient,
  sessionId: string,
  roundNumber: number,
): RoundRow | null {
  const [round, setRound] = useState<RoundRow | null>(null);

  useEffect(() => {
    if (!roundNumber || roundNumber < 1) {
      setRound(null);
      return;
    }
    let active = true;

    supabase
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setRound((data as RoundRow) ?? null);
      });

    const channel = supabase
      .channel(`round:${sessionId}:${roundNumber}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as RoundRow;
          if (row.round_number === roundNumber) setRound(row);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, roundNumber]);

  return round;
}
