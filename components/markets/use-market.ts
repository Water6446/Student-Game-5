"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClassActivity,
  DailyBar,
  MarketAccountRoundRow,
  MarketAccountRow,
  MarketFillRow,
  MarketLedgerRow,
  MarketOrderRow,
  MarketPeriodResultRow,
  MarketPositionRow,
  MarketSnapshot,
  SessionInstrumentRow,
  TradingStandingRow,
} from "@/lib/markets/db";
import { useLiveRows } from "./use-live-rows";

// One hook per thing a trading screen reads. Tables go through useLiveRows
// (select + realtime, RLS-gated); computed reads go through their RPCs and are
// refetched when `revealed` (the number of revealed periods) moves, because a
// reveal is the only thing that changes them.

/** The session's fake identities: slot, name, ticker, sector, about. Fixed at creation. */
export function useSessionInstruments(supabase: SupabaseClient, sessionId: string) {
  const { rows, loading } = useLiveRows<SessionInstrumentRow>(supabase, {
    table: "session_instruments",
    column: "session_id",
    value: sessionId,
    keyOf: (r) => String(r.slot),
    staticRows: true,
  });
  return { instruments: rows, loading };
}

/** Every revealed period's summary (index return, movers, headlines), live. */
export function usePeriodResults(supabase: SupabaseClient, sessionId: string) {
  const { rows, loading } = useLiveRows<MarketPeriodResultRow>(supabase, {
    table: "market_period_results",
    column: "session_id",
    value: sessionId,
    keyOf: (r) => String(r.round_number),
  });
  return { results: [...rows].sort((a, b) => a.round_number - b.round_number), loading };
}

export function useMyAccount(supabase: SupabaseClient, playerId: string | null) {
  const { rows, loading } = useLiveRows<MarketAccountRow>(supabase, {
    table: "market_accounts",
    column: "player_id",
    value: playerId,
    keyOf: (r) => r.player_id,
  });
  return { account: rows[0] ?? null, loading };
}

export function useMyPositions(supabase: SupabaseClient, playerId: string | null) {
  const { rows } = useLiveRows<MarketPositionRow>(supabase, {
    table: "market_positions",
    column: "player_id",
    value: playerId,
    keyOf: (r) => String(r.slot),
  });
  return rows;
}

export function useMyOrders(supabase: SupabaseClient, playerId: string | null) {
  const { rows, upsert } = useLiveRows<MarketOrderRow>(supabase, {
    table: "market_orders",
    column: "player_id",
    value: playerId,
    keyOf: (r) => r.id,
  });
  return { orders: rows, upsertOrder: upsert };
}

export function useMyFills(supabase: SupabaseClient, playerId: string | null) {
  const { rows } = useLiveRows<MarketFillRow>(supabase, {
    table: "market_fills",
    column: "player_id",
    value: playerId,
    keyOf: (r) => r.id,
  });
  return rows;
}

/** Not in the realtime publication: refetched when a period is revealed. */
export function useMyLedger(supabase: SupabaseClient, playerId: string | null, revealed: number) {
  const { rows } = useLiveRows<MarketLedgerRow>(supabase, {
    table: "market_ledger",
    column: "player_id",
    value: playerId,
    keyOf: (r) => r.id,
    staticRows: true,
    reloadKey: revealed,
  });
  return rows;
}

/** Not in the realtime publication: refetched when a period is revealed. */
export function useMyAccountRounds(supabase: SupabaseClient, playerId: string | null, revealed: number) {
  const { rows, loading } = useLiveRows<MarketAccountRoundRow>(supabase, {
    table: "market_account_rounds",
    column: "player_id",
    value: playerId,
    keyOf: (r) => String(r.round_number),
    staticRows: true,
    reloadKey: revealed,
  });
  return { accountRounds: [...rows].sort((a, b) => a.round_number - b.round_number), loading };
}

/** The market board at the last revealed close. */
export function useMarketSnapshot(supabase: SupabaseClient, sessionId: string, revealed: number) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.rpc("get_market_snapshot", { p_session_id: sessionId }).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      else {
        setError(null);
        setSnapshot(data as MarketSnapshot);
      }
    });
    return () => {
      active = false;
    };
  }, [supabase, sessionId, revealed]);
  return { snapshot, error };
}

/**
 * Standings by account value; a student sees the class only when the host
 * shows it. Refetched when `reloadKey` changes (a reveal, a player joining).
 */
export function useTradingStandings(supabase: SupabaseClient, sessionId: string, reloadKey: unknown) {
  const [standings, setStandings] = useState<TradingStandingRow[] | null>(null);
  useEffect(() => {
    let active = true;
    supabase.rpc("get_trading_standings", { p_session_id: sessionId }).then(({ data }) => {
      if (active && data) {
        setStandings(
          (data as TradingStandingRow[]).map((r) => ({
            ...r,
            nlv: Number(r.nlv),
            sharpe: r.sharpe == null ? null : Number(r.sharpe),
            max_drawdown: Number(r.max_drawdown),
          })),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [supabase, sessionId, reloadKey]);
  return standings;
}

/**
 * What the class is doing this round (aggregates only), while `enabled`:
 * polled every `intervalMs`, or read once when it is null. A change of
 * `reloadKey` reads it again.
 */
export function useClassActivity(
  supabase: SupabaseClient,
  sessionId: string,
  enabled: boolean,
  intervalMs: number | null = 8000,
  reloadKey?: unknown,
) {
  const [activity, setActivity] = useState<ClassActivity | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () =>
      supabase.rpc("get_class_activity", { p_session_id: sessionId }).then(({ data }) => {
        if (active && data) setActivity(data as ClassActivity);
      });
    void load();
    const id = intervalMs ? setInterval(load, intervalMs) : null;
    return () => {
      active = false;
      if (id) clearInterval(id);
    };
  }, [supabase, sessionId, enabled, intervalMs, reloadKey]);
  return enabled ? activity : null;
}

// One instrument's daily history, cached per session, slot and reveal: the
// history only grows when a period is revealed.
const historyCache = new Map<string, Promise<DailyBar[]>>();

export function loadPriceHistory(
  supabase: SupabaseClient,
  sessionId: string,
  slot: number,
  revealed: number,
): Promise<DailyBar[]> {
  const key = `${sessionId}:${slot}:${revealed}`;
  let hit = historyCache.get(key);
  if (!hit) {
    hit = Promise.resolve(
      supabase.rpc("get_price_history", { p_session_id: sessionId, p_slot: slot, p_resolution: "daily" }),
    ).then(({ data, error }) => {
      if (error) {
        historyCache.delete(key);
        throw new Error(error.message);
      }
      return (data ?? []) as DailyBar[];
    });
    historyCache.set(key, hit);
  }
  return hit;
}
