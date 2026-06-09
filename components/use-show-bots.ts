"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Host preference for whether benchmark bots are shown in the standings / chart /
 * allocations. Persisted in localStorage per session so it survives reloads AND
 * syncs across tabs — e.g. toggling it on the control screen updates the separate
 * "present" (projector) tab live via the `storage` event.
 */
export function useShowBots(sessionId: string): [boolean, (v: boolean) => void] {
  const key = `showBots:${sessionId}`;
  const [showBots, setState] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v != null) setState(v === "1");
    } catch {
      /* localStorage unavailable — fall back to the default (shown) */
    }
    // The storage event fires only in *other* tabs, so the present tab picks up
    // changes made on the control tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue != null) setState(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setShowBots = useCallback(
    (v: boolean) => {
      setState(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
    },
    [key],
  );

  return [showBots, setShowBots];
}
