"use client";

import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { GoogleMark, Mail } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { linkErrorMessage, signUpErrorMessage } from "@/lib/auth/errors";
import {
  emailError,
  MIN_PASSWORD_LENGTH,
  passwordError,
  usernameError,
} from "@/lib/auth/validation";

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
 * With "Confirm email" OFF in Supabase, the email route skips the round trip:
 * updateUser({ email }) converts the guest on the spot and nothing is mailed, so
 * the finish step follows immediately.
 *
 * The finish step also sets a password for an account with no Google linked.
 * Without one, an email-only account has no way back in once this browser
 * session ends — there is no password, and magic links / resets need working
 * SMTP.
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
  // Set when the email was applied on the spot. The parent's `user` catches up
  // through USER_UPDATED too, but this step must not depend on it.
  const [converted, setConverted] = useState(false);
  const anonymous = Boolean(user.is_anonymous) && !converted;
  // Google is the only other way back in, so without it a password is required.
  const hasGoogle = (user.identities ?? []).some((i) => i.provider === "google");
  return anonymous ? (
    <StartClaim supabase={supabase} next={next} onConverted={() => setConverted(true)} />
  ) : (
    <FinishClaim supabase={supabase} needsPassword={!hasGoogle} onClaimed={onClaimed} />
  );
}

/** Every redirect goes through /auth/callback, so a failure (a Google account
 *  already linked elsewhere, say) reaches /auth/error instead of vanishing. */
function callbackUrl(next: string): string {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function StartClaim({
  supabase,
  next,
  onConverted,
}: {
  supabase: SupabaseClient;
  next: string;
  onConverted: () => void;
}) {
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
    const { data: free, error: availError } = await supabase.rpc("username_available", {
      p_username: username.trim(),
    });
    if (availError) {
      // A failed check is not a taken name. If this RPC is missing, the account
      // migrations (0016+) have not been applied to the project.
      setError(`Could not check that username: ${availError.message}`);
      return null;
    }
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
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) {
      setError(linkErrorMessage(error));
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
    const { data, error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: callbackUrl(next) },
    );
    setBusy(false);
    if (error) {
      setError(signUpErrorMessage(error));
      return;
    }
    // Applied on the spot ("Confirm email" off): nothing was mailed, so saying
    // "check your email" would send them looking for a message that never comes.
    if (data.user && !data.user.is_anonymous) onConverted();
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
  needsPassword,
  onClaimed,
}: {
  supabase: SupabaseClient;
  needsPassword: boolean;
  onClaimed?: () => void;
}) {
  const [username, setUsername] = useState(() => readStashedUsername());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    const uErr = usernameError(username);
    const pErr = needsPassword ? passwordError(password) : null;
    if (uErr || pErr) {
      setError(uErr ?? pErr);
      return;
    }
    setBusy(true);
    setError(null);

    // Password first: if the username is then rejected, a retry re-sends the
    // same password, which GoTrue answers with same_password — already done.
    if (needsPassword) {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError && pwError.code !== "same_password") {
        setError(pwError.message);
        setBusy(false);
        return;
      }
    }

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
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void claim();
      }}
      className="space-y-4 text-left"
    >
      <Banner kind="info">
        Almost there — confirm your username and your past sessions are saved to this account.
      </Banner>
      <Field label="Username" hint="3–24 characters: letters, numbers, underscore">
        <TextInput
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      {needsPassword ? (
        <Field
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters — how you'll sign back in`}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Finish setting up"}
      </Button>
    </form>
  );
}
