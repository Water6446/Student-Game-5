"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import { usePlayers } from "@/components/use-players";
import { Banner, Button, Card } from "@/components/ui";

export function HostLobby({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const router = useRouter();
  const players = usePlayers(supabase, session.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = joinUrl(session.join_code);

  async function deleteSession() {
    const ok = window.confirm(
      `Delete session ${session.join_code}? This permanently removes the lobby and any players who joined. This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("delete_session", { p_session_id: session.id });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/host");
  }

  async function start() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("start_round", { p_session_id: session.id });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // on success, the session row flips to 'active' and the parent re-renders
    // via its realtime subscription.
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is visible to copy manually */
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Projectable join panel */}
        <Card className="flex flex-col items-center text-center">
          <p className="text-lg text-slate-400">Join at</p>
          <p className="mt-1 break-all text-2xl font-semibold text-indigo-300">{link}</p>

          <div className="my-6 rounded-2xl bg-white p-4">
            <QRCodeSVG value={link} size={220} />
          </div>

          <p className="text-lg text-slate-400">or enter code</p>
          <p className="font-mono text-6xl font-black tracking-[0.3em] text-white sm:text-7xl">
            {session.join_code}
          </p>

          <div className="mt-6">
            <Button variant="secondary" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </Card>

        {/* Roster + controls */}
        <Card className="flex flex-col">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold">Players</h2>
            <span className="font-mono text-3xl font-bold text-emerald-400">{players.length}</span>
          </div>

          <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {players.length === 0 ? (
              <li className="text-slate-500">Waiting for players to join…</li>
            ) : (
              players.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg bg-slate-800/60 px-4 py-2 text-lg text-slate-100"
                >
                  {p.display_name}
                </li>
              ))
            )}
          </ul>

          {error ? (
            <div className="mt-4">
              <Banner kind="error">{error}</Banner>
            </div>
          ) : null}

          <div className="mt-6">
            <Button onClick={start} disabled={busy || players.length === 0} className="w-full text-lg">
              {busy ? "Starting…" : `Start game (${session.config.num_rounds} rounds)`}
            </Button>
            {players.length === 0 ? (
              <p className="mt-2 text-center text-xs text-slate-500">
                Need at least one player to start.
              </p>
            ) : null}
            <button
              type="button"
              onClick={deleteSession}
              disabled={busy}
              className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Delete session
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
