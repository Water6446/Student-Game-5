"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/auth/account";

/**
 * The signed-in account's profile row, or null when there isn't one.
 *
 * null is a real, expected state, not just "still loading": a guest who joined
 * anonymously has no profile until they claim the account (0017), so callers
 * should treat null as "not an account yet" once loading is false.
 */
export function useProfile(supabase: SupabaseClient, userId: string | null) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as ProfileRow | null) ?? null);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      if (!userId) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (!active) return;
      setProfile((data as ProfileRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  return { profile, loading, reload };
}
