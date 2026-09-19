"use client";

import { useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionOverviewRow } from "@/lib/game/db";
import { DotField } from "@/components/marketing/primitives";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { ArrowRight, Monitor, Trash, Users } from "@/components/icons";
import { gameLabel, sessionTitle } from "@/lib/game/session-format";

/**
 * "What am I doing right now?", answered before anything else on the page.
 *
 * Without this a class that is mid-round looks exactly like one finished in
 * March — same row, same styling, different word in a chip. A host arriving
 * with a lecture theatre waiting should not have to read a list.
 *
 * Deliberately the one ink-filled surface on the dashboard: the design system
 * reserves that weight for the thing that matters most on a screen, and here
 * there is at most one of these at a time.
 *
 * It can also delete the session: a test game or an abandoned class otherwise
 * sits here, pinned above everything, until the host digs it out of the list.
 * The delete is deliberately the quietest control — an icon, never beside
 * Resume — and always goes through the confirm dialog.
 */
export function LiveSessionStrip({
  session,
  supabase,
  onDeleted,
}: {
  session: SessionOverviewRow;
  supabase: SupabaseClient;
  /** called after a successful delete, so the page can drop the strip */
  onDeleted: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const rounds = session.config.num_rounds ?? 0;
  const inProgress = session.status === "active";
  const round = Math.min(session.current_round, rounds || session.current_round);
  const title = sessionTitle(session);

  async function remove() {
    const students = session.player_count;
    const ok = await confirm({
      title: `Delete ${title}?`,
      body: inProgress
        ? `This game is still running. ${
            students === 1 ? "The 1 student in it loses" : `All ${students} students in it lose`
          } their game, and every round and allocation is removed. It cannot be undone.`
        : "This closes the lobby and removes everyone who has joined it. It cannot be undone.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_session", { p_session_id: session.id });
    setDeleting(false);
    if (error) {
      toast(`Couldn't delete: ${error.message}`, { tone: "error" });
      return;
    }
    toast(`Deleted ${title}`);
    onDeleted();
  }

  return (
    <section
      aria-label="Session in progress"
      className="relative overflow-hidden rounded-2xl border-2 border-ink bg-ink text-paper-inverse shadow-lift-brand"
    >
      <DotField tone="cream" className="absolute right-0 top-0 h-24 w-1/3 opacity-20" />

      <div className="relative flex flex-wrap items-end justify-between gap-6 p-5 sm:p-6">
        <div className="min-w-0">
          <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            <span
              aria-hidden="true"
              className={
                inProgress
                  ? "inline-block h-2 w-2 animate-pulse rounded-full bg-brand"
                  : "inline-block h-2 w-2 rounded-full bg-brand"
              }
            />
            {inProgress ? "In progress" : "Lobby open"}
          </span>

          <h3 className="mt-2 truncate font-display text-2xl font-black uppercase tracking-tight text-paper-inverse sm:text-3xl">
            {title}
          </h3>

          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm text-paper-inverse/75">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Join code</dt>
              <dd className="font-bold tracking-widest text-paper-inverse">{session.join_code}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Students</dt>
              <dd className="flex items-center gap-1.5">
                <Users aria-hidden="true" /> {session.player_count}
              </dd>
            </div>
            {rounds > 0 && inProgress ? (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Progress</dt>
                <dd>
                  Round {round} of {rounds}
                </dd>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Game</dt>
                <dd>{gameLabel(session.config)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            aria-label={`Delete ${title}`}
            title="Delete this session"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-paper-inverse/40 text-paper-inverse/80 transition hover:border-loss hover:bg-loss hover:text-white disabled:opacity-50"
          >
            <Trash aria-hidden="true" />
          </button>
          <Link
            href={`/host/${session.id}/present`}
            aria-label="Projector"
            // Icon-only below sm: with the delete button beside it, three
            // labelled controls overflow a 375px strip and clip Resume.
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border-2 border-paper-inverse/40 font-display text-sm font-extrabold text-paper-inverse transition hover:border-paper-inverse sm:px-4"
          >
            <Monitor aria-hidden="true" /> <span className="hidden sm:inline">Projector</span>
          </Link>
          <Link
            href={`/host/${session.id}`}
            className="group inline-flex min-h-[48px] items-center gap-2 rounded-full border-2 border-ink bg-brand px-6 font-display text-base font-extrabold text-ink transition hover:bg-brand-strong active:translate-x-[2px] active:translate-y-[2px]"
          >
            {inProgress ? "Resume" : "Open lobby"}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              <ArrowRight />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
