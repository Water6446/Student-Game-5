"use client";

import "./globals.css";

/**
 * The last resort: the root layout itself failed, so nothing else — header,
 * fonts, providers — can be trusted to render. Plain markup on the design
 * tokens, and a full reload rather than a re-render.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
          <div className="rounded-2xl border-2 border-ink bg-surface p-6 shadow-card">
            <h1 className="text-2xl font-black uppercase tracking-tight text-ink">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              The site failed to load. Reloading usually fixes it.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  window.location.reload();
                }}
                className="rounded-xl border-2 border-ink bg-brand px-5 py-3 font-extrabold text-ink shadow-card"
              >
                Reload
              </button>
              <a href="/" className="text-center text-sm font-semibold text-ink-muted underline">
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
