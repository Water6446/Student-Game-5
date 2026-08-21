"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagerTruth } from "@/lib/game/types";

export interface ManagerTruthPayload {
  managers: ManagerTruth[];
  /** slot i received the alpha originally written for slot permutation[i] */
  permutation: number[];
}

/**
 * The true manager parameters, via the only route that can reach them: the
 * SECURITY DEFINER get_manager_truth(). The host may call it at any time;
 * students only once the session is finished. A refusal is expected, not an
 * error to surface — mid-game, "denied" is the correct answer.
 */
export function useManagerTruth(
  supabase: SupabaseClient,
  sessionId: string,
  enabled: boolean,
): { truth: ManagerTruthPayload | null; loading: boolean } {
  const [truth, setTruth] = useState<ManagerTruthPayload | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setTruth(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase.rpc("get_manager_truth", { p_session_id: sessionId }).then(({ data, error }) => {
      if (!active) return;
      setTruth(error || !data ? null : (data as ManagerTruthPayload));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase, sessionId, enabled]);

  return { truth, loading };
}
