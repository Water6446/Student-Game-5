"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        <h1 className="text-2xl font-semibold">Host sign-in</h1>
        <p className="mt-1 text-sm text-slate-400">
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
      </Card>
    </main>
  );
}
