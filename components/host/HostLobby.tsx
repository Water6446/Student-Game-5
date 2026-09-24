"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import Link from "next/link";
import { usePlayers } from "@/components/use-players";
import { Banner, Button, SectionTitle, buttonClasses } from "@/components/ui";
import { SECTION } from "@/components/ledger";
import { Masthead } from "@/components/Masthead";
import { ArrowRight, Check, Monitor, Trash, Users } from "@/components/icons";
import { CondensedList } from "@/components/CondensedList";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { ManagePlayerButton } from "@/components/host/ManagePlayer";
import { isManager } from "@/lib/game/types";
import { COLOR } from "@/lib/design/colors";

// The lobby is a live roster, not a ranking, so every name stays visible until
// the list is long enough that ~100 animated rows become a real jank source.
const LOBBY_CONDENSE = { threshold: 24 };

const ON_INK =
  "shadow-[3px_3px_0_rgb(var(--brand))] hover:shadow-[4px_4px_0_rgb(var(--brand))]";

export function HostLobby({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const allPlayers = usePlayers(supabase, session.id);
  // Benchmark bots are added at creation; they're not "joining", so keep the
  // lobby roster + count to real students only.
  const players = allPlayers.filter((p) => !p.is_bot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = joinUrl(session.join_code);

  async function deleteSession() {
    const ok = await confirm({
      title: `Delete session ${session.join_code}?`,
      body: "This permanently removes the lobby and everyone who has joined it. It cannot be undone.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
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
      toast("Join link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (an insecure origin, or a denied permission): the
      // link is printed right above the button, so say where to find it.
      toast("Couldn't copy — the link is shown above the button", { tone: "error" });
    }
  }

  return (
    // The paper masthead carries the one action (Start); below, the cream
    // sheet with the join code as its only block (DESIGN.md §4, §8).
    <main className="min-h-dvh bg-surface">
      <Masthead
        back={{ href: "/host", label: "Dashboard" }}
        title="Lobby"
        status={
          <span className="font-editorial text-lg italic text-ink-muted">
            {session.config.num_rounds} {isManager(session.config) ? "years" : "rounds"} · late
            joiners {session.config.allow_late_join ? "can still get in" : "locked out once it starts"}
          </span>
        }
        tools={
          <>
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              className={buttonClasses("secondary", "sm")}
              title="Open the projector view in a new tab"
            >
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteSession}
              disabled={busy}
              aria-label="Delete this session"
              className="min-w-[44px] text-loss hover:bg-loss-soft hover:text-loss"
            >
              <Trash /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </>
        }
        action={
          // The headline "start" CTA is gold (DESIGN.md §7).
          <Button
            variant="gold"
            onClick={start}
            disabled={busy || players.length === 0}
            title={players.length === 0 ? "Needs at least one player to start" : undefined}
            className="w-full text-lg shadow-pop"
          >
            {busy ? (
              "Starting…"
            ) : (
              <>
                Start the game <ArrowRight />
              </>
            )}
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:px-6">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {/* Projectable join panel — dark ink block */}
        {/* A solid ink block on the sheet — the one object here, made to be
            projected. No offset shadow: the block itself is the emphasis. */}
        <div className="flex animate-pop-in flex-col items-center rounded-2xl bg-ink p-6 text-center text-paper-inverse">
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
            Game code
          </p>
          <p className="flex font-mono text-6xl font-black text-paper-inverse sm:text-7xl">
            {/* One tile per character lands in turn — the code reads as a code. */}
            {session.join_code.split("").map((ch, i) => (
              <span
                key={i}
                className="stagger inline-block w-[0.9em] animate-count-pop text-center"
                style={{ "--i": i + 2 } as React.CSSProperties}
              >
                {ch}
              </span>
            ))}
          </p>

          {/* The SVG scales to its wrapper, so the card interior still fits at
              375px without a second QR size. */}
          <div className="my-6 rounded-2xl border-2 border-ink bg-white p-4">
            <div className="w-[180px] sm:w-[220px]">
              <QRCodeSVG value={link} size={220} fgColor={COLOR.ink} className="h-auto w-full" />
            </div>
          </div>

          <p className="break-all font-editorial italic text-paper-inverse/75">join at {link}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {/* On the ink panel an ink offset would vanish, so these two
                carry the same amber offset as the panel itself. */}
            <Button variant="secondary" onClick={copyLink} className={`min-w-[9.5rem] ${ON_INK}`}>
              {copied ? (
                <>
                  <Check /> Copied
                </>
              ) : (
                "Copy link"
              )}
            </Button>
          </div>
        </div>

        {/* Roster + controls */}
        <section className={`flex flex-col ${SECTION}`}>
          <SectionTitle
            action={
              <span
                key={players.length}
                className="flex animate-count-pop items-center gap-2 font-mono text-3xl font-black text-ink"
                aria-label={`${players.length} joined`}
              >
                <Users className="text-[0.8em] text-ink-muted" />
                {players.length}
              </span>
            }
          >
            Players joined
          </SectionTitle>

          {/* Name chips that wrap, not a column of rows: a hundred students fit
              on one screen, and each one pops in as they join. */}
          {players.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <span className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 animate-pulse-soft rounded-full bg-ink-muted"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                ))}
              </span>
              <p className="font-editorial italic text-ink-muted">
                Waiting for players — share the code or the QR.
              </p>
            </div>
          ) : (
            <CondensedList
              items={players}
              keyOf={(p) => p.id}
              as="ul"
              options={LOBBY_CONDENSE}
              moreNoun="players"
              className="mt-2 grid max-h-[42vh] flex-1 grid-cols-2 content-start gap-x-6 overflow-y-auto sm:grid-cols-3"
              gapClassName="font-editorial text-sm italic text-ink-muted hover:text-ink"
              toggleClassName="mt-2 font-editorial text-sm italic text-ink-muted hover:text-ink"
              renderItem={(p, i) => (
                // A printed roster: a colour mark and a name on a ruled line,
                // not a pill per student.
                <li className="flex min-w-0 animate-pop-in items-center gap-2 border-b-[1.5px] border-ink/10 py-1 font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${
                      ["bg-brand", "bg-play", "bg-gain", "bg-loss"][i % 4]
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.display_name}</span>
                  <ManagePlayerButton supabase={supabase} session={session} player={p} />
                </li>
              )}
            />
          )}

          {error ? (
            <div className="mt-4">
              <Banner kind="error">{error}</Banner>
            </div>
          ) : null}

        </section>
      </div>

      {isManager(session.config) ? (
        <section className={`mt-12 ${SECTION}`}>
          <SectionTitle
            className="mb-4"
            info="What your students see before they hire. Regenerated for every session."
            infoLabel="About the manager line-up"
          >
            The manager line-up
          </SectionTitle>
          <ManagerProspectus config={session.config} />
        </section>
      ) : null}
      </div>
    </main>
  );
}
