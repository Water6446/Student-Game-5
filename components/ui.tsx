"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "./clsx";
import { Info } from "./icons";

// React 18 warns when useLayoutEffect runs during SSR; the tip never opens on
// the server anyway, so the server gets the no-op flavour.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-ink bg-surface p-6 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "success" | "danger";
}) {
  const variants = {
    primary: "bg-play text-white shadow-card hover:brightness-110", // electric blue
    gold: "bg-brand text-ink shadow-card hover:bg-brand-strong", // amber, INK text
    secondary: "bg-surface text-ink shadow-card hover:bg-paper-2",
    success: "bg-gain text-white shadow-card hover:brightness-110",
    danger: "bg-loss text-white shadow-card hover:brightness-110",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink px-5 py-3 text-base",
        "font-display font-extrabold transition active:translate-x-[2px] active:translate-y-[2px]",
        "active:shadow-none disabled:cursor-not-allowed disabled:opacity-60",
        "disabled:active:translate-x-0 disabled:active:translate-y-0",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  info,
  error,
  children,
}: {
  label: string;
  /** Always-visible advice. Keep it to what the host needs to fill the field in. */
  hint?: string;
  /** Background on the setting (what it does, its default), behind an InfoTip. */
  info?: ReactNode;
  /** Replaces the hint while set, so a field never shows advice and a complaint at once. */
  error?: string | null;
  children: ReactNode;
}) {
  const note = error ? (
    // The wording carries the meaning, so this does not rely on colour alone.
    <span className="mt-1 block text-xs font-bold text-loss">{error}</span>
  ) : hint ? (
    <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>
  ) : null;

  if (!info) {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
        {children}
        {note}
      </label>
    );
  }

  // The InfoTip is a button, and a button inside the <label> would become the
  // label's control (its first labelable descendant) and leak into the input's
  // accessible name. So the label dissolves into this grid (display: contents)
  // and the tip sits beside the label text from OUTSIDE the label element.
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5">
      <label className="contents">
        <span className="col-start-1 row-start-1 mb-1.5 block text-sm font-semibold text-ink">
          {label}
        </span>
        <div className="col-span-2 row-start-2">{children}</div>
        {note ? <div className="col-span-2 row-start-3">{note}</div> : null}
      </label>
      <span className="col-start-2 row-start-1 mb-1.5 flex">
        <InfoTip label={`About ${label}`}>{info}</InfoTip>
      </span>
    </div>
  );
}

/**
 * An "i" beside a heading or label that reveals the explanation behind it on
 * hover, keyboard focus or tap. It holds the "a little more information" layer
 * only — anything a player needs in order to act stays on screen.
 *
 * The panel renders into a portal with fixed positioning, so a scrolling or
 * overflow-hidden ancestor cannot clip it and an uppercase, tracked heading
 * cannot leak its styles into the prose. A tap (or click) pins it open until the
 * next tap elsewhere, Escape, or focus leaving; hover and focus preview it.
 */
export function InfoTip({
  children,
  label = "More info",
  className,
}: {
  children: ReactNode;
  /** The icon button's accessible name — say what it explains. */
  label?: string;
  /** Replaces the default ink-muted colour, e.g. `text-white/80 hover:text-white` on a solid fill. */
  className?: string;
}) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  // Opened by a click or tap: survives the pointer leaving, unlike a hover.
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  // A short grace period, so the pointer can cross the gap into the panel.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  const dismiss = useCallback(() => {
    cancelClose();
    setPinned(false);
    setOpen(false);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Below the icon, flipping above when the viewport runs out, and clamped to a
  // 16px gutter either side so it never causes a horizontal scroll on a phone.
  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const gutter = 16;
    const gap = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let top = r.bottom + gap;
    if (top + tip.offsetHeight > vh - gutter && r.top - gap - tip.offsetHeight >= gutter) {
      top = r.top - gap - tip.offsetHeight;
    }
    const left = Math.min(
      Math.max(r.left + r.width / 2 - tip.offsetWidth / 2, gutter),
      vw - gutter - tip.offsetWidth,
    );
    setPos({ top, left });
  }, []);

  useIsoLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      dismiss();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, dismiss]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          cancelClose();
          if (pinned) {
            setPinned(false);
            setOpen(false);
          } else {
            setPinned(true);
            setOpen(true);
          }
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          cancelClose();
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !pinned) scheduleClose();
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={dismiss}
        className={clsx(
          // The icon stays small; the invisible ::after widens the hit area
          // for thumbs without pushing the heading around.
          "relative inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full align-middle transition",
          "after:absolute after:-inset-x-3 after:-inset-y-1.5 after:content-['']",
          className ?? "text-ink-muted hover:text-ink",
        )}
      >
        <Info className="h-full w-full" />
      </button>
      {open
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") cancelClose();
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse" && !pinned) scheduleClose();
              }}
              // Keeps focus on the button, so pressing inside the panel does
              // not blur it closed.
              onMouseDown={(e) => e.preventDefault()}
              className="fixed z-[60] w-max max-w-[min(20rem,calc(100vw-2rem))] animate-pop-in space-y-2 rounded-xl border-2 border-ink bg-surface px-3.5 py-2.5 text-left font-sans text-sm font-normal normal-case leading-relaxed tracking-normal text-ink shadow-card"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-semibold text-ink shadow-card",
        "placeholder:font-normal placeholder:text-ink-subtle transition focus:border-brand",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-semibold text-ink shadow-card",
        "transition focus:border-brand",
        props.className,
      )}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex items-center justify-between rounded-xl border-2 border-ink bg-surface px-4 py-3 shadow-card transition hover:bg-paper-2",
        className ? className : "w-full"
      )}
    >
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full border-2 border-ink transition-colors",
          checked ? "bg-play" : "bg-paper-2",
        )}
      >
        <span
          className={clsx(
            "absolute top-[1px] h-[18px] w-[18px] rounded-full border border-ink bg-white transition-all",
            checked ? "left-[20px]" : "left-[1px]",
          )}
        />
      </span>
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "bg-loss-soft text-loss",
    info: "bg-play-soft text-play",
    success: "bg-gain-soft text-gain",
  };
  return (
    <div
      className={clsx(
        "rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold shadow-card",
        styles[kind],
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
