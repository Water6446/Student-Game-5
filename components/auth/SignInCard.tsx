"use client";

import { useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { clsx } from "@/components/clsx";
import { GoogleMark } from "@/components/icons";
import { siteUrl } from "@/lib/game/db";
import { ALLOW_ANON_HOST } from "@/lib/auth/can-host";
import {
  emailError,
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
  passwordError,
  usernameError,
} from "@/lib/auth/validation";

type Mode = "signin" | "register";

/** One message per field, so several problems can be reported together. */
type FieldErrors = { username?: string | null; email?: string | null; password?: string | null };

/**
 * The sign-in / register card. Laid out by whoever renders it — /login wraps it
 * in the site chrome — so it owns no page-level spacing of its own.
 *
 * `next` is where a successful sign-in lands. It is already sanitised by the
 * caller (see lib/auth/next-path.ts); it is threaded into every method because
 * OAuth and the emailed links leave the page and come back through
 * /auth/callback, which needs to know the destination.
 */
export function SignInCard({
  supabase,
  next = "/host",
}: {
  supabase: SupabaseClient;
  next?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <>
      <Card className="animate-pop-in">
        {/* h2, not h1: the page around this card owns the page heading. */}
        <h2 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
          {mode === "signin" ? "Sign in" : "Create an account"}
        </h2>
        <p className="mt-1 font-editorial text-sm italic text-ink-muted">
          Hosting is tied to a verified identity, not a guessable secret. Students still join with
          just a code — no account needed.
        </p>

        <ModeTabs mode={mode} onChange={setMode} />

        <GoogleButton supabase={supabase} next={next} />

        <Divider />

        {mode === "signin" ? (
          <SignInPanel supabase={supabase} next={next} />
        ) : (
          <RegisterPanel supabase={supabase} next={next} onSignedIn={() => setMode("signin")} />
        )}

        {ALLOW_ANON_HOST ? <TestingBypass supabase={supabase} /> : null}
      </Card>
    </>
  );
}

/** Active tab = solid ink fill + cream text + pressed offset (DESIGN.md). */
function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { id: Mode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "register", label: "Create account" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Account"
      className="mt-6 grid grid-cols-2 gap-2 rounded-xl border-2 border-ink bg-paper-2 p-1.5"
    >
      {tabs.map((t) => {
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={clsx(
              "rounded-lg px-3 py-2 font-display text-sm font-extrabold transition",
              active
                ? "border-2 border-ink bg-ink text-paper-inverse shadow-card"
                : "border-2 border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-0.5 flex-1 bg-line" />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
        or
      </span>
      <span className="h-0.5 flex-1 bg-line" />
    </div>
  );
}

function GoogleButton({ supabase, next }: { supabase: SupabaseClient; next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser is already navigating to Google; only a failure
    // returns here.
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <Button variant="secondary" onClick={go} disabled={busy} className="w-full">
        <GoogleMark className="text-lg" />
        {busy ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error ? <Banner kind="error">{error}</Banner> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in: email OR username, plus password. Magic link stays available for
// accounts that already exist.
// ---------------------------------------------------------------------------
function SignInPanel({ supabase, next }: { supabase: SupabaseClient; next: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function signIn() {
    const id = identifier.trim();
    if (!id || !password) {
      setError("Enter your username or email, and your password");
      return;
    }
    setBusy(true);
    setError(null);

    if (looksLikeEmail(id)) {
      // Straight to Supabase, so GoTrue sees the real client IP for its own
      // rate limiting. Only the username path needs our proxy.
      const { error } = await supabase.auth.signInWithPassword({ email: id, password });
      if (error) {
        setError("Wrong email or password");
        setBusy(false);
      }
      // success: the page around this card watches the session and moves on
      return;
    }

    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: id, password }),
    });
    if (res.ok) {
      // The session cookies were written server-side; a full navigation is what
      // makes the browser client read them.
      window.location.assign(next);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Wrong username or password");
    setBusy(false);
  }

  async function sendMagicLink() {
    const id = identifier.trim();
    const err = emailError(id);
    if (err) {
      setError("Enter your email address to get a sign-in link");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: id,
      // Sign-in only: accounts are created on the Create account tab, where a
      // username is chosen. This also stops the link being an account-creation
      // side door.
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMagicSent(true);
  }

  if (magicSent) {
    return (
      <Banner kind="success">
        If <span className="font-semibold">{identifier.trim()}</span> has an account, a sign-in link
        is on its way. Open it on this device.
      </Banner>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Username or email">
        <TextInput
          autoComplete="username"
          placeholder="jsmith or professor@university.edu"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      </Field>
      <Field label="Password">
        <TextInput
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void signIn();
          }}
        />
      </Field>

      {error ? <Banner kind="error">{error}</Banner> : null}

      <Button onClick={signIn} disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link href="/auth/reset" className="font-semibold text-ink-muted hover:text-ink">
          Forgot password?
        </Link>
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={busy}
          className="font-semibold text-ink-muted hover:text-ink disabled:opacity-60"
        >
          Email me a sign-in link instead
        </button>
      </div>
      <p className="text-center font-editorial text-xs italic text-ink-subtle">
        Signed up with Google? Use the button above — that account has no password.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register: username + email + password. Supabase emails a confirmation link
// which signs them in; after that, password sign-in works.
// ---------------------------------------------------------------------------
function RegisterPanel({
  supabase,
  next,
  onSignedIn,
}: {
  supabase: SupabaseClient;
  next: string;
  onSignedIn: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sent, setSent] = useState(false);

  async function register() {
    // Every field is checked before any is reported, so someone with a short
    // username AND a short password is told both at once instead of fixing one
    // and discovering the other.
    // Named `problems`, not `next` — `next` is this card's redirect target.
    const problems: FieldErrors = {
      username: usernameError(username),
      email: emailError(email),
      password: passwordError(password),
    };
    setFieldErrors(problems);
    setError(null);
    if (problems.username || problems.email || problems.password) return;

    setBusy(true);

    // Pre-flight so a taken handle is a friendly message rather than a raised
    // exception out of the sign-up trigger. The unique index is still the thing
    // that actually decides, so a race just surfaces below.
    const { data: free, error: availError } = await supabase.rpc("username_available", {
      p_username: username.trim(),
    });
    if (availError) {
      // Never report a failed CHECK as a failed username. If this RPC is
      // missing, the account migrations (0016+) have not been applied to the
      // project yet — say that rather than blaming the name they chose.
      setError(`Could not check that username: ${availError.message}`);
      setBusy(false);
      return;
    }
    if (free !== true) {
      setFieldErrors({ username: "That username is taken" });
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        // Read once by the on_auth_user_created trigger to seed profiles.
        // Authorization NEVER lives here — see 0016_profiles.sql.
        data: { username: username.trim(), display_name: username.trim() },
      },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // With email confirmation on (the recommended setting) there is no session
    // yet and they must open the link. With it off, Supabase signs them straight
    // in and onAuthStateChange takes over.
    if (data.session) {
      onSignedIn();
      return;
    }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <Banner kind="success">
        Check <span className="font-semibold">{email.trim()}</span> for a confirmation link. Opening
        it signs you in and finishes setting up{" "}
        <span className="font-semibold">{username.trim()}</span>.
      </Banner>
    );
  }

  return (
    <div className="space-y-4">
      <Field
        label="Username"
        hint="3–24 characters: letters, numbers, underscore"
        error={fieldErrors.username}
      >
        <TextInput
          autoComplete="username"
          placeholder="jsmith"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      <Field label="Email" error={fieldErrors.email}>
        <TextInput
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="professor@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        label="Password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        error={fieldErrors.password}
      >
        <TextInput
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void register();
          }}
        />
      </Field>

      {error ? <Banner kind="error">{error}</Banner> : null}

      <Button onClick={register} disabled={busy} className="w-full">
        {busy ? "Creating…" : "Create account"}
      </Button>
    </div>
  );
}

/**
 * Testing bypass, behind NEXT_PUBLIC_ALLOW_ANON_HOST. Signs in anonymously so
 * hosting can be exercised without any email or OAuth setup. The real methods
 * above are untouched. See CLAUDE.md for the pre-deploy checklist that removes
 * this together with migration 0008.
 */
function TestingBypass({ supabase }: { supabase: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function skip() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <Button variant="secondary" onClick={skip} disabled={busy} className="w-full">
        {busy ? "…" : "Skip email — sign in for testing"}
      </Button>
      <p className="mt-2 text-center text-xs text-ink-subtle">
        Testing only: signs you in without email verification.
      </p>
      {error ? (
        <div className="mt-3">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}
    </div>
  );
}
