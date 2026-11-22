"use client";

import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { FileText } from "@/components/icons";
import { CONSENT_IS_PLACEHOLDER, CONSENT_TEXT } from "@/lib/research/consent";

/**
 * The research consent screen (section-level): shown before play when the
 * session is in research mode and the student has not answered. Both answers
 * look the same and both lead straight into the game, so the screen never
 * nudges; the words are lib/research/consent.ts (placeholder until the IRB
 * text lands).
 */
export function ConsentScreen({
  onAnswer,
  changing = false,
  onCancel,
}: {
  onAnswer: (yes: boolean) => Promise<string | null>;
  /** reopened from the account screen to change an earlier answer */
  changing?: boolean;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(yes: boolean) {
    setBusy(yes);
    setError(null);
    const err = await onAnswer(yes);
    setBusy(null);
    if (err) setError(err);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <section
        aria-labelledby="consent-title"
        className="rounded-2xl border-2 border-ink bg-surface p-6 shadow-lift"
      >
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-play-soft text-xl text-ink">
          <FileText aria-hidden="true" />
        </span>
        <h1
          id="consent-title"
          className="mt-4 font-display text-2xl font-black uppercase leading-tight tracking-tight text-ink"
        >
          {CONSENT_TEXT.title}
        </h1>
        <div className="mt-3 space-y-3 text-base text-ink-muted">
          {CONSENT_TEXT.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="text-sm">{CONSENT_TEXT.contact}</p>
        </div>
        {CONSENT_IS_PLACEHOLDER ? (
          <p className="mt-4 rounded-lg border-2 border-dashed border-ink/30 px-3 py-2 font-mono text-xs text-ink-subtle">
            Draft wording, pending the study&apos;s approval.
          </p>
        ) : null}
        {error ? (
          <div className="mt-4">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}
        <div className="mt-6 grid gap-3">
          <Button variant="secondary" className="w-full" disabled={busy != null} onClick={() => answer(true)}>
            {busy === true ? "Saving…" : CONSENT_TEXT.agree}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy != null} onClick={() => answer(false)}>
            {busy === false ? "Saving…" : CONSENT_TEXT.decline}
          </Button>
          {changing && onCancel ? (
            <Button variant="ghost" className="w-full" disabled={busy != null} onClick={onCancel}>
              Keep my answer
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
