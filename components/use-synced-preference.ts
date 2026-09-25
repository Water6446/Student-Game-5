"use client";

import { useCallback, useEffect, useState } from "react";

/** Same-tab broadcast: the `storage` event never fires in the tab that wrote. */
const SAME_TAB = "synced-preference";

/**
 * A boolean preference persisted in localStorage and synced ACROSS TABS — and
 * across every component in this tab that reads the same key.
 *
 * The `storage` event fires only in *other* tabs, which is exactly what the host
 * needs: toggling something on the control screen updates the separate "present"
 * (projector) tab live. Within a tab, a setter also broadcasts a small window
 * event, so a settings menu and the ticker it controls agree without sharing
 * state. This is the cross-tab preference pattern for this codebase — see
 * DESIGN.md § 11.
 *
 * Starts at `defaultValue` and reads storage in an effect, so server and first
 * client render agree.
 */
export function useSyncedPreference(
  key: string,
  defaultValue: boolean,
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) setValue(isOn(stored));
    } catch {
      /* localStorage unavailable — keep the default */
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue != null) setValue(isOn(e.newValue));
    };
    const onSameTab = (e: Event) => {
      const { detail } = e as CustomEvent<{ key: string; value: boolean }>;
      if (detail?.key === key) setValue(detail.value);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SAME_TAB, onSameTab);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAME_TAB, onSameTab);
    };
  }, [key]);

  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
      window.dispatchEvent(new CustomEvent(SAME_TAB, { detail: { key, value: v } }));
    },
    [key],
  );

  return [value, set];
}

/** Also accepts "true"/"false", so preferences stored before this hook survive. */
function isOn(stored: string): boolean {
  return stored === "1" || stored === "true";
}
