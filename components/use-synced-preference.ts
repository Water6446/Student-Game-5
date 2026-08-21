"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A boolean preference persisted in localStorage and synced ACROSS TABS.
 *
 * The `storage` event fires only in *other* tabs, which is exactly what the host
 * needs: toggling something on the control screen updates the separate "present"
 * (projector) tab live. This is the cross-tab preference pattern for this
 * codebase — see DESIGN.md § 11.
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
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* ignore persistence failure */
      }
    },
    [key],
  );

  return [value, set];
}

/** Also accepts "true"/"false", so preferences stored before this hook survive. */
function isOn(stored: string): boolean {
  return stored === "1" || stored === "true";
}
