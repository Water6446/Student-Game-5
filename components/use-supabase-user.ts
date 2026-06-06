"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Tracks the current auth user (null when signed out) and loading state. */
export function useSupabaseUser() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Seed the session and authorize the realtime socket with the current token.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
      // Ensure RLS-filtered postgres_changes are delivered: the realtime socket
      // must carry the user's JWT. Without this, a channel that subscribes
      // before the session hydrates can connect unauthenticated and silently
      // receive no events — which shows up as "live updates only after a manual
      // refresh" in production.
      supabase.realtime.setAuth(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      supabase.realtime.setAuth(session?.access_token ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { supabase, user, loading };
}

/** True for an anonymous (student) session. */
export function isAnonymous(user: User | null): boolean {
  return Boolean(user?.is_anonymous);
}
