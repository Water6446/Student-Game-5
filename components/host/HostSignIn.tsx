"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { Instructions } from "@/components/Instructions";
import { siteUrl } from "@/lib/game/db";

export function HostSignIn({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/host` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  // TEMP (testing): skip the email magic link entirely and sign in anonymously
  // because Supabase's email quota is rate-limited. The magic-link flow above is
  // left fully intact. To remove this bypass, delete this function and the
  // "Skip email" button below, and re-tighten create_session + the /host gate.
  async function skipEmailForTesting() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) setError(error.message);
    // on success, onAuthStateChange flips the /host page to the dashboard.
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card className="animate-pop-in">
        <h1 className="text-2xl font-bold text-ink">Host sign-in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Hosts use a real account so privileges are tied to a verified identity, not a guessable
          secret. We&apos;ll email you a magic link.
        </p>

        {sent ? (
          <div className="mt-6">
            <Banner kind="success">
              Check <span className="font-semibold">{email}</span> for a sign-in link, then return
              here.
            </Banner>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <Field label="Email">
              <TextInput
                type="email"
                inputMode="email"
                placeholder="professor@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {error ? <Banner kind="error">{error}</Banner> : null}
            <Button onClick={sendLink} disabled={busy || !email.trim()} className="w-full">
              {busy ? "Sending…" : "Send magic link"}
            </Button>
          </div>
        )}

        {/* TEMP (testing): bypass email while the Supabase email quota is rate-limited. */}
        <div className="mt-6 border-t border-line pt-4">
          <Button
            variant="secondary"
            onClick={skipEmailForTesting}
            disabled={busy}
            className="w-full"
          >
            {busy ? "…" : "Skip email — sign in for testing"}
          </Button>
          <p className="mt-2 text-center text-xs text-ink-subtle">
            Temporary: signs you in without email verification.
          </p>
        </div>
      </Card>

      <Instructions role="professor" />
    </main>
  );
}
