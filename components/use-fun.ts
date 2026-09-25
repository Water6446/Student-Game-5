"use client";

import { useSyncedPreference } from "@/components/use-synced-preference";

/**
 * The "Fun" settings: flourishes a host can switch on or off for this browser.
 * Kept per device (localStorage) and synced across tabs, so flipping one on
 * the control screen changes the projector tab too. None of them carries
 * information that isn't also on the screen without it.
 */
export const FUN_SETTINGS = {
  ticker: {
    key: "fun:ticker",
    // Off by default: a moving strip under the masthead competes with the
    // standings for the eye. Off, the tape stands still.
    defaultOn: false,
    label: "Scrolling ticker tape",
    hint: "The results strip scrolls like a news channel. Off, it stands still.",
  },
  flaps: {
    key: "fun:flaps",
    defaultOn: true,
    label: "Flip-board tiles",
    hint: "The join code and round counter flip in, tile by tile.",
  },
  confetti: {
    key: "fun:confetti",
    defaultOn: true,
    label: "Confetti",
    hint: "On a market that went up, and for the winners at the end.",
  },
} as const;

export type FunSetting = keyof typeof FUN_SETTINGS;

export function useFun(name: FunSetting): [boolean, (v: boolean) => void] {
  const s = FUN_SETTINGS[name];
  return useSyncedPreference(s.key, s.defaultOn);
}
