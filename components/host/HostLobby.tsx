"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { joinUrl } from "@/lib/game/db";
import Link from "next/link";
import { usePlayers } from "@/components/use-players";
import { Banner, Button } from "@/components/ui";
import { FlapText, Panel, PanelGrid, StatStrip, type Stat } from "@/components/terminal";
import { Masthead, TOOL, TOOL_DANGER } from "@/components/Masthead";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SessionCrumbs } from "@/components/host/SessionCrumbs";
import { LineScore, lineScoreKind } from "@/components/host/LineScore";
import { ArrowRight, Check, Monitor, Trash, Users } from "@/components/icons";
import { CondensedList } from "@/components/CondensedList";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { ManagePlayerButton } from "@/components/host/ManagePlayer";
import { isManager, isPortfolio } from "@/lib/game/types";
import { managerCountLabel } from "@/lib/game/manager";
import { numAssets } from "@/lib/game/portfolio";
import { money } from "@/lib/game/format";
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
        width="max-w-6xl"
        back={{ href: "/host", label: "Dashboard" }}
        title="Lobby"
        status={
          <span className="font-editorial text-lg italic text-ink-muted">
            Late joiners {session.config.allow_late_join ? "can still get in" : "are locked out once it starts"}
          </span>
        }
        crumbs={<SessionCrumbs session={session} stage="Lobby" />}
        tools={
          <>
            <Link
              href={`/host/${session.id}/present`}
              target="_blank"
              className={TOOL}
              title="Open the projector view in a new tab"
            >
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <SettingsMenu className={TOOL} />
            <button
              type="button"
              onClick={deleteSession}
              disabled={busy}
              aria-label="Delete this session"
              title="Delete this session"
              className={TOOL_DANGER}
            >
              <Trash /> <span className="hidden sm:inline">Delete</span>
            </button>
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
      >
        {/* The empty scoreboard: how long the game will run, before it does. */}
        <LineScore
          total={session.config.num_rounds}
          current={0}
          phase="open"
          rounds={[]}
          kind={lineScoreKind(session.config)}
        />
      </Masthead>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <StatStrip items={lobbyStats(session.config, players.length)} />
      <PanelGrid className="mt-6 lg:grid-cols-2">
        {/* The join panel: an ink body under its title strip, made to be read
            from the back of the room. */}
        <Panel title="Join the game" bodyClassName="flex flex-col items-center bg-ink p-6 text-center text-paper-inverse sm:p-8">
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
            Game code
          </p>
          {/* A split-flap board: the code reads as a code, and flips in. */}
          <FlapText text={session.join_code} onInk className="mt-3 text-5xl sm:text-6xl" />

          {/* The SVG scales to its wrapper, so the card interior still fits at
              375px without a second QR size. */}
          <div className="my-6 rounded-lg bg-white p-4">
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
        </Panel>

        {/* Roster */}
        <Panel
          title="Players joined"
          bodyClassName="flex flex-col"
          action={
            <span
              key={players.length}
              className="flex animate-count-pop items-center gap-2 font-mono text-xl font-black text-ink"
              aria-label={`${players.length} joined`}
            >
              <Users className="text-[0.8em] text-ink-muted" />
              {players.length}
            </span>
          }
        >

          {/* Name chips that wrap, not a column of rows: a hundred students fit
              on one screen, and each one pops in as they join. */}
          {players.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
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
              // a sign-in sheet: ruled cells, filling in as the room arrives
              className="grid max-h-[46vh] grid-cols-2 content-start overflow-y-auto border-l-[1.5px] border-t-[1.5px] border-ink/15 sm:grid-cols-3"
              gapItemClassName="border-b-[1.5px] border-r-[1.5px] border-ink/15"
              gapClassName="font-editorial text-sm italic text-ink-muted hover:text-ink"
              toggleClassName="mt-2 font-editorial text-sm italic text-ink-muted hover:text-ink"
              renderItem={(p, i) => (
                // A printed roster: a colour mark and a name in a ruled cell,
                // not a pill per student.
                <li className="flex min-w-0 animate-pop-in items-center gap-2 border-b-[1.5px] border-r-[1.5px] border-ink/15 py-1 pl-2.5 pr-1 font-semibold text-ink">
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
        </Panel>

      {isManager(session.config) ? (
        <Panel
          className="lg:col-span-2"
          title="The manager line-up"
          info="What your students see before they hire. Regenerated for every session."
          infoLabel="About the manager line-up"
        >
          <ManagerProspectus config={session.config} />
        </Panel>
      ) : null}
      </PanelGrid>
      </div>
    </main>
  );
}

/** The lobby's market-data row: what this session will be. */
function lobbyStats(config: SessionRow["config"], joined: number): Stat[] {
  const manager = isManager(config);
  const portfolio = isPortfolio(config);
  return [
    { label: "Players joined", value: joined, sub: joined === 0 ? "waiting for the room" : "and counting" },
    {
      label: "Game",
      value: manager ? "Manager" : portfolio ? "Portfolio" : "Basic",
      sub: manager
        ? managerCountLabel(config)
        : portfolio
          ? `${numAssets(config)} risky assets`
          : `${config.payoff_mode} payoffs`,
    },
    { label: manager ? "Years" : "Rounds", value: config.num_rounds, sub: config.allow_late_join ? "late joins allowed" : "no late joins" },
    { label: "Starting wealth", value: money(config.starting_wealth), sub: "each" },
    manager
      ? {
          label: "The index",
          value: `${Math.round((config.market_mean ?? 0.08) * 100)}%/yr`,
          sub: `±${Math.round((config.market_sd ?? 0.16) * 100)}% volatility`,
        }
      : {
          label: "Market",
          value: config.market_mode === "manual" ? "Manual" : `${Math.round((config.good_prob ?? 0.6) * 100)}% up`,
          sub: config.market_scope === "independent" ? "each player draws their own" : "one draw for the class",
        },
  ];
}
