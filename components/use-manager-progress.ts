"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundRow } from "@/lib/game/db";
import {
  perRoundReturns,
  returnSummary,
  sharpeRatio,
  type ReturnSummary,
} from "@/lib/game/results";

/** One of my allocation rows, reduced to what the running figures need. */
interface Row {
  round_id: string;
  fees_paid: number | null;
  resulting_wealth: number | null;
  risky_amount: number;
  safe_amount: number;
}

export interface ManagerProgress {
  /** fees across every year EXCEPT the live one, so a reveal can add its own
   *  year's fee without double-counting on a mid-reveal reload */
  feesTotal: number;
  /** running Sharpe over the years resolved so far; null under 2 years */
  sharpe: number | null;
  /** the index: this year's return and the annualized rate to date */
  market: { latest: number; annualized: number; years: number } | null;
  /** my own return in the same units as `market` */
  player: ReturnSummary | null;
  /** GROSS manager returns per revealed year, oldest first — what rolls the
   *  prospectus track records forward */
  managerReturns: (number[] | null)[];
}

const EMPTY: ManagerProgress = {
  feesTotal: 0,
  sharpe: null,
  market: null,
  player: null,
  managerReturns: [],
};

/**
 * Everything the manager game needs to show a student how they are doing
 * WHILE the game runs, rather than only at the end: fees so far, a running
 * Sharpe, and their return next to the index's in the same units.
 *
 * Reads rows the student can already see — their own allocations and the
 * session's rounds (`market_return` is public; it is what the index bot
 * compounds). Nothing here touches manager truth.
 */
export function useManagerProgress(
  supabase: SupabaseClient,
  sessionId: string,
  startWealth: number,
  /** excess return is measured against this — buildPlayerResults reads the same
   *  config value, so the running Sharpe and the final one agree */
  riskFreeRate: number,
  playerId: string,
  liveRoundId: string | null,
  enabled: boolean,
): ManagerProgress {
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      const [{ data: roundData }, { data: allocData }] = await Promise.all([
        supabase
          .from("rounds")
          .select("id, round_number, status, market_return, manager_returns")
          .eq("session_id", sessionId)
          .order("round_number", { ascending: true }),
        supabase
          .from("allocations")
          .select("round_id, fees_paid, resulting_wealth, risky_amount, safe_amount")
          .eq("player_id", playerId),
      ]);
      if (!active) return;
      setRounds((roundData as RoundRow[]) ?? []);
      setRows((allocData as Row[]) ?? []);
    })();
    return () => {
      active = false;
    };
    // liveRoundId advances once per year, which is exactly when these refresh
  }, [supabase, sessionId, playerId, liveRoundId, enabled]);

  return useMemo(() => {
    if (!enabled || !rounds || !rows) return EMPTY;

    const revealed = rounds.filter((r) => r.status === "revealed");
    const byRound = new Map(rows.map((a) => [a.round_id, a]));

    // Wealth after each resolved year, carrying forward across any year this
    // player has no row for — the same series buildPlayerResults uses, so the
    // running Sharpe and the final one are the same number.
    const wealthByRound: number[] = [];
    let last = startWealth;
    for (const r of revealed) {
      const a = byRound.get(r.id);
      if (a?.resulting_wealth != null) last = Number(a.resulting_wealth);
      wealthByRound.push(last);
    }

    const market = (() => {
      const withReturn = revealed.filter((r) => r.market_return != null);
      if (withReturn.length === 0) return null;
      const cum = withReturn.reduce((acc, r) => acc * (1 + Number(r.market_return)), 1);
      return {
        latest: Number(withReturn[withReturn.length - 1].market_return),
        annualized: Math.pow(Math.max(cum, 0), 1 / withReturn.length) - 1,
        years: withReturn.length,
      };
    })();

    const lastRound = revealed[revealed.length - 1];
    const lastAlloc = lastRound ? byRound.get(lastRound.id) : undefined;
    let latest: number | null = null;
    if (lastAlloc?.resulting_wealth != null) {
      const before = Number(lastAlloc.risky_amount) + Number(lastAlloc.safe_amount);
      if (before > 0) latest = Number(lastAlloc.resulting_wealth) / before - 1;
    }

    return {
      feesTotal: rows
        .filter((a) => a.round_id !== liveRoundId)
        .reduce((s, a) => s + (a.fees_paid == null ? 0 : Number(a.fees_paid)), 0),
      sharpe: sharpeRatio(perRoundReturns(startWealth, wealthByRound), riskFreeRate),
      market,
      player:
        revealed.length > 0
          ? returnSummary(startWealth, last, revealed.length, latest)
          : null,
      managerReturns: revealed.map((r) => r.manager_returns ?? null),
    };
  }, [enabled, rounds, rows, startWealth, riskFreeRate, liveRoundId]);
}
