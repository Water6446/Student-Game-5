"use client";

import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Banner, Button, Card, Field, InfoTip, TextInput } from "@/components/ui";
import { Check, GoogleMark, Key, Mail } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { emailError, MIN_PASSWORD_LENGTH, passwordError } from "@/lib/auth/validation";
import { linkErrorMessage } from "@/lib/auth/errors";

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

  // *** THERE IS DELIBERATELY NO "has a password" FLAG HERE ***
  // Supabase gives the client no reliable way to know, and both obvious signals
  // are wrong in opposite directions:
  //
  //   user.email          — Google supplies an address for an account that has
  //                         no password at all. Trusting it claimed "email and
  //                         password: ON" for every Google-only sign-up.
  //   an `email` identity — updateUser({ password }) genuinely sets a password
  //                         and the user CAN then sign in with it, but no email
  //                         identity is created (supabase/auth issue 2085), so
  //                         this reads OFF for accounts that do have one.
  //
  // So the rows below state only what is actually knowable: which address is on
  // the account, and whether Google is linked. The password is presented as an
  // action, never as a status. Please do not "fix" this back into a badge.

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
          Sign-in methods
        </h2>
        <InfoTip label="About sign-in methods">
          Keep at least one that you can still get into.
        </InfoTip>
      </div>

      <ul className="mt-5 space-y-2">
        <MethodRow icon={<Mail />} label="Email address" detail={user.email ?? "Not set"} />
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
          <ChangePassword supabase={supabase} hasGoogle={hasGoogle} />
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
  /** Omit entirely when there is no honest on/off answer — see the note above. */
  active?: boolean;
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
      {active === undefined ? null : active ? (
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
      // manual_linking_disabled means the dashboard toggle is off:
      // Authentication → Sign In / Providers → "Allow manual linking".
      setError(linkErrorMessage(error));
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
  const [done, setDone] = useState<"pending" | "applied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const err = emailError(email);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${siteUrl()}/auth/callback?next=/account` },
    );
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Whether a confirmation was actually sent depends on the project's "Confirm
    // email" setting, so read it off the result rather than guessing: if the
    // address is already on the user, it applied directly and telling them to go
    // and click a link would send them looking for mail that never arrives.
    setDone(data.user?.email === email.trim() ? "applied" : "pending");
    onChanged();
  }

  if (done) {
    return (
      <Banner kind="success">
        {done === "applied" ? (
          <>
            <span className="font-semibold">{email.trim()}</span> is now on this account.
          </>
        ) : (
          <>
            Confirm the link sent to <span className="font-semibold">{email.trim()}</span>. Until you
            do, the address is not attached to this account.
          </>
        )}
      </Banner>
    );
  }

  return (
    <div className="space-y-3">
      <Field label="Add an email address">
        <TextInput
          type="email"
          inputMode="email"
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
        You can set a password once the address is on the account.
      </p>
    </div>
  );
}

function ChangePassword({
  supabase,
  hasGoogle,
}: {
  supabase: SupabaseClient;
  hasGoogle: boolean;
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
    else {
      setDone(true);
      setPassword("");
    }
  }

  return (
    <div className="space-y-3">
      {/* Only worth saying to someone who arrived via Google — for anyone else
          it is advice about a situation they are not in. */}
      <Field
        label="Set or change password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        info={
          hasGoogle
            ? "Setting a password lets you sign in with your email address as well as Google."
            : undefined
        }
      >
        <TextInput
          type="password"
          autoComplete="new-password"
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
