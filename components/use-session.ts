"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { applyHiddenOdds, oddsHidden, type HiddenOdds } from "@/lib/game/hidden-odds";

/**
 * Loads a single session and keeps it live (status / current_round changes).
 *
 * Hidden odds are not in the row while the game runs (0029), so the host's copy
 * has them merged back in from get_hidden_odds. Only the host asks — for anyone
 * else the server would answer null anyway. Each live update is shown at once
 * with the odds already in hand (no flash of the 60% default), then the odds
 * are re-read in case the host just retuned them.
 */
export function useSession(supabase: SupabaseClient, sessionId: string) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let odds: HiddenOdds | null = null;
    let latest: SessionRow | null = null;

    const show = (row: SessionRow | null) => {
      latest = row;
      setSession(row && odds ? { ...row, config: applyHiddenOdds(row.config, odds) } : row);
    };

    const refreshOdds = async (row: SessionRow | null) => {
      if (!row || !oddsHidden(row.config, row.status)) {
        odds = null;
        return;
      }
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== row.host_id) {
        odds = null;
        return;
      }
      const { data } = await supabase.rpc("get_hidden_odds", { p_session_id: row.id });
      odds = (data as HiddenOdds | null) ?? null;
    };

    supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle()
      .then(async ({ data }) => {
        const row = (data as SessionRow) ?? null;
        await refreshOdds(row);
        if (!active) return;
        show(row);
        setLoading(false);
      });

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as SessionRow;
          show(row);
          void refreshOdds(row).then(() => {
            if (active && latest) show(latest);
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  return { session, loading };
}
