"use client";

import { useEffect, useRef } from "react";

/** Keys whose default action already activates a focused control. */
const ACTIVATION_KEYS = new Set(["enter", "space"]);

/** True when the event target is somewhere a keystroke means text, not a command. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return (
    el.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
    ) != null
  );
}

/** True when the target is a control that Enter/Space already operate. */
function isActivationTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return el.closest("button, a[href], summary, [role='button'], [role='switch']") != null;
}

/**
 * Window-level keyboard shortcuts.
 *
 * `map` is keyed by the lower-cased `KeyboardEvent.key`, with the space bar
 * spelled `"space"` — so `{ space, enter, g, arrowleft }`. Only register a key
 * while its action is actually available: a registered key calls
 * preventDefault, and Space must still scroll the page when there is nothing to
 * fire.
 *
 * It deliberately does nothing when:
 *  - the user is typing (unless the key is in `allowWhileTyping` — Enter to
 *    submit an amount is the whole point of that escape hatch);
 *  - Meta/Ctrl/Alt is held, so browser and OS shortcuts are never shadowed;
 *  - Enter or Space arrives while a button, link or switch has focus, which
 *    would otherwise hijack the control the user deliberately tabbed to.
 */
export function useHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts?: { enabled?: boolean; allowWhileTyping?: string[] },
): void {
  const enabled = opts?.enabled ?? true;
  const allowWhileTyping = opts?.allowWhileTyping;

  // Latest-value refs so the listener is attached once, not on every render.
  const mapRef = useRef(map);
  const allowRef = useRef(allowWhileTyping);
  useEffect(() => {
    mapRef.current = map;
    allowRef.current = allowWhileTyping;
  });

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key === " " ? "space" : e.key.toLowerCase();
      const handler = mapRef.current[key];
      if (!handler) return;
      if (isTypingTarget(e.target) && !(allowRef.current ?? []).includes(key)) return;
      if (ACTIVATION_KEYS.has(key) && isActivationTarget(e.target)) return;
      // Only now that we know a handler will run — otherwise Space would stop
      // scrolling the page for nothing.
      e.preventDefault();
      handler(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
