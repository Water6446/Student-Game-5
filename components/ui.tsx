"use client";

import {
  forwardRef,
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
import { AlertTriangle, Check, Info } from "./icons";
import { useCountUp } from "./use-count-up";
import { PRESSABLE, buttonClasses } from "./button-classes";

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

/**
 * A placeholder block for content still loading. Size it with `className`
 * (`h-6 w-40`). Decorative only — the page around it should say "Loading" to
 * assistive tech once, via `PageSkeleton`'s status label or its own.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={clsx("block animate-pulse-soft rounded-xl bg-ink/10", className)}
    />
  );
}

/**
 * The body of a loading page — a heading and a couple of cards — for pages that
 * render their own <main> and chrome. DESIGN.md §8 asks for a skeleton over a
 * bare "Loading…" for anything slower than ~300ms. `label` is what a screen
 * reader hears.
 */
export function SkeletonCards({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-10 w-2/3" />
      <div className="mt-8 space-y-6">
        <div className="rounded-2xl border-2 border-ink/15 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-5 h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
        <div className="rounded-2xl border-2 border-ink/15 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-5 h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

/** A whole loading page: `SkeletonCards` in a <main> at the page's own width. */
export function PageSkeleton({
  label,
  width = "max-w-2xl",
}: {
  label?: string;
  /** match the page's own container so nothing jumps when it arrives */
  width?: string;
}) {
  return (
    <main className="min-h-dvh">
      <div className={clsx("mx-auto px-5 py-10 sm:px-8 sm:py-14", width)}>
        <SkeletonCards label={label} />
      </div>
    </main>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "ghost" | "success" | "danger";
  /** `sm` is for toolbars and header rows; everything a player acts on is `md`. */
  size?: "sm" | "md";
};

// The press affordance and button classes live in a plain module so server
// components (StatusPage) can call buttonClasses() too; re-exported here.
export { PRESSABLE, buttonClasses } from "./button-classes";

// forwardRef so a dialog can put focus on a specific button.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = "primary", size = "md", className, ...props },
  ref,
) {
  if (variant === "ghost") {
    // Quiet, borderless: for secondary actions in a toolbar ("Finish early").
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-ink-muted transition",
          "hover:bg-ink/[0.06] hover:text-ink active:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "min-h-[44px] px-3 text-sm sm:min-h-[40px]" : "min-h-[48px] px-4 text-base",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      ref={ref}
      className={clsx(
        buttonClasses(variant, size),
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:brightness-100",
        // a disabled button neither lifts nor presses
        "disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-card",
        "disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/**
 * A card's heading, with an optional InfoTip beside it and an optional action
 * on the right (a toggle, a "Show all"). One style for every card on every
 * screen: Archivo, extra-bold, upper case — the arcade voice.
 */
export function SectionTitle({
  children,
  info,
  infoLabel,
  action,
  icon,
  as: Tag = "h2",
  className,
}: {
  children: ReactNode;
  info?: ReactNode;
  infoLabel?: string;
  action?: ReactNode;
  icon?: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0 text-lg text-ink">{icon}</span> : null}
        <Tag className="font-display text-lg font-extrabold uppercase leading-tight tracking-tight text-ink sm:text-xl">
          {children}
        </Tag>
        {info ? (
          <InfoTip label={infoLabel ?? `About ${typeof children === "string" ? children.toLowerCase() : "this"}`}>
            {info}
          </InfoTip>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * A number that rolls to its value (see useCountUp). Assistive tech reads the
 * final value once, not every frame.
 */
export function CountUp({
  value,
  from,
  format = (n) => String(Math.round(n)),
  duration,
  className,
}: {
  value: number;
  /** where the first roll starts; defaults to `value` (no roll on mount) */
  from?: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const shown = useCountUp(value, { from, duration });
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/**
 * A pill of mutually exclusive options ($ / %, Sign in / Create account). The
 * active option sits on an ink block that slides between positions.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  options: readonly { value: T; label: ReactNode; ariaLabel?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** names the group for screen readers ("Enter the amount in") */
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        "relative inline-grid shrink-0 rounded-xl border-2 border-ink bg-surface p-1 shadow-card",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 top-1 rounded-lg bg-ink transition-transform duration-200 ease-out"
        style={{
          left: 4,
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={clsx(
              "relative z-10 rounded-lg px-3 font-display font-extrabold transition-colors duration-200",
              size === "sm" ? "min-h-[32px] text-sm" : "min-h-[40px] text-base",
              on ? "text-paper-inverse" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A small preset button — "25%", "Split evenly", "All cash". `active` marks
 * the preset that matches the current value, so the row doubles as a readout.
 */
export function ChipButton({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        "min-h-[44px] flex-1 whitespace-nowrap rounded-xl border-2 border-ink px-2 text-sm font-display font-bold",
        // Active = the active-nav pattern (DESIGN.md §8): ink fill, cream text,
        // pressed flat. An ink offset under an ink chip would read as a notch.
        active
          ? "translate-x-[2px] translate-y-[2px] bg-ink text-paper-inverse transition-colors"
          : clsx("bg-surface text-ink shadow-card hover:bg-paper-2", PRESSABLE),
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-card",
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

// Tailwind cannot tell which of two bg-* classes should win, so a caller's
// background replaces the default rather than competing with it.
const hasBg = (c?: string) => !!c && /(^|\s)bg-/.test(c);

const FIELD =
  "w-full rounded-xl border-2 border-ink px-4 py-3 text-base font-semibold text-ink shadow-card " +
  "transition focus:border-ink focus:shadow-card-hover disabled:opacity-60";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        FIELD,
        !hasBg(props.className) && "bg-surface",
        "placeholder:font-normal placeholder:text-ink-subtle",
        props.className,
      )}
    />
  );
}

/**
 * A money / percent field: mono, tabular, right-aligned, with a fixed prefix
 * ("$") or suffix ("%") that never overlaps the digits. 48px tall — thumbs.
 */
export const NumberField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    prefix?: string;
    suffix?: string;
    /** classes for the wrapper (width, flex) */
    wrapperClassName?: string;
  }
>(function NumberField({ prefix, suffix, wrapperClassName, className, ...props }, ref) {
  return (
    <div className={clsx("relative flex min-w-0 items-center", wrapperClassName ?? "flex-1")}>
      {prefix ? (
        <span className="pointer-events-none absolute left-3.5 font-mono text-base font-bold text-ink-muted">
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        type="number"
        {...props}
        className={clsx(
          "no-spinner h-12 w-full min-w-0 rounded-xl border-2 border-ink bg-surface text-right font-mono text-lg font-bold tabular-nums text-ink shadow-card",
          "transition placeholder:font-normal placeholder:text-ink-subtle/70 focus:shadow-card-hover disabled:opacity-60",
          prefix ? "pl-8" : "pl-3",
          suffix ? "pr-8" : "pr-3.5",
          className,
        )}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3.5 font-mono text-base font-bold text-ink-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(FIELD, !hasBg(props.className) && "bg-surface", props.className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-surface px-4 py-3 shadow-card transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60",
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
            "absolute top-[1px] h-[18px] w-[18px] rounded-full border border-ink bg-white transition-[left] duration-200 ease-out",
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
  // An icon as well as a colour, so the kind never rests on colour alone.
  const icon = {
    error: <AlertTriangle />,
    info: <Info />,
    success: <Check />,
  };
  return (
    <div
      className={clsx(
        "flex animate-pop-in items-start gap-2.5 rounded-xl border-2 border-ink px-4 py-3 text-sm font-semibold shadow-card",
        styles[kind],
      )}
      role="alert"
    >
      <span className="mt-0.5 shrink-0 text-base">{icon[kind]}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
