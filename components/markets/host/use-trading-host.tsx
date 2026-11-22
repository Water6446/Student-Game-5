"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import type { TradingReveal, TradingTruth } from "@/lib/markets/db";
import { sessionTitle } from "@/lib/game/session-format";
import { tradingConfigOf } from "@/lib/markets/trading/config";
import { tradingPhase } from "@/lib/markets/trading/phase";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useRoundPhase } from "@/components/use-round-phase";
import { useSessionHistory } from "@/components/use-session-history";
import { useCountdown } from "@/components/markets/use-countdown";
import { useFriction, useSessionConditions } from "@/components/markets/use-friction";
import { FRICTION_PRESETS } from "@/lib/research/friction";
import type { EventsPage, ResearchTables } from "@/lib/research/export";
import {
  loadPriceHistory,
  useClassActivity,
  usePeriodResults,
  useSessionInstruments,
  useTradingStandings,
} from "@/components/markets/use-market";
import { ManagePlayerButton } from "@/components/host/ManagePlayer";
import type { HostActions, HostModel } from "./model";

/**
 * The host's view of a live paper trading session, for the control screen and
 * the projector alike: the same realtime hooks the other games use (session,
 * players, round, history), the market hooks, and the round's RPCs. RLS lets
 * the host read the whole class; the projector only ever shows aggregates and
 * standings from it.
 */
export function useTradingHost(
  supabase: SupabaseClient,
  session: SessionRow,
): { model: HostModel; actions: HostActions } {
  const router = useRouter();
  const cfg = useMemo(() => tradingConfigOf(session.config), [session.config]);
  const sessionKnobs = useFriction(session.config);
  const knobs = cfg.friction_assignment === "per_player" ? FRICTION_PRESETS.standard : sessionKnobs;
  const allPlayers = usePlayers(supabase, session.id);
  const players = useMemo(() => allPlayers.filter((p) => !p.is_bot && p.is_active), [allPlayers]);
  const loaded = useRound(supabase, session.id, session.current_round);
  const { phase: roundPhase, round, settling } = useRoundPhase(loaded, session.current_round);
  const secs = useCountdown(round?.status === "open" ? round.closes_at : null);
  const phase = tradingPhase(session.status, roundPhase, secs);

  const { instruments } = useSessionInstruments(supabase, session.id);
  const { results: periods } = usePeriodResults(supabase, session.id);
  const revealed = periods.length;
  const standings = useTradingStandings(supabase, session.id, `${revealed}:${players.length}`);
  const history = useSessionHistory(supabase, session.id);
  // Counted live while orders come in, then read once more when trading closes.
  const live = phase === "open" || phase === "closed" || phase === "revealed";
  const conditions = useSessionConditions(supabase, session.id, `${players.length}:${session.current_round}:${phase}`);
  const activity = useClassActivity(supabase, session.id, live, phase === "open" ? 3000 : null, `${session.current_round}:${phase}`);

  const model: HostModel = {
    sessionId: session.id,
    joinCode: session.join_code,
    title: sessionTitle(session),
    status: session.status,
    cfg,
    phase,
    round: session.current_round,
    closesAt: round?.closes_at ?? null,
    secondsLeft: secs,
    roundStatus: round?.status ?? null,
    settling,
    players,
    standings,
    rounds: history.rounds,
    allocations: history.allocations,
    instruments,
    periods,
    activity,
    knobs,
    conditions,
    devData: session.config.data_license === "dev-only",
  };

  const roundStatus = round?.status ?? null;
  const actions = useMemo<HostActions>(() => {
    const sid = session.id;
    const n = session.current_round;
    const err = (r: { error: { message: string } | null }) => (r.error ? r.error.message : null);
    return {
      start: async () => err(await supabase.rpc("start_round", { p_session_id: sid })),
      extend: async (seconds) => err(await supabase.rpc("extend_round", { p_session_id: sid, p_seconds: seconds })),
      async lockAndReveal() {
        if (roundStatus === "open") {
          const locked = await supabase.rpc("lock_round", { p_session_id: sid, p_round_number: n });
          if (locked.error) return locked.error.message;
        }
        return err(
          await supabase.rpc("resolve_round", {
            p_session_id: sid,
            p_round_number: n,
            p_market_override: null,
            p_market_overrides: null,
          }),
        );
      },
      next: async () => err(await supabase.rpc("next_round", { p_session_id: sid })),
      finish: async () => err(await supabase.rpc("finish_session", { p_session_id: sid })),
      async deleteSession() {
        const res = await supabase.rpc("delete_session", { p_session_id: sid });
        if (res.error) return res.error.message;
        router.push("/host");
        return null;
      },
      async loadTruth() {
        const { data, error } = await supabase.rpc("get_trading_truth", { p_session_id: sid });
        return error ? null : ((data as TradingTruth | null) ?? null);
      },
      async loadReveal() {
        const { data, error } = await supabase.rpc("get_trading_reveal", { p_session_id: sid });
        return error ? null : ((data as TradingReveal | null) ?? null);
      },
      loadIndexHistory: () => loadPriceHistory(supabase, sid, 0, revealed),
      async loadResearch() {
        const { data, error } = await supabase.rpc("export_research_data", { p_session_id: sid, p_part: "tables" });
        return error ? error.message : (data as ResearchTables);
      },
      async loadResearchEvents(after) {
        const { data, error } = await supabase.rpc("export_research_data", {
          p_session_id: sid,
          p_part: "events",
          p_after: after,
        });
        return error ? error.message : (data as EventsPage);
      },
      manage: (player) => <ManagePlayerButton supabase={supabase} session={session} player={player} />,
    };
  }, [supabase, session, roundStatus, revealed, router]);

  return { model, actions };
}
