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
import { CondensedList } from "@/components/CondensedList";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { isManager } from "@/lib/game/types";
import { COLOR } from "@/lib/design/colors";

// The lobby is a live roster, not a ranking, so every name stays visible until
// the list is long enough that ~100 animated rows become a real jank source.
const LOBBY_CONDENSE = { threshold: 24 };

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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Projectable join panel — dark ink block */}
        <div className="flex flex-col items-center rounded-2xl border-2 border-ink bg-ink p-6 text-center text-paper-inverse shadow-lift">
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
            Game code
          </p>
          <p className="font-mono text-6xl font-black tracking-[0.3em] text-paper-inverse sm:text-7xl">
            {session.join_code}
          </p>

          {/* The SVG scales to its wrapper, so the card interior still fits at
              375px without a second QR size. */}
          <div className="my-6 rounded-2xl border-2 border-ink bg-white p-4 shadow-card">
            <div className="w-[180px] sm:w-[220px]">
              <QRCodeSVG value={link} size={220} fgColor={COLOR.ink} className="h-auto w-full" />
            </div>
          </div>

          <p className="break-all font-editorial italic text-paper-inverse/75">join at {link}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="gold" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-ink bg-surface px-5 py-3 text-base font-display font-extrabold text-ink shadow-card transition hover:bg-paper-2 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              title="Open the projector view in a new tab"
            >
              <Monitor /> Present
            </Link>
          </div>
        </div>

        {/* Roster + controls */}
        <Card className="flex flex-col">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-ink">
              Players joined
            </h2>
            <span className="flex items-center gap-2 rounded-full border-2 border-ink bg-play-soft px-3 py-1 font-mono text-2xl font-bold text-ink shadow-card">
              <Users className="text-[0.8em] text-ink-muted" />
              {players.length}
            </span>
          </div>

          {players.length === 0 ? (
            <ul className="mt-4 max-h-[42vh] flex-1 space-y-2 overflow-y-auto pr-1">
              <li className="font-editorial italic text-ink-subtle">Waiting for players to join…</li>
            </ul>
          ) : (
            <CondensedList
              items={players}
              keyOf={(p) => p.id}
              as="ul"
              options={LOBBY_CONDENSE}
              className="mt-4 max-h-[42vh] flex-1 space-y-2 overflow-y-auto pr-1"
              gapClassName="font-editorial text-sm italic text-ink-subtle hover:text-ink"
              toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
              renderItem={(p, i) => (
                <li
                  className={`animate-pop-in rounded-lg border-2 border-ink px-4 py-2 text-lg font-semibold text-ink shadow-card ${
                    ["bg-brand-soft", "bg-play-soft", "bg-gain-soft", "bg-loss-soft"][i % 4]
                  }`}
                >
                  {p.display_name}
                </li>
              )}
            />
          )}

          {error ? (
            <div className="mt-4">
              <Banner kind="error">{error}</Banner>
            </div>
          ) : null}

          <div className="mt-6">
            <Button
              variant="success"
              onClick={start}
              disabled={busy || players.length === 0}
              className="w-full text-lg"
            >
              {busy ? "Starting…" : `Start the game (${session.config.num_rounds} rounds)`}
            </Button>
            {players.length === 0 ? (
              <p className="mt-2 text-center font-editorial text-xs italic text-ink-subtle">
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

      {isManager(session.config) ? (
        <div className="mt-8">
          <h2 className="mb-1 font-display text-xl font-extrabold uppercase tracking-tight text-ink">
            The manager line-up
          </h2>
          <p className="mb-3 font-editorial text-sm italic text-ink-muted">
            What your students see before they hire. Regenerated for every session.
          </p>
          <ManagerProspectus config={session.config} />
        </div>
      ) : null}
    </main>
  );
}
