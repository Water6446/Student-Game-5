"use client";

import Link from "next/link";
import type { SessionOverviewRow } from "@/lib/game/db";
import { DotField } from "@/components/marketing/primitives";
import { ArrowRight, Monitor, Users } from "@/components/icons";
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
 */
export function LiveSessionStrip({ session }: { session: SessionOverviewRow }) {
  const rounds = session.config.num_rounds ?? 0;
  const inProgress = session.status === "active";
  const round = Math.min(session.current_round, rounds || session.current_round);

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
            {sessionTitle(session)}
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
          <Link
            href={`/host/${session.id}/present`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-paper-inverse/40 px-4 font-display text-sm font-extrabold text-paper-inverse transition hover:border-paper-inverse"
          >
            <Monitor aria-hidden="true" /> Projector
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
