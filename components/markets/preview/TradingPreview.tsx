"use client";

import { useCallback, useMemo, useState } from "react";
import type { MarketOrderRow } from "@/lib/markets/db";
import { FRICTION_PRESETS } from "@/lib/research/friction";
import type { FrictionProfile } from "@/lib/game/types";
import {
  accountView,
  listingsOf,
  positionViews,
} from "@/lib/markets/trading/view";
import { checkOrder, marginParams } from "@/lib/markets/trading/orders";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import { TradingApp } from "@/components/markets/student/TradingApp";
import type {
  TradingActions,
  TradingModel,
} from "@/components/markets/student/model";
import { PREVIEW_ROUNDS, previewConfig, previewWorld } from "./fixtures";
import { PreviewBar } from "./PreviewBar";
import { previewReveal } from "./reveal-fixture";

/**
 * DEV ONLY: the student screens on a synthetic session, one link per phase.
 * Orders placed here are checked by the place_order mirror and kept in memory;
 * nothing reaches a database.
 */
export function TradingPreview({
  phase,
  round,
  friction = "standard",
  research = false,
  simulated = false,
}: {
  phase: TradingPhase;
  round: number;
  friction?: FrictionProfile;
  research?: boolean;
  simulated?: boolean;
}) {
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
  const world = useMemo(
    () =>
      previewWorld(revealed, phase === "open" || phase === "closed" ? r : null),
    [revealed, phase, r],
  );
  const [extra, setExtra] = useState<MarketOrderRow[]>([]);
  const [canceled, setCanceled] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState<boolean | null>(null);
  const [lastOrderAt, setLastOrderAt] = useState<string | null>(null);
  const [closesAt] = useState(() =>
    new Date(Date.now() + (phase === "closed" ? -1000 : 85_000)).toISOString(),
  );

  const orders = useMemo(
    () =>
      [...world.orders, ...extra].map((o) =>
        canceled.has(o.id)
          ? { ...o, status: "canceled" as const, reserved: 0 }
          : o,
      ),
    [world.orders, extra, canceled],
  );
  const listings = useMemo(
    () => listingsOf(world.instruments, world.snapshot),
    [world],
  );
  const cfg = useMemo(() => previewConfig(simulated), [simulated]);
  const account = accountView(
    world.account,
    world.positions,
    listings,
    orders,
    cfg,
  );

  const model: TradingModel = {
    sessionId: `preview-${phase}-${r}`,
    cfg,
    phase,
    round: current,
    closesAt: phase === "open" || phase === "closed" ? closesAt : null,
    me: { id: "preview-me", name: "Preview Student" },
    asOf: world.snapshot.as_of,
    changeBasis: world.snapshot.change_basis,
    listings,
    account,
    positions: positionViews(world.positions, listings),
    rawPositions: world.positions,
    orders,
    fills: world.fills,
    ledger: world.ledger,
    accountRounds: world.accountRounds,
    periods: world.periods,
    standings: world.standings,
    activity:
      phase === "open"
        ? {
            round: current,
            players: 10,
            players_with_orders: 6,
            orders: 9,
            most_bought: [
              { slot: 3, players: 4 },
              { slot: 1, players: 2 },
            ],
          }
        : null,
    knobs: FRICTION_PRESETS[friction],
    research: { mode: research, consent },
    lastOrderAt,
    ready: true,
  };

  const log = useCallback<TradingActions["log"]>((type, payload) => {
    // eslint-disable-next-line no-console
    console.debug("[behavior]", type, payload ?? {});
  }, []);

  const actions: TradingActions = useMemo(
    () => ({
      async placeOrder(o, context) {
        const last = listings.find((l) => l.slot === o.slot)?.quote?.last ?? 0;
        const pos =
          world.positions.find((p) => p.slot === o.slot)?.quantity ?? 0;
        const check = checkOrder(
          {
            side: o.side,
            type: o.order_type,
            quantity: o.quantity,
            notional: o.notional,
            limit: o.limit_price,
            stop: o.stop_price,
          },
          {
            last,
            position: pos,
            pendingClose: 0,
            marks: {
              lmv: account.longValue,
              smv: account.shortValue,
              equity: account.cash + account.longValue - account.shortValue,
            },
            openReserves: account.reserved,
            params: marginParams(cfg),
            shortingEnabled: cfg.shorting_enabled,
            frozen: account.frozen,
          },
        );
        if (!check.ok) return check.reason;
        setLastOrderAt(new Date().toISOString());
        setExtra((xs) => [
          ...xs,
          {
            id: `x${xs.length + 1}`,
            session_id: "preview-session",
            player_id: "preview-me",
            slot: o.slot,
            side: o.side,
            order_type: o.order_type,
            quantity: o.notional != null ? null : check.quantity,
            notional: o.notional,
            limit_price: o.limit_price,
            stop_price: o.stop_price,
            tif: o.tif,
            status: "open",
            reject_reason: null,
            triggered: false,
            reserved: check.reserve,
            placed_round: current,
            placed_at: new Date().toISOString(),
            closed_at: null,
            client_ref: o.client_ref,
            context,
          },
        ]);
        return null;
      },
      async cancelOrder(id) {
        setCanceled((s) => new Set(s).add(id));
        return null;
      },
      async rename() {
        return null;
      },
      loadHistory: async (slot) => world.history(slot),
      loadTruth: async () => world.truth,
      loadReveal: async () => previewReveal(world, false),
      async answerConsent(yes) {
        setConsent(yes);
        return null;
      },
      log,
    }),
    [listings, world, account, cfg, current, log],
  );

  return (
    <>
      <PreviewBar
        view="student"
        phase={phase}
        round={r}
        student={{ friction, research }}
      />
      <TradingApp key={`${phase}-${r}`} model={model} actions={actions} />
    </>
  );
}
