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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Card className="animate-pop-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-3xl text-brand">
          <Sparkle />
        </div>
        <h1 className="mt-3 text-2xl font-bold text-ink">You&apos;re in!</h1>

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
            {me.display_name} ✎
          </button>
        )}

        {error ? (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-gain/20 bg-gain-soft p-4">
          <div className="text-sm font-medium text-gain/80">Starting wealth</div>
          <div className="font-mono text-3xl font-bold text-gain">
            {money(me.current_wealth)}
          </div>
        </div>

        <p className="mt-6 animate-pulse-soft text-ink-muted">
          Waiting for the professor to start the game…
        </p>
        <p className="mt-1 text-xs text-ink-subtle">
          {session.config.num_rounds} rounds · {session.config.payoff_mode} payoffs
        </p>
      </Card>
    </main>
  );
}
