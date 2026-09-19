"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "./clsx";
import { Check, Info, X } from "./icons";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
}

type ToastFn = (message: ReactNode, opts?: { tone?: Tone }) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** How long a toast stays up. Errors linger: they usually need reading twice. */
const LIFETIME: Record<Tone, number> = { success: 3500, info: 4000, error: 6000 };

/**
 * One place for "that worked" feedback — "Saved", "Link copied", "Session
 * deleted". Mounted once in the root layout; call `useToast()` anywhere below.
 *
 * Toasts confirm an action the person just took. They are not for anything the
 * person must act on (use a Banner) or anything that needs a decision (use
 * `useConfirm`). The region is `aria-live="polite"`, so screen readers hear the
 * message without focus moving.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, opts) => {
    const id = nextId.current++;
    // Three at most: a burst of clicks should not stack a tower up the screen.
    setItems((list) => [...list.slice(-2), { id, message, tone: opts?.tone ?? "success" }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  // Hovering pauses the timer, so a toast being read does not vanish mid-sentence.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(item.id), LIFETIME[item.tone]);
    return () => clearTimeout(t);
  }, [paused, item.id, item.tone, onDismiss]);

  const iconCls = {
    success: "bg-gain text-white",
    error: "bg-loss text-white",
    info: "bg-play text-white",
  }[item.tone];

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-center gap-3 rounded-xl border-2 border-ink bg-surface py-2.5 pl-3 pr-2 text-sm font-semibold text-ink shadow-card"
    >
      <span
        aria-hidden="true"
        className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink", iconCls)}
      >
        {item.tone === "error" ? <X /> : item.tone === "info" ? <Info /> : <Check />}
      </span>
      <span className="min-w-0 flex-1">{item.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-paper-2 hover:text-ink"
      >
        <X />
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast("Saved")` or `toast("Couldn't save", { tone: "error" })`. */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider> (see app/layout.tsx)");
  return ctx;
}
