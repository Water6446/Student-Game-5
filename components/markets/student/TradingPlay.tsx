"use client";

import { useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import type { MarketOrderRow, TradingReveal, TradingTruth } from "@/lib/markets/db";
import { tradingConfigOf } from "@/lib/markets/trading/config";
import { tradingPhase } from "@/lib/markets/trading/phase";
import { accountView, listingsOf, positionViews } from "@/lib/markets/trading/view";
import { useRoundPhase } from "@/components/use-round-phase";
import { useBehaviorLog } from "@/components/use-behavior-log";
import { useCountdown } from "@/components/markets/use-countdown";
import { useMyConditions } from "@/components/markets/use-friction";
import { Banner, Button, PageSkeleton } from "@/components/ui";
import { mayLog } from "@/lib/research/consent";
import { FRICTION_PRESETS } from "@/lib/research/friction";
import {
  loadPriceHistory,
  useClassActivity,
  useMarketSnapshot,
  useMyAccount,
  useMyAccountRounds,
  useMyFills,
  useMyLedger,
  useMyOrders,
  useMyPositions,
  usePeriodResults,
  useSessionInstruments,
  useTradingStandings,
} from "@/components/markets/use-market";
import type { TradingActions, TradingModel } from "./model";
import { TradingApp } from "./TradingApp";

/**
 * The live student screen: reads everything through the market hooks (RLS
 * decides what this student may see), trades through place_order and
 * cancel_order, and hands TradingApp a model and a set of actions. Nothing
 * renders until this student's friction knobs arrive (get_my_conditions), so
 * no one glimpses another condition's screens first.
 */
export function TradingPlay({
  supabase,
  session,
  me,
  round,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow | null;
}) {
  const cfg = useMemo(() => tradingConfigOf(session.config), [session.config]);
  const { conditions, failed: conditionsFailed, retry, setConsent } = useMyConditions(supabase, session.id);
  const knobs = conditions?.knobs ?? FRICTION_PRESETS.standard;
  const { phase: roundPhase, round: liveRound } = useRoundPhase(round, session.current_round);
  const secs = useCountdown(liveRound?.status === "open" ? liveRound.closes_at : null);
  const phase = tradingPhase(session.status, roundPhase, secs);

  const { instruments, loading: instrumentsLoading } = useSessionInstruments(supabase, session.id);
  const { results: periods } = usePeriodResults(supabase, session.id);
  const revealed = periods.length;
  const { snapshot } = useMarketSnapshot(supabase, session.id, revealed);
  const { account } = useMyAccount(supabase, me.id);
  const positions = useMyPositions(supabase, me.id);
  const { orders, upsertOrder } = useMyOrders(supabase, me.id);
  const fills = useMyFills(supabase, me.id);
  const ledger = useMyLedger(supabase, me.id, revealed);
  const { accountRounds } = useMyAccountRounds(supabase, me.id, revealed);
  const standings = useTradingStandings(supabase, session.id, revealed);
  const activity = useClassActivity(supabase, session.id, knobs.show_class_popular && phase === "open");
  // Research mode logs only with consent; nothing is queued before the answer.
  const log = useBehaviorLog(
    supabase,
    session.id,
    conditions != null && mayLog(conditions.researchMode, conditions.consent),
  );

  const listings = useMemo(() => listingsOf(instruments, snapshot), [instruments, snapshot]);

  const model: TradingModel = {
    sessionId: session.id,
    cfg,
    phase,
    round: session.current_round,
    closesAt: liveRound?.closes_at ?? null,
    me: { id: me.id, name: me.display_name },
    asOf: snapshot?.as_of ?? null,
    changeBasis: snapshot?.change_basis ?? "year",
    listings,
    account: accountView(account, positions, listings, orders, cfg),
    positions: positionViews(positions, listings),
    rawPositions: positions,
    orders,
    fills,
    ledger,
    accountRounds,
    periods,
    standings,
    activity,
    knobs,
    research: { mode: conditions?.researchMode ?? cfg.research_mode, consent: conditions?.consent ?? null },
    lastOrderAt: account?.last_order_at ?? null,
    ready: !instrumentsLoading && snapshot != null,
  };

  const actions = useMemo<TradingActions>(
    () => ({
      async placeOrder(order, context) {
        const { data, error } = await supabase.rpc("place_order", {
          p_session_id: session.id,
          p_order: { ...order, context },
        });
        if (error) return error.message;
        if (data) upsertOrder(data as MarketOrderRow);
        return null;
      },
      async cancelOrder(orderId) {
        const { data, error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
        if (error) return error.message;
        if (data) upsertOrder(data as MarketOrderRow);
        return null;
      },
      async rename(name) {
        const { error } = await supabase.rpc("set_my_display_name", {
          p_session_id: session.id,
          p_display_name: name,
        });
        return error ? error.message : null;
      },
      loadHistory: (slot) => loadPriceHistory(supabase, session.id, slot, revealed),
      async loadTruth() {
        const { data, error } = await supabase.rpc("get_trading_truth", { p_session_id: session.id });
        return error ? null : ((data as TradingTruth | null) ?? null);
      },
      async loadReveal() {
        const { data, error } = await supabase.rpc("get_trading_reveal", { p_session_id: session.id });
        return error ? null : ((data as TradingReveal | null) ?? null);
      },
      answerConsent: setConsent,
      log,
    }),
    [supabase, session.id, revealed, upsertOrder, setConsent, log],
  );

  if (!conditions) {
    return conditionsFailed ? (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <Banner kind="error">Couldn&apos;t load your game. Check your connection and try again.</Banner>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </main>
    ) : (
      <PageSkeleton label="Loading your game" width="max-w-md" />
    );
  }

  return <TradingApp model={model} actions={actions} />;
}
