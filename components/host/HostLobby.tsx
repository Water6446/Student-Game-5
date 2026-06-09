"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import Link from "next/link";
import { usePlayers } from "@/components/use-players";
import { Banner, Button, Card } from "@/components/ui";
import { Users, Monitor } from "@/components/icons";

export function HostLobby({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const router = useRouter();
  const allPlayers = usePlayers(supabase, session.id);
  // Benchmark bots are added at creation; they're not "joining", so keep the
  // lobby roster + count to real students only.
  const players = allPlayers.filter((p) => !p.is_bot);
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
          <p className="text-lg text-ink-muted">Join at</p>
          <p className="mt-1 break-all text-2xl font-bold text-brand-strong">{link}</p>

          <div className="my-6 rounded-2xl border border-line bg-white p-4 shadow-card">
            <QRCodeSVG value={link} size={220} fgColor="#1C1917" />
          </div>

          <p className="text-lg text-ink-muted">or enter code</p>
          <p className="font-mono text-6xl font-black tracking-[0.3em] text-ink sm:text-7xl">
            {session.join_code}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-base font-semibold text-ink shadow-card transition hover:border-brand active:scale-[0.98]"
              title="Open the projector view in a new tab"
            >
              <Monitor /> Present
            </Link>
          </div>
        </Card>

        {/* Roster + controls */}
        <Card className="flex flex-col">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-ink">Players</h2>
            <span className="flex items-center gap-2 font-mono text-3xl font-bold text-gain">
              <Users className="text-[0.8em] text-ink-subtle" />
              {players.length}
            </span>
          </div>

          <ul className="mt-4 max-h-[42vh] flex-1 space-y-2 overflow-y-auto pr-1">
            {players.length === 0 ? (
              <li className="text-ink-subtle">Waiting for players to join…</li>
            ) : (
              players.map((p) => (
                <li
                  key={p.id}
                  className="animate-pop-in rounded-lg border border-line bg-paper-2 px-4 py-2 text-lg font-medium text-ink"
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
              <p className="mt-2 text-center text-xs text-ink-subtle">
                Need at least one player to start.
              </p>
            ) : null}
            <button
              type="button"
              onClick={deleteSession}
              disabled={busy}
              className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-loss transition hover:bg-loss-soft disabled:opacity-50"
            >
              Delete session
            </button>
          </div>
        </Card>
      </div>
    </main>
  );
}
