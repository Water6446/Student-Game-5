// No "use client": these are plain strings and a pure function, callable from
// server components (StatusPage) as well as client ones. ui.tsx re-exports them.
import { clsx } from "./clsx";

/**
 * The press affordance, shared by every ink-bordered control: it rises toward
 * the pointer on hover (a bigger offset) and presses flat on click. Links that
 * look like buttons use it too (`buttonClasses`), so a <Link> and a <Button>
 * side by side behave the same.
 */
export const PRESSABLE =
  "transition-[transform,box-shadow,background-color,filter] duration-150 ease-out " +
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-card-hover " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

export const BUTTON_VARIANTS = {
  primary: "bg-play text-white shadow-card hover:brightness-110", // electric blue
  gold: "bg-brand text-ink shadow-card hover:bg-brand-strong", // amber, INK text
  // Flat at rest: only the headline action on a screen sits raised. It lifts
  // (and gains its shadow) under the pointer, so it still reads as pressable.
  secondary: "bg-surface text-ink hover:bg-paper-2",
  success: "bg-gain text-white shadow-card hover:brightness-110",
  danger: "bg-loss text-white shadow-card hover:brightness-110",
} as const;

/** Button styling for a <Link>: same variants, sizes and press affordance. */
export function buttonClasses(
  variant: keyof typeof BUTTON_VARIANTS = "primary",
  size: "sm" | "md" = "md",
  className?: string,
): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink font-display font-extrabold",
    size === "sm" ? "min-h-[44px] px-3.5 py-1.5 text-sm sm:min-h-[40px]" : "min-h-[48px] px-5 py-3 text-base",
    PRESSABLE,
    BUTTON_VARIANTS[variant],
    className,
  );
}

