"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import {
  buildPlayerResults,
  expectedGoodRate,
  goodCount,
  luckStats,
  type PlayerResult,
} from "@/lib/game/results";
import { edgeFraction } from "@/lib/game/counterfactual";
import { assetName } from "@/lib/game/portfolio";
import { isManager, isPortfolio } from "@/lib/game/types";
import { indexSeries } from "@/lib/game/manager";
import { sumFees } from "@/components/FeeCounter";
import { money, ordinal, sharpeText, signedMoney, signedPct } from "@/lib/game/format";
import { Card } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { ManagerReveal } from "@/components/ManagerReveal";
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
  const [managerSummary, setManagerSummary] = useState<{
    indexWealth: number;
    fees: number;
  } | null>(null);
  // Kept in state only for the manager reveal, which needs market_return and
  // manager_returns to put "delivered" next to each true alpha.
  const [managerRounds, setManagerRounds] = useState<RoundRow[] | null>(null);

  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);

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
      // one path for both games: PlayerResult carries the counterfactuals,
      // flattened outcomes, wealth series and the derived return/Sharpe stats
      const [res] = buildPlayerResults(session, [me], rounds, allocs);
      setResult(res ?? null);

      // The punchline of the module: what the index did with no fees, and what
      // the manager fees actually cost. Both come from rows the student can
      // already read — no truth needed.
      if (isManager(session.config)) {
        const market = rounds
          .filter((r) => r.status === "revealed" && r.market_return != null)
          .sort((a, b) => a.round_number - b.round_number)
          .map((r) => Number(r.market_return));
        const series = indexSeries(session.config.starting_wealth, market);
        setManagerRounds(rounds);
        setManagerSummary({
          indexWealth: series.length > 0 ? series[series.length - 1] : session.config.starting_wealth,
          fees: sumFees(allocs.filter((a) => a.player_id === me.id)),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase, session, me]);

  const cf = result?.counterfactual;
  const pfCf = result?.portfolioCounterfactual;
  const edgePct = Math.round(edgeFraction(session.config.good_prob ?? 0.6) * 100);

  const topThree = rank ? rank.rank <= 3 : false;

  // how lucky were *my* draws vs the expected odds? (portfolio: per asset draw)
  const expected = expectedGoodRate(session.config);
  const myLuck = result
    ? luckStats(goodCount(result.outcomes), result.outcomes.length, expected)
    : null;

  return (
    <main
      className={`mx-auto flex min-h-dvh flex-col justify-center px-6 py-8 ${
        manager ? "max-w-2xl" : "max-w-lg"
      }`}
    >
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
          {result?.totalReturn != null ? (
            <div className="mt-1 font-mono text-sm font-bold text-white/90">
              {signedPct(result.totalReturn * 100)} total
              {result.perRoundReturn != null
                ? ` · ${signedPct(result.perRoundReturn * 100, 1)}/round`
                : ""}
            </div>
          ) : null}
        </div>

        {result ? (
          <div className="mt-3 text-sm text-ink-muted">
            Sharpe ratio:{" "}
            <span className="font-mono font-bold text-ink">
              {sharpeText(result.sharpe)}
            </span>
            <div className="font-editorial text-xs italic text-ink-subtle">
              return per unit of risk taken{result.sharpe == null ? " (— = no risk)" : ""}
            </div>
          </div>
        ) : null}

        {rank ? (
          <div className="mt-4 text-lg text-ink">
            You finished <span className="font-bold text-play">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {myLuck ? (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            <Clover className={myLuck.delta >= 0 ? "text-gain" : "text-loss"} />
            You drew {myLuck.good}/{myLuck.total} good ·{" "}
            <span
              className={`font-bold ${
                myLuck.delta > 0 ? "text-gain" : myLuck.delta < 0 ? "text-loss" : "text-ink-muted"
              }`}
              title={`GOOD-draw rate vs the expected ${Math.round(expected * 100)}%`}
            >
              {signedPct(myLuck.delta * 100)} vs {Math.round(expected * 100)}% expected
            </span>
          </div>
        ) : null}

        {/* The punchline: your wealth, the index you could not buy, and the
            gap — with the fee total sitting inside it. */}
        {manager && managerSummary ? (
          <div className="mt-6 rounded-2xl border-2 border-ink bg-surface p-4 text-left shadow-lift">
            <dl className="space-y-1 font-mono text-sm">
              <SumRow label="Final wealth" value={money(me.current_wealth)} />
              <SumRow
                label="If you had just held the index"
                value={money(managerSummary.indexWealth)}
              />
              <div className="!mt-2 border-t-2 border-ink pt-2">
                <SumRow
                  label="You paid in fees"
                  value={money(managerSummary.fees)}
                  tone="loss"
                />
                <SumRow
                  label={
                    me.current_wealth >= managerSummary.indexWealth
                      ? "You beat the index by"
                      : "You trailed the index by"
                  }
                  value={money(Math.abs(me.current_wealth - managerSummary.indexWealth))}
                  tone={me.current_wealth >= managerSummary.indexWealth ? "gain" : "loss"}
                  bold
                />
              </div>
            </dl>
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

        {/* The other half of the module's payoff: the fee/index card above says
            what it cost you, this says who was actually worth hiring. Students
            may read it only once the session is finished — get_manager_truth
            enforces that server-side, so this is not a client-side secret. */}
        {manager && managerRounds ? (
          <ManagerReveal
            supabase={supabase}
            session={session}
            rounds={managerRounds}
            className="mt-6 text-left"
          />
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

/** One line of the index comparison: label left, money right. */
function SumRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss";
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`shrink-0 ${bold ? "font-black" : "font-bold"} ${
          tone === "loss" ? "text-loss" : tone === "gain" ? "text-gain" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
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
