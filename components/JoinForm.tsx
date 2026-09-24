"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlayerRow } from "@/lib/game/db";
import { friendlyJoinError } from "@/lib/game/join-errors";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { StudentResumeStrip } from "@/components/StudentResumeStrip";
import { ArrowRight } from "@/components/icons";

/** The name a student last joined with, so the next class is one field, not two. */
const LAST_NAME_KEY = "join.lastName";

export function JoinForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [supabase] = useState(() => createClient());

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when a real account is signed in on this browser: whose it is, while
  // the student chooses between joining as it or as a guest.
  const [accountLabel, setAccountLabel] = useState<string | null>(null);

  // prefill code from the QR/link (?code=...)
  useEffect(() => {
    const c = search.get("code");
    if (c) setCode(c.toUpperCase());
  }, [search]);

  // Read after mount: localStorage does not exist during the server render.
  useEffect(() => {
    try {
      const last = window.localStorage.getItem(LAST_NAME_KEY);
      if (last) setName((current) => current || last);
    } catch {
      /* blocked storage (private mode): they type it, as before */
    }
  }, []);

  async function join(as?: "account" | "guest") {
    setBusy(true);
    setError(null);
    try {
      // students authenticate anonymously — a real, server-verified identity
      // that RLS keys off of, without any account.
      const { data: userData } = await supabase.auth.getUser();
      let user = userData.user;

      // A real account signed in on this browser is often a professor's, left
      // on a lab or classroom machine. Joining would play AS that account and
      // leave its /account and /host one click away, so ask first.
      if (user && !user.is_anonymous && !as) {
        setAccountLabel(user.email ?? "an account");
        setBusy(false);
        return;
      }
      if (user && !user.is_anonymous && as === "guest") {
        // "local": this browser only. The default would end the account's
        // sessions on every device — the projector laptop included.
        await supabase.auth.signOut({ scope: "local" });
        user = null;
      }
      setAccountLabel(null);

      if (!user) {
        const { error: signErr } = await supabase.auth.signInAnonymously();
        if (signErr) throw new Error(signErr.message);
      }

      const { data, error } = await supabase.rpc("join_session", {
        p_join_code: code.trim().toUpperCase(),
        p_display_name: name.trim() || "Player",
      });
      if (error) throw new Error(error.message);

      const player = (Array.isArray(data) ? data[0] : data) as PlayerRow;
      try {
        if (name.trim()) window.localStorage.setItem(LAST_NAME_KEY, name.trim().slice(0, 40));
      } catch {
        /* not worth failing a join over */
      }
      router.push(`/play/${player.session_id}`);
    } catch (e) {
      setError(friendlyJoinError((e as Error).message));
      setBusy(false);
    }
  }

  return (
    <Card className="animate-pop-in">
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">
        Who&apos;s playing?
      </h2>

      {/* A real form, so Enter — and "Go" on a phone keyboard — joins. */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && code.trim().length >= 4) void join();
        }}
        className="mt-5 space-y-4"
      >
        <Field label="Join code">
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="ABC12"
            maxLength={6}
            className="bg-brand-soft py-4 text-center font-mono text-3xl font-bold uppercase tracking-[0.4em] placeholder:tracking-[0.4em] placeholder:text-ink/20"
          />
        </Field>

        <Field label="Your name" hint="Shown on the leaderboard">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="First name is fine"
          />
        </Field>

        {error ? <Banner kind="error">{error}</Banner> : null}

        {accountLabel ? (
          <div className="space-y-3">
            <Banner kind="info">
              This browser is signed in as <span className="font-semibold">{accountLabel}</span>. Is
              that you?
            </Banner>
            <Button
              type="button"
              variant="gold"
              onClick={() => void join("guest")}
              disabled={busy}
              className="w-full"
            >
              No — join as a guest
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void join("account")}
              disabled={busy}
              className="w-full"
            >
              Yes — join as {accountLabel}
            </Button>
          </div>
        ) : (
          <Button
            type="submit"
            variant="gold"
            disabled={busy || code.trim().length < 4}
            className="w-full text-lg shadow-pop"
          >
            {busy ? (
              "Joining…"
            ) : (
              <>
                Enter the market <ArrowRight />
              </>
            )}
          </Button>
        )}
      </form>
    </Card>
  );
}

/**
 * The join page's "you're already in a game" strip. Lives here because this
 * file already owns the join page's Supabase client; the page itself stays a
 * Server Component.
 */
export function JoinResume({ className }: { className?: string }) {
  const [supabase] = useState(() => createClient());
  return <StudentResumeStrip supabase={supabase} className={className} />;
}
