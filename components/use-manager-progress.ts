"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundRow } from "@/lib/game/db";
import {
  managerRunningStats,
  type MarketSummary,
  type ReturnSummary,
} from "@/lib/game/results";

/** One of my allocation rows, reduced to what the running figures need. */
interface Row {
  round_id: string;
  resulting_wealth: number | null;
  risky_amount: number;
  safe_amount: number;
}

export interface ManagerProgress {
  /** running Sharpe over the years resolved so far; null under 2 years */
  sharpe: number | null;
  /** the index: this year's return and the annualized rate to date */
  market: MarketSummary | null;
  /** my own return in the same units as `market` */
  player: ReturnSummary | null;
  /** GROSS manager returns per revealed year, oldest first — what rolls the
   *  prospectus track records forward */
  managerReturns: (number[] | null)[];
  /** my wealth after each resolved year, oldest first — the reveal appends
   *  its own year to this and re-derives the figures above */
  wealthByYear: number[];
  /** the market's return each resolved year, oldest first */
  marketReturns: number[];
}

const EMPTY: ManagerProgress = {
  sharpe: null,
  market: null,
  player: null,
  managerReturns: [],
  wealthByYear: [],
  marketReturns: [],
};

/**
 * Everything the manager game needs to show a student how they are doing
 * WHILE the game runs, rather than only at the end: a running Sharpe, and
 * their return next to the index's in the same units.
 *
 * Covers every resolved year EXCEPT the live one. The rows are fetched when a
 * year opens, so the live year's result is never in them; excluding it
 * outright also keeps a mid-reveal reload (whose fetch does see it) from
 * counting it twice once the reveal appends it.
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
          .select("round_id, resulting_wealth, risky_amount, safe_amount")
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

    const revealed = rounds.filter((r) => r.status === "revealed" && r.id !== liveRoundId);
    const byRound = new Map(rows.map((a) => [a.round_id, a]));

    // Wealth after each resolved year, carrying forward across any year this
    // player has no row for — the same series buildPlayerResults uses, so the
    // running Sharpe and the final one are the same number.
    const wealthByYear: number[] = [];
    let last = startWealth;
    for (const r of revealed) {
      const a = byRound.get(r.id);
      if (a?.resulting_wealth != null) last = Number(a.resulting_wealth);
      wealthByYear.push(last);
    }

    const marketReturns = revealed
      .filter((r) => r.market_return != null)
      .map((r) => Number(r.market_return));

    const lastRound = revealed[revealed.length - 1];
    const lastAlloc = lastRound ? byRound.get(lastRound.id) : undefined;
    let latest: number | null = null;
    if (lastAlloc?.resulting_wealth != null) {
      const before = Number(lastAlloc.risky_amount) + Number(lastAlloc.safe_amount);
      if (before > 0) latest = Number(lastAlloc.resulting_wealth) / before - 1;
    }

    return {
      ...managerRunningStats(startWealth, riskFreeRate, wealthByYear, marketReturns, latest),
      managerReturns: revealed.map((r) => r.manager_returns ?? null),
      wealthByYear,
      marketReturns,
    };
  }, [enabled, rounds, rows, startWealth, riskFreeRate, liveRoundId]);
}
