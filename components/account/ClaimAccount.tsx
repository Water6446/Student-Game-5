"use client";

import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { GoogleMark, Mail } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { emailError, usernameError } from "@/lib/auth/validation";

/**
 * Turning a guest into an account.
 *
 * The whole reason this is cheap: linking an identity to an anonymous user keeps
 * the SAME auth.users.id, so every players row the guest already owns becomes
 * theirs retroactively. Nothing is copied, nothing is merged.
 *
 * It takes two visits, because adding an email has to be confirmed before the
 * account counts as permanent:
 *
 *   start  — anonymous: pick a username, then link Google (instant) or send an
 *            email confirmation. The username is parked in localStorage because
 *            the email round trip leaves the page.
 *   finish — back with a real identity but no profile row yet: confirm the
 *            username and call claim_my_account().
 *
 * localStorage is best-effort here: if it is unavailable or cleared, the finish
 * step just asks for the username again.
 */

const PENDING_KEY = "claim.username";

function stashUsername(v: string) {
  try {
    window.localStorage.setItem(PENDING_KEY, v);
  } catch {
    /* private mode / blocked storage — the finish step asks again */
  }
}

function readStashedUsername(): string {
  try {
    return window.localStorage.getItem(PENDING_KEY) ?? "";
  } catch {
    return "";
  }
}

function clearStashedUsername() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clean up */
  }
}

export function ClaimAccount({
  supabase,
  user,
  next = "/account",
  onClaimed,
}: {
  supabase: SupabaseClient;
  user: User;
  /** Where the OAuth / email round trip should land. */
  next?: string;
  onClaimed?: () => void;
}) {
  const anonymous = Boolean(user.is_anonymous);
  return anonymous ? (
    <StartClaim supabase={supabase} next={next} />
  ) : (
    <FinishClaim supabase={supabase} onClaimed={onClaimed} />
  );
}

function StartClaim({ supabase, next }: { supabase: SupabaseClient; next: string }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Shared guard: a username has to be valid and free before either route. */
  async function reserveUsername(): Promise<string | null> {
    const uErr = usernameError(username);
    if (uErr) {
      setError(uErr);
      return null;
    }
    const { data: free } = await supabase.rpc("username_available", {
      p_username: username.trim(),
    });
    if (free !== true) {
      setError("That username is taken");
      return null;
    }
    return username.trim();
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const name = await reserveUsername();
    if (!name) {
      setBusy(false);
      return;
    }
    stashUsername(name);
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${siteUrl()}${next}` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function withEmail() {
    setBusy(true);
    setError(null);
    const name = await reserveUsername();
    if (!name) {
      setBusy(false);
      return;
    }
    const eErr = emailError(email);
    if (eErr) {
      setError(eErr);
      setBusy(false);
      return;
    }
    stashUsername(name);
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${siteUrl()}${next}` },
    );
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <Banner kind="success">
        Check <span className="font-semibold">{email.trim()}</span> and open the link. Your results
        are already saved to this account — confirming the address is what lets you get back to
        them.
      </Banner>
    );
  }

  return (
    <div className="space-y-4 text-left">
      <Field label="Pick a username" hint="3–24 characters: letters, numbers, underscore">
        <TextInput
          autoComplete="username"
          placeholder="jsmith"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>

      {showEmail ? (
        <Field label="Email">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      ) : null}

      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="space-y-2">
        {showEmail ? (
          <Button onClick={withEmail} disabled={busy} className="w-full">
            <Mail />
            {busy ? "Sending…" : "Send confirmation link"}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={withGoogle} disabled={busy} className="w-full">
              <GoogleMark className="text-lg" />
              {busy ? "…" : "Continue with Google"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowEmail(true)}
              disabled={busy}
              className="w-full"
            >
              <Mail />
              Use an email address
            </Button>
          </>
        )}
      </div>

      <p className="font-editorial text-xs italic text-ink-subtle">
        We store your username and, if you use one, your email. Nothing else. You can delete the
        account at any time from your account page.
      </p>
    </div>
  );
}

function FinishClaim({
  supabase,
  onClaimed,
}: {
  supabase: SupabaseClient;
  onClaimed?: () => void;
}) {
  const [username, setUsername] = useState(() => readStashedUsername());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    const uErr = usernameError(username);
    if (uErr) {
      setError(uErr);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("claim_my_account", {
      p_username: username.trim(),
      p_display_name: username.trim(),
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    clearStashedUsername();
    onClaimed?.();
  }

  return (
    <div className="space-y-4 text-left">
      <Banner kind="info">
        Almost there — confirm your username and your past sessions are saved to this account.
      </Banner>
      <Field label="Username" hint="3–24 characters: letters, numbers, underscore">
        <TextInput
          autoComplete="username"
          placeholder="jsmith"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void claim();
          }}
        />
      </Field>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button onClick={claim} disabled={busy} className="w-full">
        {busy ? "Saving…" : "Finish setting up"}
      </Button>
    </div>
  );
}
