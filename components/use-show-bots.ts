"use client";

import { useSyncedPreference } from "@/components/use-synced-preference";

/**
 * Host preference for whether benchmark bots are shown in the standings / chart /
 * allocations. Persisted per session so it survives reloads AND syncs across
 * tabs — toggling it on the control screen updates the separate "present"
 * (projector) tab live.
 */
export function useShowBots(sessionId: string): [boolean, (v: boolean) => void] {
  return useSyncedPreference(`showBots:${sessionId}`, true);
}
