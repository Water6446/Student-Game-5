"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, WifiOff, X } from "@/components/icons";

type State = "ok" | "offline" | "reconnecting" | "restored";

/** A dropped socket re-joins within a second or two; don't flash for that. */
const GRACE_MS = 4000;

/**
 * "You're offline" / "Reconnecting…" for the live screens (host control,
 * projector, student play), which silently stop updating when classroom wifi
 * drops.
 *
 * It watches two things: the browser's own online flag, and — only once the
 * page has live channels — whether the Supabase realtime socket is connected.
 * The browser client is a singleton, so this reads the same socket the page's
 * hooks subscribe on.
 *
 * The realtime hooks do not replay what they missed while disconnected, so
 * coming back says so and offers a refresh rather than pretending all is well.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<State>("ok");

  useEffect(() => {
    const supabase = createClient();
    let badSince: number | null = null;
    let showing = false;

    function check() {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const live = supabase.getChannels().length > 0;
      const socketDown = live && !supabase.realtime.isConnected();
      if (offline || socketDown) {
        badSince ??= Date.now();
        if (offline || Date.now() - badSince > GRACE_MS) {
          showing = true;
          setState(offline ? "offline" : "reconnecting");
        }
      } else {
        badSince = null;
        if (showing) {
          showing = false;
          setState("restored");
        }
      }
    }

    const interval = setInterval(check, 1000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  if (state === "ok") return null;

  const restored = state === "restored";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-3 z-[65] flex justify-center px-4"
    >
      <div
        className={`flex max-w-md animate-pop-in items-center gap-3 rounded-full border-2 border-ink py-1.5 pl-4 pr-1.5 text-sm font-semibold shadow-card ${
          restored ? "bg-gain-soft text-ink" : "bg-brand-soft text-ink"
        }`}
      >
        {restored ? <Check className="shrink-0 text-gain" /> : <WifiOff className="shrink-0" />}
        <span>
          {state === "offline"
            ? "You're offline. Reconnecting…"
            : state === "reconnecting"
              ? "Live updates paused. Reconnecting…"
              : "Back online. Refresh to catch up."}
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[36px] rounded-full border-2 border-ink bg-surface px-3 font-display text-xs font-extrabold text-ink transition hover:bg-paper-2"
        >
          Refresh
        </button>
        {restored ? (
          <button
            type="button"
            onClick={() => setState("ok")}
            aria-label="Dismiss"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink"
          >
            <X />
          </button>
        ) : null}
      </div>
    </div>
  );
}
