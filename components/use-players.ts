"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow } from "@/lib/game/db";

/**
 * Live list of players in a session. Does an initial fetch, then keeps the list
 * in sync via Supabase Realtime (insert/update/delete). RLS decides which rows
 * the caller is allowed to see, so this is safe for both host and students.
 */
export function usePlayers(supabase: SupabaseClient, sessionId: string): PlayerRow[] {
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  useEffect(() => {
    let active = true;

    supabase
      .from("players")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true })
      .then(({ data }) => {
        if (active && data) setPlayers(data as PlayerRow[]);
      });

    const channel = supabase
      .channel(`players:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setPlayers((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((p) => p.id !== (payload.old as PlayerRow).id);
            }
            const row = payload.new as PlayerRow;
            const idx = prev.findIndex((p) => p.id === row.id);
            const next = idx === -1 ? [...prev, row] : prev.map((p) => (p.id === row.id ? row : p));
            return next.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  return players;
}
