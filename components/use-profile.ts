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
 *
 * `loading` is derived from WHICH user the current answer belongs to, not kept
 * as a flag. As a flag it read false for one render whenever the user changed
 * (signed-out -> signed-in on page load, most visibly): the effect that would
 * set it back to true had not run yet, so /account briefly showed its "finish
 * your account" form to people who already had one.
 *
 * The last profile seen is cached, so the header does not start from nothing
 * every time it mounts. The site header is rendered per page, so every
 * navigation remounted it, refetched the profile, and showed the email address
 * while the username was on its way. In memory, the cache covers switching
 * pages; in sessionStorage, it covers a reload in the same tab. The fetch still
 * runs every time and replaces whatever was cached.
 */

const memory = new Map<string, ProfileRow>();
const STORAGE_PREFIX = "profile:";

/**
 * `useStorage` is false until the component has mounted. The server has no
 * sessionStorage, so reading it during hydration would render text the server
 * never sent (a hydration mismatch). The in-memory copy is safe at any time:
 * it is empty on a fresh page load, and a client-side navigation does not
 * hydrate.
 */
function readCache(userId: string, useStorage: boolean): ProfileRow | null {
  const hit = memory.get(userId);
  if (hit) return hit;
  if (!useStorage || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return null;
    const row = JSON.parse(raw) as ProfileRow;
    memory.set(userId, row);
    return row;
  } catch {
    return null;
  }
}

function writeCache(userId: string, profile: ProfileRow | null) {
  if (profile) memory.set(userId, profile);
  else memory.delete(userId);
  try {
    if (profile) window.sessionStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(profile));
    else window.sessionStorage.removeItem(STORAGE_PREFIX + userId);
  } catch {
    /* private mode / blocked storage: the in-memory copy still covers navigation */
  }
}

/**
 * Drop every cached profile. Called on sign-out, so a shared lecture-hall
 * machine never shows the previous person's name — not even in storage.
 */
export function forgetCachedProfiles() {
  memory.clear();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* nothing to clean */
  }
}

export function useProfile(supabase: SupabaseClient, userId: string | null) {
  const [state, setState] = useState<{ for: string | null; profile: ProfileRow | null }>({
    for: null,
    profile: null,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fetchFor = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      // A failed request says nothing about the profile, so it must not wipe
      // a good cached copy. undefined = "no answer".
      if (error) return undefined;
      return (data as ProfileRow | null) ?? null;
    },
    [supabase],
  );

  const reload = useCallback(async () => {
    if (!userId) {
      setState({ for: null, profile: null });
      return;
    }
    const profile = await fetchFor(userId);
    if (profile === undefined) return;
    writeCache(userId, profile);
    setState({ for: userId, profile });
  }, [fetchFor, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchFor(userId).then((profile) => {
      if (!active) return;
      if (profile === undefined) {
        // Keep the cached copy if there is one; otherwise settle on "none"
        // rather than loading forever.
        setState({ for: userId, profile: readCache(userId, true) });
        return;
      }
      writeCache(userId, profile);
      setState({ for: userId, profile });
    });
    return () => {
      active = false;
    };
  }, [fetchFor, userId]);

  if (userId !== null && state.for === userId) {
    return { profile: state.profile, loading: false, reload };
  }
  // Not fetched for this user yet: answer from the cache if we can, so a
  // remount or a reload shows the username straight away.
  const cached = userId ? readCache(userId, mounted) : null;
  return {
    profile: cached,
    loading: userId !== null && cached === null,
    reload,
  };
}
