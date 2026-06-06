"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { Banner, Button, Card, TextInput } from "@/components/ui";
import { money } from "@/lib/game/format";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card className="text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-3 text-2xl font-semibold">You&apos;re in!</h1>

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
            className="mt-3 text-lg text-indigo-300 underline-offset-4 hover:underline"
          >
            {me.display_name} ✎
          </button>
        )}

        {error ? (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl bg-slate-800/60 p-4">
          <div className="text-sm text-slate-400">Starting wealth</div>
          <div className="font-mono text-3xl font-bold text-emerald-400">
            {money(me.current_wealth)}
          </div>
        </div>

        <p className="mt-6 animate-pulse text-slate-400">
          Waiting for the professor to start the game…
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {session.config.num_rounds} rounds · {session.config.payoff_mode} payoffs
        </p>
      </Card>
    </main>
  );
}
