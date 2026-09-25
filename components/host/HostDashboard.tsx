"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionOverviewRow } from "@/lib/game/db";
import { Eyebrow } from "@/components/marketing/primitives";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { LiveSessionStrip } from "@/components/host/LiveSessionStrip";
import { Instructions } from "@/components/Instructions";
import { Panel, PanelGrid, StatStrip, type Stat } from "@/components/terminal";
import { Banner } from "@/components/ui";
import { clsx } from "@/components/clsx";
import { Message } from "@/components/icons";
import { feedbackHref } from "@/lib/feedback";
import { gameLabel, liveSession, whenText } from "@/lib/game/session-format";

/**
 * The host dashboard's page body, under the site header: a paper title band,
 * the key-figure strip, then one tiled frame — the live session (if any)
 * across the top, the game picker, then your sessions beside how to run one
 * (DESIGN.md §8 "The trading floor"). Data comes in from the page, so this
 * renders the same for a real host and for a preview.
 */
export function HostDashboard({
  supabase,
  username,
  profileLoading,
  rows,
  rowsLoading,
  rowsError,
  onChanged,
}: {
  supabase: SupabaseClient;
  username?: string;
  profileLoading: boolean;
  rows: SessionOverviewRow[];
  rowsLoading: boolean;
  rowsError: string | null;
  onChanged: () => void;
}) {
  const live = liveSession(rows);

  return (
    <main className="min-h-dvh bg-surface">
      <div className="border-b-2 border-ink bg-paper">
        <div className="mx-auto max-w-6xl px-4 pb-7 pt-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow className="text-ink-muted">Host dashboard</Eyebrow>
            {/* Pre-filled with the session most on their mind: the live one,
                else the most recent. */}
            <a
              href={feedbackHref({ joinCode: (live ?? rows[0])?.join_code })}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink-muted transition hover:text-ink"
            >
              <Message aria-hidden="true" />
              Send feedback
            </a>
          </div>
          {/* Held invisible (same height, no reflow) until the profile is
              known, so it never reads one name and then another. */}
          <h1
            className={clsx(
              "mt-4 font-display text-[clamp(1.9rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-tight text-ink",
              profileLoading && "invisible",
            )}
          >
            {greeting(username)}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6">
        {rowsLoading || rowsError ? null : <StatStrip items={dashboardStats(rows)} />}

        <PanelGrid className="mt-6 lg:grid-cols-[7fr_5fr]">
          {live ? (
            <div className="lg:col-span-2">
              <LiveSessionStrip session={live} supabase={supabase} onDeleted={onChanged} />
            </div>
          ) : null}

          <Panel
            className="lg:col-span-2"
            title="Start a game"
            info="Pick which simulation to run, then tune its settings."
            infoLabel="About hosting a game"
            bodyClassName="p-0"
          >
            <NewSessionPanel supabase={supabase} />
          </Panel>

          <Panel title="Your sessions" meta={rows.length > 0 ? `${rows.length} in all` : undefined}>
            {/* Instead of the list, not above it: the list's empty state would
                otherwise sit under the error still saying there is nothing. */}
            {rowsError ? (
              <Banner kind="error">Couldn&apos;t load your sessions: {rowsError}</Banner>
            ) : (
              <SessionsList supabase={supabase} rows={rows} loading={rowsLoading} onChanged={onChanged} />
            )}
          </Panel>

          <Panel title="How to run a game">
            <Instructions role="professor" bare />
          </Panel>
        </PanelGrid>
      </div>
    </main>
  );
}

/** The dashboard's key figures: what this host has run so far. */
function dashboardStats(rows: SessionOverviewRow[]): Stat[] {
  const live = liveSession(rows);
  const finished = rows.filter((r) => r.status === "finished").length;
  const players = rows.reduce((s, r) => s + r.player_count, 0);
  const rounds = rows.reduce((s, r) => s + (r.status === "lobby" ? 0 : r.current_round), 0);
  const latest = rows.reduce<SessionOverviewRow | null>(
    (a, r) => (!a || r.created_at > a.created_at ? r : a),
    null,
  );
  return [
    { label: "Sessions", value: rows.length, sub: `${finished} finished` },
    {
      label: "Live now",
      value: live ? live.join_code : "None",
      sub: live
        ? live.status === "active"
          ? `round ${live.current_round} · ${live.player_count} in`
          : `lobby · ${live.player_count} in`
        : "start one below",
    },
    { label: "Players", value: players, sub: "across every session" },
    { label: "Rounds played", value: rounds, sub: "every game, all told" },
    {
      label: "Last game",
      value: latest ? gameLabel(latest.config) : "—",
      sub: latest ? whenText(latest.created_at) : "none yet",
    },
  ];
}

/**
 * The account's username, which is the name the person actually chose.
 *
 * Deliberately never the email: its local part is not what anyone calls
 * themselves (for a Google sign-up it is whatever sat in front of the @), and
 * using it as a stand-in while the profile loaded made the heading flash the
 * email before settling on the username. No username (a guest host) gets
 * something neutral rather than a guess at a person's name.
 */
function greeting(username: string | undefined): string {
  const name = username?.trim();
  return name ? `Welcome back, ${name}` : "Your sessions";
}
