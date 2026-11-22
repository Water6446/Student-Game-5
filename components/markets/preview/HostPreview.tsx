"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionStatus } from "@/lib/game/types";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import { FRICTION_PRESETS } from "@/lib/research/friction";
import { EXPORT_FIXTURE } from "@/lib/research/__fixtures__/export";
import { useCountdown } from "@/components/markets/use-countdown";
import type { HostActions, HostModel } from "@/components/markets/host/model";
import { TradingHostScreen } from "@/components/markets/host/TradingHostScreen";
import { TradingPresent } from "@/components/markets/host/TradingPresent";
import {
  PREVIEW_CONFIG,
  PREVIEW_INSTRUMENTS,
  PREVIEW_ROUNDS,
  previewConfig,
  previewWorld,
} from "./fixtures";
import { previewClass } from "./class-fixtures";
import { PreviewBar, previewHref } from "./PreviewBar";
import { previewReveal } from "./reveal-fixture";

/**
 * DEV ONLY: the host's control screen or the projector on the synthetic
 * session. The host's buttons move the preview on (Start opens round 1, Lock
 * & reveal reveals it, Next opens the next one); nothing reaches a database.
 */
export function HostPreview({
  view,
  phase,
  round,
  simulated = false,
}: {
  view: "host" | "present";
  phase: TradingPhase;
  round: number;
  simulated?: boolean;
}) {
  const router = useRouter();
  const r = Math.min(Math.max(round, 1), PREVIEW_ROUNDS);
  const revealed =
    phase === "lobby"
      ? 0
      : phase === "finished"
        ? PREVIEW_ROUNDS
        : phase === "revealed"
          ? r
          : r - 1;
  const current =
    phase === "lobby" ? 0 : phase === "finished" ? PREVIEW_ROUNDS : r;
  const world = useMemo(() => previewWorld(revealed, null), [revealed]);
  const roundStatus =
    phase === "open" || phase === "closed"
      ? "open"
      : phase === "lobby"
        ? null
        : "revealed";
  const cls = useMemo(
    () => previewClass(world, revealed, current, roundStatus),
    [world, revealed, current, roundStatus],
  );
  const [closesAt, setClosesAt] = useState(() =>
    new Date(Date.now() + (phase === "closed" ? -1000 : 75_000)).toISOString(),
  );
  const secs = useCountdown(
    phase === "open" || phase === "closed" ? closesAt : null,
  );
  const status: SessionStatus =
    phase === "lobby" ? "lobby" : phase === "finished" ? "finished" : "active";
  // the clock runs out here too, and added time opens trading again
  const shownPhase: TradingPhase =
    phase === "open" || phase === "closed"
      ? secs === 0
        ? "closed"
        : "open"
      : phase;

  const model: HostModel = {
    sessionId: "preview-session",
    joinCode: "PRV8TX",
    title: "Preview",
    status,
    cfg: previewConfig(simulated),
    phase: shownPhase,
    round: current,
    closesAt: phase === "open" || phase === "closed" ? closesAt : null,
    secondsLeft: secs,
    roundStatus,
    settling: false,
    players: cls.players,
    standings: cls.standings,
    rounds: cls.rounds,
    allocations: cls.allocations,
    instruments: PREVIEW_INSTRUMENTS,
    periods: world.periods,
    activity:
      phase === "open" || phase === "closed" || phase === "revealed"
        ? {
            round: current,
            players: cls.players.length,
            players_with_orders: phase === "open" ? 7 : 11,
            orders: phase === "open" ? 12 : 19,
            most_bought: [
              { slot: 3, players: 4 },
              { slot: 1, players: 3 },
              { slot: 9, players: 2 },
            ],
          }
        : null,
    knobs: FRICTION_PRESETS[PREVIEW_CONFIG.friction_profile],
    conditions: {
      assignment: "session",
      profile: PREVIEW_CONFIG.friction_profile,
      arms: [],
      overrides: {},
      researchMode: PREVIEW_CONFIG.research_mode,
      armCounts: [],
      players: [],
      consent: { agreed: 0, declined: 0, undecided: 0 },
    },
    devData: true,
  };

  const go = (p: TradingPhase, n: number) =>
    router.push(previewHref(view, p, n));
  const log = (what: string) => {
    // eslint-disable-next-line no-console
    console.debug("[host preview]", what);
    return null;
  };
  const actions: HostActions = {
    start: async () => (go("open", 1), null),
    extend: async (s) => {
      setClosesAt((c) =>
        new Date(Math.max(Date.parse(c), Date.now()) + s * 1000).toISOString(),
      );
      return null;
    },
    lockAndReveal: async () => (go("revealed", current), null),
    next: async () => (go("open", current + 1), null),
    finish: async () => (go("finished", PREVIEW_ROUNDS), null),
    deleteSession: async () => log("delete"),
    loadTruth: async () => world.truth,
    loadReveal: async () => previewReveal(world, true),
    loadIndexHistory: async () => world.history(0),
    loadResearch: async () => EXPORT_FIXTURE,
    loadResearchEvents: async () => ({ events: [], next: null }),
  };

  return (
    <>
      <PreviewBar view={view} phase={phase} round={r} />
      {view === "present" ? (
        <TradingPresent key={`${phase}-${r}`} model={model} actions={actions} />
      ) : (
        <TradingHostScreen
          key={`${phase}-${r}`}
          model={model}
          actions={actions}
        />
      )}
    </>
  );
}
