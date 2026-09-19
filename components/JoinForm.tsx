"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlayerRow } from "@/lib/game/db";
import { friendlyJoinError } from "@/lib/game/join-errors";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { StudentResumeStrip } from "@/components/StudentResumeStrip";

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

  async function join() {
    setBusy(true);
    setError(null);
    try {
      // students authenticate anonymously — a real, server-verified identity
      // that RLS keys off of, without any account.
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
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
            maxLength={6}
            className="bg-brand-soft text-center font-mono text-3xl font-bold tracking-[0.4em]"
          />
        </Field>

        <Field label="Your name" hint="Shown on the leaderboard">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>

        {error ? <Banner kind="error">{error}</Banner> : null}

        <Button
          type="submit"
          variant="gold"
          disabled={busy || code.trim().length < 4}
          className="w-full text-lg"
        >
          {busy ? "Joining…" : "Enter the market →"}
        </Button>
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
