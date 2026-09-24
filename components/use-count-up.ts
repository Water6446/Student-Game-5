"use client";

import { useEffect, useRef, useState } from "react";

/** Is the reader asking for less motion? Read once per call, client only. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A number that rolls from where it was to where it is now, like a ticker —
 * the reveal's new wealth, the submitted counter, a final balance. Display
 * only: the real value is always `target`, and screen readers get that.
 *
 * `from` seeds the first roll (a wealth reveal rolls from the balance BEFORE
 * the round, which is the whole point). Later changes roll from whatever is on
 * screen. Reduced motion, or a non-finite value, snaps straight to the target.
 */
export function useCountUp(
  target: number,
  { from, duration = 900 }: { from?: number; duration?: number } = {},
): number {
  const [value, setValue] = useState(() => (from != null && Number.isFinite(from) ? from : target));
  const shown = useRef(value);
  shown.current = value;

  useEffect(() => {
    const start = shown.current;
    if (!Number.isFinite(target) || !Number.isFinite(start) || start === target || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      // ease-out cubic: fast off the mark, settles gently on the final digit
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(t >= 1 ? target : start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
