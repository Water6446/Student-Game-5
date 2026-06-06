"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";

/** Loads a single session and keeps it live (status / current_round changes). */
export function useSession(supabase: SupabaseClient, sessionId: string) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setSession((data as SessionRow) ?? null);
        setLoading(false);
      });

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => setSession(payload.new as SessionRow),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  return { session, loading };
}
