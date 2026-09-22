"use client";

import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { GoogleMark, Lock } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { signInErrorMessage } from "@/lib/auth/errors";

/**
 * "Confirm it's you" — shown in place of the account changes that could lock
 * the owner out (new password, new email, linking Google, deleting the
 * account) until the session has been proven recently. See lib/auth/reauth.ts.
 *
 * Both ways in are real sign-ins to the SAME account, so they renew the
 * session's proof and useRecentSignIn picks it up from the auth event:
 *   - the account's current password, checked by GoTrue against user.email;
 *   - Google again, for an account that has it linked (and maybe no password).
 * Google may skip its own password prompt if the browser is still signed in
 * to Google — no worse than "Continue with Google" on /login, but worth
 * knowing on a shared machine.
 */
export function ConfirmIdentity({
  supabase,
  user,
  reason,
  next = "/account",
}: {
  supabase: SupabaseClient;
  user: User;
  /** one line: what this unlocks */
  reason: string;
  /** where the Google round trip lands */
  next?: string;
}) {
  const hasGoogle = (user.identities ?? []).some((i) => i.provider === "google");
  const canUsePassword = Boolean(user.email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withPassword() {
    if (!password) {
      setError("Enter your password");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email!, password });
    setBusy(false);
    if (error) {
      setError(
        signInErrorMessage(
          error,
          hasGoogle ? "That password isn't right. Signed up with Google? Use the button below." : "That password isn't right.",
        ),
      );
      return;
    }
    setPassword("");
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-ink bg-paper-2 p-4">
      <div className="flex items-start gap-2.5">
        <Lock className="mt-0.5 shrink-0 text-lg text-ink" />
        <div>
          <p className="font-display text-sm font-extrabold uppercase tracking-wide text-ink">
            Confirm it&apos;s you
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{reason}</p>
        </div>
      </div>

      {canUsePassword ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void withPassword();
          }}
          className="space-y-3"
        >
          {/* Lets a password manager fill the right entry. */}
          <input type="email" autoComplete="username" value={user.email ?? ""} readOnly hidden />
          <Field label="Current password">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Checking…" : "Confirm"}
          </Button>
        </form>
      ) : null}

      {hasGoogle ? (
        <Button variant="secondary" onClick={withGoogle} disabled={busy}>
          <GoogleMark className="text-lg" />
          Confirm with Google
        </Button>
      ) : null}

      {!canUsePassword && !hasGoogle ? (
        <p className="text-sm text-ink-muted">Sign out and back in, then come straight here.</p>
      ) : null}

      {error ? <Banner kind="error">{error}</Banner> : null}
    </div>
  );
}
