"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { isPortfolio, type MarketOutcome } from "@/lib/game/types";
import { riskyMultiplier } from "@/lib/game/math";
import { assetName, assetPayoffMode, numAssets } from "@/lib/game/portfolio";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useRoundPhase } from "@/components/use-round-phase";
import { AllocationInput } from "@/components/student/AllocationInput";
import { PortfolioAllocationInput } from "@/components/student/PortfolioAllocationInput";
import { money, signedMoney, ordinal } from "@/lib/game/format";
import { condenseRanked } from "@/lib/game/condense";
import { Banner, Button, Card } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, Lock, Check } from "@/components/icons";

export function StudentRound({
  supabase,
  session,
  me,
  round,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
}) {
  // What to DISPLAY, not the raw row status: hides round N-1 while the new round
  // loads and swallows the transient lock of the host's one-click auto reveal.
  const { phase, round: liveRound } = useRoundPhase(round, session.current_round);
  const myAllocs = useRoundAllocations(supabase, liveRound?.id ?? null);
  const mine = myAllocs.find((a) => a.player_id === me.id) ?? null;
  const portfolio = isPortfolio(session.config);
  const n = numAssets(session.config);

  const [risky, setRisky] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<(number | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each new round opens blank — never pre-filled and never carrying over the
  // previous round's choice. Students must deliberately enter an amount every
  // round (even to repeat the same number), so the fields stay empty until they do.
  useEffect(() => {
    setRisky(null);
    setAmounts(Array.from({ length: n }, () => null));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, n]);

  // resolve_round writes an allocation row for EVERY active player, so the
  // reveal always has a result to show — but the rounds UPDATE can land before
  // ours does, and rendering then would headline a $0 "Flat round" for a player
  // who actually gained. Wait for our row, with a bound so a dropped realtime
  // message can't strand the student on the waiting card.
  const revealPending = phase === "revealed" && mine?.resulting_wealth == null;
  const [revealTimedOut, setRevealTimedOut] = useState(false);
  useEffect(() => {
    if (!revealPending) {
      setRevealTimedOut(false);
      return;
    }
    const t = setTimeout(() => setRevealTimedOut(true), 1500);
    return () => clearTimeout(t);
  }, [revealPending, liveRound?.id]);

  const touched = portfolio ? amounts.some((a) => a !== null) : risky !== null;

  async function submit() {
    if (!touched || !liveRound) return;
    setBusy(true);
    setError(null);
    // All writes go through SECURITY DEFINER RPCs. The server validates the
    // round is open, that this is our own player, bounds every amount, and
    // derives the safe remainder. Students have no direct write grant.
    const { error } = portfolio
      ? await supabase.rpc("submit_portfolio_allocation", {
          p_round_id: liveRound.id,
          p_amounts: amounts.map((a) => Math.round((a ?? 0) * 100) / 100),
        })
      : await supabase.rpc("submit_allocation", {
          p_round_id: liveRound.id,
          p_risky_amount: Math.round((risky ?? 0) * 100) / 100,
        });
    setBusy(false);
    if (error) setError(error.message);
  }

  if (phase === "open" && liveRound) {
    return (
      <Shell wealth={me.current_wealth} roundNumber={session.current_round} session={session}>
        {portfolio ? (
          <PortfolioAllocationInput
            config={session.config}
            wealth={me.current_wealth}
            amounts={amounts}
            onChange={setAmounts}
            disabled={busy}
          />
        ) : (
          <AllocationInput
            wealth={me.current_wealth}
            risky={risky}
            onChange={setRisky}
            disabled={busy}
          />
        )}
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button variant="gold" onClick={submit} disabled={busy || !touched} className="w-full text-lg shadow-pop">
          {busy ? "Saving…" : mine ? "Update allocation" : portfolio ? "Lock in my portfolio" : "Lock in my bet"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))}{" "}
            {portfolio ? "invested" : "risky"} — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center font-editorial text-sm italic text-ink-subtle">
            {portfolio
              ? "Spread your wealth across the assets, then lock it in."
              : "Choose how much to put at risk, then lock it in."}
          </p>
        )}
      </Shell>
    );
  }

  // "loading" shares the locked card: it is the honest "something is happening"
  // state and is what the student was already looking at.
  if (phase !== "revealed" || !liveRound || (revealPending && !revealTimedOut)) {
    return (
      <Shell wealth={me.current_wealth} roundNumber={session.current_round} session={session}>
        <div className="rounded-xl border-2 border-ink bg-brand-soft p-5 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
            <Lock /> Nice. Now we wait.
          </div>
          <p className="mt-1 font-editorial text-sm italic text-ink-muted">Waiting for the reveal…</p>
          {/* While the next round is still loading our allocations are empty,
              which is not the same thing as not having submitted — say nothing
              rather than accuse the student of missing the round. */}
          {phase === "loading" ? null : mine ? (
            <p className="mt-3 font-mono text-ink">
              {portfolio
                ? `Invested ${money(Number(mine.risky_amount))} across ${n} assets · safe ${money(Number(mine.safe_amount))}`
                : `You risked ${money(Number(mine.risky_amount))} · safe ${money(Number(mine.safe_amount))}`}
            </p>
          ) : (
            <p className="mt-3 font-editorial text-sm italic text-ink-subtle">
              You didn&apos;t submit — you&apos;ll default to all-safe.
            </p>
          )}
          <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-3 w-3 animate-pulse-soft rounded-full border-2 border-ink bg-brand"
                style={{ animationDelay: `${i * 0.25}s` }}
              />
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  return <Reveal supabase={supabase} session={session} me={me} round={liveRound} mine={mine} />;
}

function Shell({
  children,
  wealth,
  roundNumber,
  session,
}: {
  children: React.ReactNode;
  wealth: number;
  /** always the session's current round — never a stale row's number */
  roundNumber: number;
  session: SessionRow;
}) {
  // hide the odds line when assets have custom per-asset odds (one number
  // can't summarize them)
  const customOdds =
    isPortfolio(session.config) &&
    (session.config.assets ?? []).some((a) => a?.good_prob != null);
  const showOdds =
    session.config.show_odds_to_students && session.config.market_mode === "auto" && !customOdds;
  const goodPct = Math.round((session.config.good_prob ?? 0.6) * 100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-8">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full border-2 border-ink bg-ink px-3 py-1 font-mono text-sm font-bold uppercase text-paper">
          Round {roundNumber} / {session.config.num_rounds}
        </span>
        <span className="text-right">
          <span className="block font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            Your wealth
          </span>
          <span className="font-mono text-xl font-bold text-ink">{money(wealth)}</span>
        </span>
      </div>
      {showOdds ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-ink bg-surface px-4 py-2 text-sm shadow-card">
          <span className="font-editorial italic text-ink-muted">
            {isPortfolio(session.config) ? "Each asset looks like" : "The market looks like"}
          </span>
          <span className="flex items-center gap-2 font-mono font-semibold">
            <span className="inline-flex items-center gap-0.5 text-gain">
              <ArrowUp /> {goodPct}%
            </span>
            <span className="text-line-strong">·</span>
            <span className="inline-flex items-center gap-0.5 text-loss">
              <ArrowDown /> {100 - goodPct}%
            </span>
          </span>
        </div>
      ) : null}
      <Card className="animate-pop-in space-y-5">{children}</Card>
    </main>
  );
}

function Reveal({
  supabase,
  session,
  me,
  round,
  mine,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
  mine: ReturnType<typeof useRoundAllocations>[number] | null;
}) {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);

  const portfolio = isPortfolio(session.config);
  // per-player outcome (independent scope) falls back to the shared round outcome
  const outcome = mine?.market_outcome ?? round.market_outcome;
  // portfolio: this player's per-asset outcomes (own draws or the class-wide ones)
  const assetOuts: MarketOutcome[] = portfolio
    ? mine?.asset_outcomes ?? round.market_outcomes ?? []
    : [];
  const breakdown = mine?.risky_breakdown ?? [];
  const resulting = mine?.resulting_wealth != null ? Number(mine.resulting_wealth) : me.current_wealth;
  const before = mine ? Number(mine.safe_amount) + Number(mine.risky_amount) : me.current_wealth;
  const delta = resulting - before;

  useEffect(() => {
    let active = true;
    supabase.rpc("get_my_rank", { p_session_id: session.id }).then(({ data }) => {
      if (!active || !data) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setRank({ rank: row.rank, total: row.total });
    });
    if (session.config.show_full_leaderboard_to_students) {
      supabase.rpc("get_leaderboard", { p_session_id: session.id }).then(({ data }) => {
        if (active && data) setBoard(data as LeaderboardRow[]);
      });
    }
    return () => {
      active = false;
    };
  }, [supabase, session.id, session.config.show_full_leaderboard_to_students, round.id]);

  // portfolio has no single market — the header reads off YOUR round result
  const good = portfolio ? delta >= 0 : outcome === "good";
  // Celebrate a personal win (gained money this round).
  const celebrate = delta > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-8">
      {celebrate ? <Confetti /> : null}
      <div className="mb-4 text-center text-sm font-semibold text-ink-muted">
        Round {round.round_number} / {session.config.num_rounds}
      </div>
      <Card className={`space-y-5 text-center ${good ? "animate-pop-in" : "animate-shake"}`}>
        <div
          className={`-mx-6 -mt-6 mb-1 flex items-center justify-center gap-2 border-b-2 border-ink px-6 py-4 font-display text-3xl font-black uppercase tracking-tight text-white ${
            portfolio
              ? delta > 0
                ? "bg-gain"
                : delta < 0
                  ? "bg-loss"
                  : "bg-ink"
              : good
                ? "bg-gain"
                : "bg-loss"
          }`}
        >
          {portfolio ? (
            <>
              {delta > 0 ? <ArrowUp /> : delta < 0 ? <ArrowDown /> : null}
              {delta > 0 ? "Up!" : delta < 0 ? "Down" : "Flat round"}
            </>
          ) : (
            <>
              {good ? <ArrowUp /> : <ArrowDown />}
              {good ? "Good!" : "Down"}
            </>
          )}
        </div>

        {portfolio && assetOuts.length > 0 ? (
          <ul className="space-y-1.5 text-left">
            {assetOuts.map((o, i) => {
              const amt = Number(breakdown[i] ?? 0);
              const mult = riskyMultiplier(assetPayoffMode(session.config, i), o);
              const goodAsset = o === "good";
              return (
                <li
                  key={i}
                  className={`flex items-center justify-between rounded-lg border-2 border-ink px-3 py-1.5 ${
                    goodAsset ? "bg-gain-soft" : "bg-loss-soft"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    <span className={goodAsset ? "text-gain" : "text-loss"}>
                      {goodAsset ? <ArrowUp /> : <ArrowDown />}
                    </span>
                    {assetName(session.config, i)}
                  </span>
                  <span className="font-mono text-sm text-ink">
                    {amt > 0 ? (
                      <>
                        {money(amt)} <span className="text-ink-subtle">to</span>{" "}
                        <span className={goodAsset ? "font-bold text-gain" : "font-bold text-loss"}>
                          {money(amt * mult)}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-subtle">not held</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div>
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            New wealth
          </div>
          <div className="animate-count-pop font-mono text-5xl font-black text-ink">
            {money(resulting)}
          </div>
          <div
            className={`mt-2 inline-block rounded-full border-2 border-ink px-3 py-0.5 font-mono text-lg font-bold text-white ${
              delta > 0 ? "bg-gain" : delta < 0 ? "bg-loss" : "bg-ink-subtle"
            }`}
          >
            {signedMoney(delta)} this round
          </div>
        </div>

        {rank ? (
          <div className="rounded-xl border-2 border-ink bg-brand-soft py-3 text-lg font-semibold text-ink shadow-card">
            You&apos;re <span className="font-display font-black">{ordinal(rank.rank)}</span> of{" "}
            {rank.total}
          </div>
        ) : null}

        {board ? <StudentBoard board={board} /> : null}

        <p className="flex items-center justify-center gap-2 text-sm text-ink-subtle">
          <Check className="text-gain" /> Waiting for the next round…
        </p>
      </Card>
    </main>
  );
}

/**
 * The post-reveal leaderboard. Big classes condense to top 5 + bottom 3 with an
 * expander for the middle; the student's own row always stays visible. Rank
 * numbers come from the server's `rank` field, so they never renumber across
 * the gap.
 */
function StudentBoard({ board }: { board: LeaderboardRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const myIdx = board.findIndex((r) => r.is_me);
  const items = showAll
    ? condenseRanked(board, { threshold: Infinity })
    : condenseRanked(board, { keepIndices: myIdx >= 0 ? [myIdx] : [] });

  return (
    <div>
      <ol className="space-y-1 text-left">
        {items.map((c, idx) => {
          if (c.kind === "gap") {
            return (
              <li key={`gap-${idx}`} className="text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="font-editorial text-xs italic text-ink-subtle transition hover:text-ink"
                >
                  +{c.hidden} more ▾
                </button>
              </li>
            );
          }
          const r = c.item;
          return (
            <li
              key={r.player_id}
              className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${
                r.is_me
                  ? "bg-play-soft font-semibold text-ink ring-1 ring-play/30"
                  : "bg-paper-2 text-ink-muted"
              }`}
            >
              <span>
                {r.rank}. {r.display_name}
                {r.is_me ? " (you)" : ""}
              </span>
              <span className="font-mono">{money(Number(r.current_wealth))}</span>
            </li>
          );
        })}
      </ol>
      {showAll && board.length > 10 ? (
        <p className="mt-1 text-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="font-editorial text-xs italic text-ink-subtle transition hover:text-ink"
          >
            Show fewer ▴
          </button>
        </p>
      ) : null}
    </div>
  );
}
