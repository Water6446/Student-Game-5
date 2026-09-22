"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInRecently } from "@/lib/auth/reauth";

/**
 * Has this session been proven by a real sign-in in the last few minutes?
 * (lib/auth/reauth.ts has the why.) `recent` is null until the first check.
 *
 * `check()` re-reads the session and returns the answer — call it right before
 * a sensitive action, so a tab left open past the window asks again instead of
 * going ahead on a stale "yes".
 */
export function useRecentSignIn(supabase: SupabaseClient) {
  const [recent, setRecent] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const ok = signedInRecently(data.session?.access_token, Date.now() / 1000);
    setRecent(ok);
    return ok;
  }, [supabase]);

  useEffect(() => {
    void check();
    // Confirming (the password form, or back from Google) arrives as an auth
    // event. Read the token it carries: calling supabase from inside this
    // callback can deadlock the client.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setRecent(signedInRecently(session?.access_token, Date.now() / 1000));
    });
    // The window closes by itself; notice without waiting for a click.
    const timer = setInterval(() => void check(), 30_000);
    return () => {
      sub.subscription.unsubscribe();
      clearInterval(timer);
    };
  }, [supabase, check]);

  return { recent, check };
}
