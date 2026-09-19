"use client";

/**
 * "Skip to content" — the first thing a keyboard or screen-reader user reaches
 * on every page, invisible until focused.
 *
 * It targets the page's <main> rather than a fixed id, so no page has to
 * remember to add one: every route renders exactly one <main>.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        const main = document.querySelector("main");
        if (!main) return;
        e.preventDefault();
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        // A focused <main> is not a control, so it gets no ring of its own.
        main.style.outline = "none";
        main.focus();
        main.scrollIntoView();
      }}
      // not-sr-only resets padding to 0, so the padding is re-applied under focus.
      className="sr-only rounded-xl border-2 border-ink bg-brand font-display text-sm font-extrabold text-ink shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:px-4 focus:py-2.5"
    >
      Skip to content
    </a>
  );
}
