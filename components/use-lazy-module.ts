"use client";

import { useEffect, useState } from "react";

/**
 * A module fetched as its own chunk, and kept once it arrives.
 *
 * Used for the heavy parts of the game screens (the next game phase, the
 * charting library) so they stay off the first load. Two things next/dynamic
 * does not do, and a live classroom needs:
 *   - a module that has already arrived renders on the FIRST frame, so a
 *     change of game phase never flashes a placeholder between two screens;
 *   - a failed download (lecture-hall wifi) is retried, not thrown at the
 *     error page.
 */
export interface LazyModule<T> {
  /** Starts the download (once) and resolves with the module. */
  load: () => Promise<T>;
  /** The module if it has arrived, else null. */
  current: () => T | null;
}

export function lazyModule<T>(importer: () => Promise<T>): LazyModule<T> {
  let mod: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    load() {
      pending ??= importer().then(
        (m) => (mod = m),
        (e: unknown) => {
          // Don't cache the failure: the next load() tries again.
          pending = null;
          throw e;
        },
      );
      return pending;
    },
    current: () => mod,
  };
}

const RETRY_MS = 2000;

/**
 * The module, or null while it downloads (render a placeholder). The download
 * starts when the calling component mounts, so call this at the top of a page
 * to have a later phase's screen ready before the game reaches it.
 */
export function useLazyModule<T>(lazy: LazyModule<T>): T | null {
  const [arrived, setArrived] = useState<T | null>(lazy.current);
  // It may have landed through another component since this one last rendered.
  const mod = arrived ?? lazy.current();

  useEffect(() => {
    if (mod) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      lazy.load().then(
        (m) => {
          if (active) setArrived(() => m);
        },
        () => {
          if (active) retry = setTimeout(attempt, RETRY_MS);
        },
      );
    };
    attempt();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [lazy, mod]);

  return mod;
}
