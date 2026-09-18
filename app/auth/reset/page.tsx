"use client";

import { useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { ArrowLeft } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { emailError, MIN_PASSWORD_LENGTH, passwordError } from "@/lib/auth/validation";

/**
 * Password reset, both halves in one page.
 *
 * Signed out -> ask for an email and send the reset link. Signed in (which is
 * what opening that link produces, via /auth/callback) -> set a new password.
 */
export default function ResetPasswordPage() {
  const { supabase, user, loading } = useSupabaseUser();

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card className="animate-pop-in">
        {user && !user.is_anonymous ? (
          <SetNewPassword supabase={supabase} />
        ) : (
          <RequestLink supabase={supabase} />
        )}
        <Link
          href="/host"
          className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft /> Back to sign-in
        </Link>
      </Card>
    </main>
  );
}

function RequestLink({ supabase }: { supabase: ReturnType<typeof useSupabaseUser>["supabase"] }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const err = emailError(email);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl()}/auth/callback?next=/auth/reset`,
    });
    setBusy(false);
    if (!error) {
      setSent(true);
      return;
    }
    // A rate-limit message is about OUR sending quota and is worth showing.
    // Every other failure is swallowed into the same success screen, so this
    // form cannot be used to discover which addresses have accounts.
    if (/rate|limit/i.test(error.message)) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
          Check your email
        </h1>
        <div className="mt-6">
          <Banner kind="success">
            If <span className="font-semibold">{email.trim()}</span> has an account, a reset link is
            on its way.
          </Banner>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
        Reset your password
      </h1>
      <p className="mt-1 font-editorial text-sm italic text-ink-muted">
        We&apos;ll email you a link that lets you set a new one.
      </p>
      <div className="mt-6 space-y-4">
        <Field label="Email">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
        </Field>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button onClick={send} disabled={busy} className="w-full">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </div>
    </>
  );
}

function SetNewPassword({
  supabase,
}: {
  supabase: ReturnType<typeof useSupabaseUser>["supabase"];
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const err = passwordError(password);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  if (done) {
    return (
      <>
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
          Password updated
        </h1>
        <div className="mt-6">
          <Banner kind="success">You can sign in with your new password from now on.</Banner>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
        Set a new password
      </h1>
      <div className="mt-6 space-y-4">
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </Field>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button onClick={save} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Save password"}
        </Button>
      </div>
    </>
  );
}
