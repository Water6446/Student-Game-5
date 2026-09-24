"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, SessionRow } from "@/lib/game/db";
import { Banner, Button, TextInput } from "@/components/ui";
import { Panel, PanelGrid } from "@/components/terminal";
import { money } from "@/lib/game/format";
import { Pencil, Sparkle } from "@/components/icons";
import { isManager, isPortfolio } from "@/lib/game/types";
import { managerCountLabel } from "@/lib/game/manager";
import { ManagerProspectus } from "@/components/ManagerProspectus";

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
    // The only rename path: it cleans the name and refuses once the game has
    // started (0028). The new name arrives back through the players feed.
    const { error } = await supabase.rpc("set_my_display_name", {
      p_session_id: session.id,
      p_display_name: trimmed,
    });
    if (error) setError(error.message);
    else setEditing(false);
  }

  const manager = isManager(session.config);

  return (
    // No card: centred on the cream sheet, with the starting wealth heading a
    // small tiled ticket (DESIGN.md §4, §8).
    <main className="min-h-dvh bg-surface">
      <div
        className={`mx-auto flex min-h-dvh flex-col justify-center px-5 py-8 ${
          manager ? "max-w-2xl" : "max-w-lg"
        }`}
      >
      <div className="animate-pop-in text-center">
        <div className="mx-auto flex h-16 w-16 animate-bob items-center justify-center rounded-2xl border-2 border-ink bg-brand text-3xl text-ink shadow-card">
          <Sparkle />
        </div>
        <div className="mt-5 inline-flex animate-stamp items-center gap-1.5 rounded-full border-2 border-ink bg-gain px-3.5 py-1 font-display text-sm font-extrabold uppercase tracking-wide text-white shadow-card">
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
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
              }}
              maxLength={40}
              autoFocus
              aria-label="Your name"
              className="text-center text-lg"
            />
            <div className="flex justify-center gap-2">
              <Button onClick={saveName}>Save name</Button>
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
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`${me.display_name} — change your name`}
            className="group mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-xl font-bold text-ink transition hover:bg-play-soft"
          >
            {me.display_name}
            <Pencil className="text-base text-play transition-transform group-hover:-rotate-12" />
          </button>
        )}

        {error ? (
          <div className="mt-3">
            <Banner kind="error">{error}</Banner>
          </div>
        ) : null}

        {/* The ticket: starting wealth as the headline cell, then what this
            game is, on one tiled frame (DESIGN.md §8 "The trading floor"). */}
        <PanelGrid className="mt-6">
          <div className="bg-gain px-5 py-5 text-white">
            <div className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-white/85">
              Starting wealth
            </div>
            <div className="font-mono text-4xl font-bold">{money(me.current_wealth)}</div>
          </div>
          <dl className="grid grid-cols-3 gap-[2px] bg-ink">
            <TicketCell label="Code">{session.join_code}</TicketCell>
            <TicketCell label="Game">
              {manager ? "Manager" : isPortfolio(session.config) ? "Portfolio" : "Basic"}
            </TicketCell>
            <TicketCell label={manager ? "Years" : "Rounds"}>{session.config.num_rounds}</TicketCell>
          </dl>
        </PanelGrid>

        <p className="mt-6 font-editorial italic text-ink-muted">
          Waiting for the professor to start the game
        </p>
        <span aria-hidden="true" className="mt-2 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-pulse-soft rounded-full border-2 border-ink bg-brand"
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </span>
        <p className="mt-1 font-mono text-xs text-ink-subtle">
          {manager ? managerCountLabel(session.config) : `${session.config.payoff_mode} payoffs`}
          {(session.config.correlation ?? 0) > 0
            ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
            : ""}
        </p>
      </div>

      {/* The lobby is the "read the prospectuses before the game starts" moment
          — it is the only time a student can study the line-up unhurried. */}
      {manager ? (
        <PanelGrid className="mt-10">
          <Panel
            title="Who will you hire?"
            info="Read the prospectuses before the game starts. Every figure is net of fees."
            infoLabel="About the prospectuses"
          >
            <ManagerProspectus config={session.config} />
          </Panel>
        </PanelGrid>
      ) : null}
      </div>
    </main>
  );
}

/** One ruled cell of the ticket: a tracked label over a mono figure. */
function TicketCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-2 py-2.5">
      <dt className="font-display text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-lg font-bold text-ink">{children}</dd>
    </div>
  );
}
