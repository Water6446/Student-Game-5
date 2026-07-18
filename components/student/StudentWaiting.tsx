"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { Banner, Button, Card, TextInput } from "@/components/ui";
import { money } from "@/lib/game/format";
import { Sparkle } from "@/components/icons";

export function StudentWaiting({
  supabase,
  session,
  me,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
}) {
  const [name, setName] = useState(me.display_name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    setError(null);
    const trimmed = name.trim().slice(0, 40) || "Player";
    const { error } = await supabase
      .from("players")
      .update({ display_name: trimmed })
      .eq("id", me.id);
    if (error) setError(error.message);
    else setEditing(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Card className="animate-pop-in text-center">
        <div className="mx-auto flex h-16 w-16 animate-pulse-soft items-center justify-center rounded-2xl border-2 border-ink bg-brand text-3xl text-ink shadow-card">
          <Sparkle />
        </div>
        <div className="mt-4 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-gain-soft px-3 py-1 text-sm font-extrabold text-gain shadow-card">
          You&apos;re in
        </div>
        <h1 className="mt-3 font-display text-3xl font-black uppercase tracking-tight text-ink">
          Hold tight.
        </h1>

        {editing ? (
          <div className="mt-4 space-y-3">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="text-center text-lg"
            />
            <div className="flex justify-center gap-2">
              <Button onClick={saveName}>Save</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setName(me.display_name);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="mt-3 text-lg font-semibold text-play underline-offset-4 hover:underline"
          >
            {me.display_name} (edit)
          </button>
        )}

        {error ? (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border-2 border-ink bg-gain p-4 text-white shadow-card">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-white/85">
            Starting wealth
          </div>
          <div className="font-mono text-3xl font-bold">{money(me.current_wealth)}</div>
        </div>

        <p className="mt-6 font-editorial italic text-ink-muted">
          Waiting for the professor to start the game…
        </p>
        <p className="mt-1 font-mono text-xs text-ink-subtle">
          {session.config.num_rounds} rounds · {session.config.payoff_mode} payoffs
          {(session.config.correlation ?? 0) > 0
            ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
            : ""}
        </p>
      </Card>
    </main>
  );
}
