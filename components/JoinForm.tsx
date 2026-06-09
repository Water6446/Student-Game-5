"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlayerRow } from "@/lib/game/db";
import { Banner, Button, Card, Field, TextInput } from "@/components/ui";
import { Instructions } from "@/components/Instructions";

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

  async function join() {
    setBusy(true);
    setError(null);
    try {
      // students authenticate anonymously — a real, server-verified identity
      // that RLS keys off of, without any account.
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        const { error: signErr } = await supabase.auth.signInAnonymously();
        if (signErr) throw new Error(`Could not start a session: ${signErr.message}`);
      }

      const { data, error } = await supabase.rpc("join_session", {
        p_join_code: code.trim().toUpperCase(),
        p_display_name: name.trim() || "Player",
      });
      if (error) throw new Error(error.message);

      const player = (Array.isArray(data) ? data[0] : data) as PlayerRow;
      router.push(`/play/${player.session_id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <Card className="animate-pop-in">
        <h1 className="text-2xl font-bold text-ink">Join the game</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter the code your professor is showing.</p>

        <div className="mt-6 space-y-4">
          <Field label="Join code">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              className="text-center font-mono text-3xl font-bold tracking-[0.4em]"
            />
          </Field>

          <Field label="Your name" hint="Shown on the leaderboard">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sam"
              maxLength={40}
            />
          </Field>

          {error ? <Banner kind="error">{error}</Banner> : null}

          <Button onClick={join} disabled={busy || code.trim().length < 4} className="w-full text-lg">
            {busy ? "Joining…" : "Join"}
          </Button>
        </div>
      </Card>

      <Instructions role="student" />
    </main>
  );
}
