"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "@/components/clsx";

/**
 * Fades a section up 10px the first time it scrolls into view.
 *
 * Content is rendered VISIBLE on the server and only hidden once the client has
 * confirmed the element is still below the fold, so a failed observer, a JS
 * error or a crawler can never blank the page. Under `prefers-reduced-motion`
 * it does nothing at all.
 */
export function Reveal({
  children,
  variant = "fade",
  delay = 0,
  className,
}: {
  children: ReactNode;
  /**
   * "fade" lifts the block 10px as it fades in. "mask" clips the block and
   * slides it up from behind its own edge — the heading treatment.
   */
  variant?: "fade" | "mask";
  /** Milliseconds to hold before starting, for staggering a row or a list. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen when we mounted: leave it alone rather than hide it and
    // animate it back in, which would flash.
    if (el.getBoundingClientRect().top <= window.innerHeight) return;

    setHidden(true);
    // The observer always delivers an initial callback (intersecting or not)
    // once the page renders. If none arrives, the observer is not running at
    // all — a suspended tab, a broken polyfill — so show the content rather
    // than leave a section of the page blank.
    let sawCallback = false;
    const io = new IntersectionObserver(
      (entries) => {
        sawCallback = true;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setHidden(false);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);

    const failsafe = window.setTimeout(() => {
      if (sawCallback) return;
      io.disconnect();
      setHidden(false);
    }, 1500);

    return () => {
      window.clearTimeout(failsafe);
      io.disconnect();
    };
  }, []);

  if (variant === "mask") {
    return (
      <div ref={ref} className={clsx("overflow-hidden pb-[0.14em]", className)}>
        <div
          style={{ transitionDelay: `${delay}ms` }}
          className={clsx(
            "transition-transform duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            hidden ? "translate-y-full" : "translate-y-0",
          )}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={clsx(
        "transition-[opacity,transform] duration-[500ms] ease-out",
        hidden ? "translate-y-[14px] opacity-0" : "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
