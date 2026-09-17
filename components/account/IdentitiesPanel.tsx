"use client";

import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { Check, GoogleMark, Key, Mail } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { emailError, MIN_PASSWORD_LENGTH, passwordError } from "@/lib/auth/validation";

/**
 * The ways this account can sign in.
 *
 * Supabase links a new OAuth identity to an existing user when the provider
 * returns the SAME VERIFIED email. Google always verifies, so that is safe here
 * — but it is exactly why a provider that returns unverified emails must never
 * be added: signing up at the sloppy provider with someone else's address would
 * inherit their account. See docs/ACCOUNTS.md T5.
 */
export function IdentitiesPanel({
  supabase,
  user,
  onChanged,
}: {
  supabase: SupabaseClient;
  user: User;
  onChanged: () => void;
}) {
  const providers = new Set((user.identities ?? []).map((i) => i.provider));
  const hasGoogle = providers.has("google");
  const hasEmail = providers.has("email") || Boolean(user.email);

  return (
    <Card>
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
        Sign-in methods
      </h2>
      <p className="mt-1 font-editorial text-sm italic text-ink-muted">
        Keep at least one that you can still get into.
      </p>

      <ul className="mt-5 space-y-2">
        <MethodRow
          icon={<Mail />}
          label="Email and password"
          detail={user.email ?? "Not set"}
          active={hasEmail}
        />
        <MethodRow
          icon={<GoogleMark />}
          label="Google"
          detail={hasGoogle ? "Linked" : "Not linked"}
          active={hasGoogle}
        />
      </ul>

      <div className="mt-5 space-y-4 border-t border-line pt-5">
        {!hasGoogle ? <LinkGoogle supabase={supabase} /> : null}
        {!user.email ? (
          <AddEmail supabase={supabase} onChanged={onChanged} />
        ) : (
          <ChangePassword supabase={supabase} />
        )}
      </div>
    </Card>
  );
}

function MethodRow({
  icon,
  label,
  detail,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  active: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-paper-2 px-4 py-3">
      <span className="flex items-center gap-2.5">
        <span className="text-lg text-ink">{icon}</span>
        <span className="flex flex-col">
          <span className="font-semibold text-ink">{label}</span>
          <span className="font-mono text-xs text-ink-subtle">{detail}</span>
        </span>
      </span>
      {active ? (
        <span className="flex items-center gap-1 font-display text-xs font-extrabold uppercase tracking-wide text-gain">
          <Check /> On
        </span>
      ) : (
        <span className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-subtle">
          Off
        </span>
      )}
    </li>
  );
}

function LinkGoogle({ supabase }: { supabase: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${siteUrl()}/auth/callback?next=/account` },
    });
    if (error) {
      // "Manual linking is disabled" means the dashboard toggle is off —
      // Authentication → Settings → Manual linking. Worth saying plainly.
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={link} disabled={busy} className="w-full">
        <GoogleMark className="text-lg" />
        {busy ? "Redirecting…" : "Link a Google account"}
      </Button>
      {error ? <Banner kind="error">{error}</Banner> : null}
    </div>
  );
}

/** For an account that started as an anonymous guest: give it an email. */
function AddEmail({ supabase, onChanged }: { supabase: SupabaseClient; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const err = emailError(email);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${siteUrl()}/auth/callback?next=/account` },
    );
    setBusy(false);
    if (error) setError(error.message);
    else {
      setSent(true);
      onChanged();
    }
  }

  if (sent) {
    return (
      <Banner kind="success">
        Confirm the link sent to <span className="font-semibold">{email.trim()}</span>. Until you do,
        the address is not attached to this account.
      </Banner>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Add an email address">
        <TextInput
          type="email"
          inputMode="email"
          placeholder="you@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button onClick={add} disabled={busy}>
        <Mail />
        {busy ? "Sending…" : "Send confirmation"}
      </Button>
      <p className="font-editorial text-xs italic text-ink-subtle">
        You can set a password once the address is confirmed.
      </p>
    </div>
  );
}

function ChangePassword({ supabase }: { supabase: SupabaseClient }) {
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
    else {
      setDone(true);
      setPassword("");
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Set or change password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
        <TextInput
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {done ? <Banner kind="success">Password updated.</Banner> : null}
      <Button onClick={save} disabled={busy || !password}>
        <Key />
        {busy ? "Saving…" : "Save password"}
      </Button>
    </div>
  );
}
