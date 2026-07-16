"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import {
  buildPlayerResults,
  goodCount,
  goodCountMatrix,
  portfolioOutcomeMatrix,
  type PlayerResult,
} from "@/lib/game/results";
import { edgeFraction } from "@/lib/game/counterfactual";
import {
  allPortfolioStrategyOutcomes,
  assetName,
  type PortfolioStrategyKey,
} from "@/lib/game/portfolio";
import { isPortfolio } from "@/lib/game/types";
import { money, ordinal, signedMoney } from "@/lib/game/format";
import { Card } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { Trophy, ArrowLeft, Clover } from "@/components/icons";

export function StudentFinished({
  supabase,
  session,
  me,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
}) {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [pfCf, setPfCf] = useState<Record<PortfolioStrategyKey, number> | null>(null);
  const [pfLuck, setPfLuck] = useState<{ good: number; total: number } | null>(null);

  const portfolio = isPortfolio(session.config);

  useEffect(() => {
    let active = true;

    supabase.rpc("get_my_rank", { p_session_id: session.id }).then(({ data }) => {
      if (!active || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRank({ rank: row.rank, total: row.total });
    });

    // Build my personal counterfactual from my own rounds + allocations (RLS lets
    // a student read rounds in their session and their OWN allocation rows).
    (async () => {
      const { data: roundData } = await supabase
        .from("rounds")
        .select("*")
        .eq("session_id", session.id)
        .order("round_number", { ascending: true });
      const rounds = (roundData as RoundRow[]) ?? [];
      const ids = rounds.map((r) => r.id);
      let allocs: AllocationRow[] = [];
      if (ids.length > 0) {
        const { data: allocData } = await supabase
          .from("allocations")
          .select("*")
          .in("round_id", ids);
        allocs = (allocData as AllocationRow[]) ?? [];
      }
      if (!active) return;
      if (portfolio) {
        const matrix = portfolioOutcomeMatrix(session, rounds, allocs, me.id);
        setPfCf(
          allPortfolioStrategyOutcomes(session.config, session.config.starting_wealth, matrix),
        );
        setPfLuck(goodCountMatrix(matrix));
      } else {
        const [res] = buildPlayerResults(session, [me], rounds, allocs);
        setResult(res ?? null);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase, session, me, portfolio]);

  const cf = result?.counterfactual;
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);

  const topThree = rank ? rank.rank <= 3 : false;

  // how lucky were *my* market draws? (portfolio: across every asset draw)
  const good = portfolio ? pfLuck?.good ?? 0 : result ? goodCount(result.outcomes) : 0;
  const totalOutcomes = portfolio
    ? pfLuck?.total ?? 0
    : result
      ? result.outcomes.length
      : 0;
  const luckPct = totalOutcomes > 0 ? Math.round((good / totalOutcomes) * 100) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-8">
      {topThree ? <Confetti /> : null}
      <Card className="animate-pop-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink bg-brand text-3xl text-ink shadow-card">
          <Trophy />
        </div>
        <h1 className="mt-3 font-display text-3xl font-black uppercase tracking-tight text-ink">
          Game over
        </h1>

        <div className="mt-6 rounded-xl border-2 border-ink bg-gain p-5 text-white shadow-card">
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-white/85">
            Final wealth
          </div>
          <div className="font-mono text-4xl font-black">{money(me.current_wealth)}</div>
        </div>

        {rank ? (
          <div className="mt-4 text-lg text-ink">
            You finished <span className="font-bold text-play">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {luckPct != null ? (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            <Clover className="text-gain" />
            You drew {good}/{totalOutcomes} good {portfolio ? "asset markets" : "markets"} —{" "}
            <span className="font-bold text-gain">{luckPct}% lucky</span>
          </div>
        ) : null}

        {portfolio && pfCf ? (
          <div className="mt-6 text-left">
            <h2 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-ink-subtle">
              How other strategies would have done
            </h2>
            <ul className="space-y-2">
              <CfRow
                label="All safe"
                desc="nothing invested, ever"
                value={pfCf.all_safe}
                actual={me.current_wealth}
              />
              <CfRow
                label="One basket"
                desc={`everything on ${assetName(session.config, 0)} each round`}
                value={pfCf.concentrated}
                actual={me.current_wealth}
              />
              <CfRow
                label="Half & half"
                desc="half safe, half split evenly across assets"
                value={pfCf.half_diversified}
                actual={me.current_wealth}
              />
              <CfRow
                label="Diversified"
                desc="everything invested, split evenly"
                value={pfCf.diversified}
                actual={me.current_wealth}
              />
            </ul>
            <p className="mt-3 text-center text-xs text-ink-subtle">
              Same asset outcomes you faced — only your strategy changes.
            </p>
          </div>
        ) : null}

        {!portfolio && cf ? (
          <div className="mt-6 text-left">
            <h2 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-ink-subtle">
              How other strategies would have done
            </h2>
            <ul className="space-y-2">
              <CfRow
                label="All safe"
                desc="0% at risk each round"
                value={cf.all_safe}
                actual={me.current_wealth}
              />
              <CfRow label={`${edgePct}%`} value={cf.edge} actual={me.current_wealth} />
              <CfRow
                label="50 / 50"
                desc="half at risk each round"
                value={cf.fifty_fifty}
                actual={me.current_wealth}
              />
              <CfRow
                label="All risky"
                desc="everything at risk each round"
                value={cf.all_risky}
                actual={me.current_wealth}
              />
            </ul>
            <p className="mt-3 text-center text-xs text-ink-subtle">
              Same market outcomes you faced — only your strategy changes.
            </p>
          </div>
        ) : null}

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft /> Home
        </Link>
      </Card>
    </main>
  );
}

function CfRow({
  label,
  desc,
  value,
  actual,
}: {
  label: string;
  desc?: string;
  value: number;
  actual: number;
}) {
  const diff = actual - value;
  return (
    <li className="flex items-center justify-between rounded-lg border-2 border-ink bg-paper-2 px-4 py-2">
      <span className="flex flex-col">
        <span className="font-semibold text-ink">{label}</span>
        {desc ? <span className="font-editorial text-xs italic text-ink-subtle">{desc}</span> : null}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-ink">{money(value)}</span>
        <span
          className={`font-mono text-xs ${
            diff > 0 ? "text-gain" : diff < 0 ? "text-loss" : "text-ink-subtle"
          }`}
          title="your actual result vs this strategy"
        >
          (you {signedMoney(diff)})
        </span>
      </span>
    </li>
  );
}
