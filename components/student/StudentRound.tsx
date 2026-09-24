"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { isManager, isPortfolio, type MarketOutcome } from "@/lib/game/types";
import { riskyMultiplier, roundCents } from "@/lib/game/math";
import { assetName, assetPayoffMode, numAssets } from "@/lib/game/portfolio";
import { amountsFromPercents, numManagers } from "@/lib/game/manager";
import { useRoundAllocations } from "@/components/use-round-allocations";
import { useRoundPhase } from "@/components/use-round-phase";
import { useManagerProgress, type ManagerProgress } from "@/components/use-manager-progress";
import { useHotkeys } from "@/components/use-hotkeys";
import { AllocationInput } from "@/components/student/AllocationInput";
import { PortfolioAllocationInput } from "@/components/student/PortfolioAllocationInput";
import { ManagerAllocationInput } from "@/components/student/ManagerAllocationInput";
import { ManagerYearResult } from "@/components/ManagerYearResult";
import { managerRunningStats } from "@/lib/game/results";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { money, signedMoney, signedPct, ordinal, sharpeText } from "@/lib/game/format";
import { CondensedList } from "@/components/CondensedList";
import { Banner, Button, CountUp } from "@/components/ui";
import { Panel, PanelGrid } from "@/components/terminal";
import { Confetti } from "@/components/Confetti";
import { ArrowUp, ArrowDown, ChevronDown, Lock } from "@/components/icons";

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
  const { phase, round: liveRound, settling } = useRoundPhase(round, session.current_round, {
    holdLocked: session.config.market_mode === "auto",
  });
  const { allocations: myAllocs } = useRoundAllocations(supabase, liveRound?.id ?? null);
  const mine = myAllocs.find((a) => a.player_id === me.id) ?? null;
  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);
  const n = manager ? numManagers(session.config) : numAssets(session.config);

  const [risky, setRisky] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<(number | null)[]>([]);
  const [percents, setPercents] = useState<(number | null)[]>([]);
  const [seeded, setSeeded] = useState<(number | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each new round opens blank — never pre-filled and never carrying over the
  // previous round's choice. Students must deliberately enter an amount every
  // round (even to repeat the same number), so the fields stay empty until they do.
  // The MANAGER game deliberately inverts this: see the seeding effect below.
  useEffect(() => {
    setRisky(null);
    setAmounts(Array.from({ length: n }, () => null));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, n]);

  // A running Sharpe and my return next to the index's — figures that used to
  // appear only on the end screen. They cover every year but the live one, so
  // the reveal appends its own year. The running FEE total is deliberately not
  // here: what fees ate is the end screen's reveal, not a number to watch climb.
  const progress = useManagerProgress(
    supabase,
    session.id,
    session.config.starting_wealth,
    session.config.risk_free_rate ?? 0,
    me.id,
    liveRound?.id ?? null,
    manager,
  );

  // Manager game: a portfolio you did not touch this year is one you still
  // hold, so each year opens PRE-FILLED with last year's shares — matching the
  // server, which carries non-submitters forward instead of defaulting them to
  // all-safe. Percentages (not dollars) are what persist, which is why the
  // input works in percent of wealth.
  useEffect(() => {
    if (!manager) return;
    let active = true;
    supabase
      .from("allocations")
      .select("round_id, risky_breakdown, risky_amount, safe_amount")
      .eq("player_id", me.id)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as {
          round_id: string;
          risky_breakdown: number[] | null;
          risky_amount: number;
          safe_amount: number;
        }[];
        const prev = rows.find(
          (a) => a.risky_breakdown != null && a.round_id !== liveRound?.id,
        );
        const base = prev ? Number(prev.risky_amount) + Number(prev.safe_amount) : 0;
        const next =
          prev?.risky_breakdown && base > 0
            ? Array.from({ length: n }, (_, i) =>
                Math.round((Number(prev.risky_breakdown?.[i] ?? 0) / base) * 100),
              )
            : Array.from({ length: n }, () => 0);
        setPercents(next);
        setSeeded(next);
      });
    return () => {
      active = false;
    };
  }, [supabase, manager, me.id, n, liveRound?.id]);

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

  // Manager games start pre-filled and stay submittable, so a student can
  // confirm a held position without re-typing it.
  const touched = manager
    ? percents.length > 0
    : portfolio
      ? amounts.some((a) => a !== null)
      : risky !== null;
  const unchanged =
    manager && !mine && seeded.length > 0 && percents.every((p, i) => p === seeded[i]);

  // Enter submits — and is the one key that must keep working while focus is in
  // an amount field, which is exactly why useHotkeys takes an allow-list rather
  // than weakening its typing guard.
  useHotkeys(
    { enter: () => void submit() },
    {
      enabled: phase === "open" && touched && !busy && !settling,
      allowWhileTyping: ["enter"],
    },
  );

  async function submit() {
    if (!touched || !liveRound) return;
    setBusy(true);
    setError(null);
    // All writes go through SECURITY DEFINER RPCs. The server validates the
    // round is open, that this is our own player, bounds every amount, and
    // derives the safe remainder. Students have no direct write grant.
    const { error } = manager
      ? await supabase.rpc("submit_manager_allocation", {
          p_round_id: liveRound.id,
          p_amounts: amountsFromPercents(
            me.current_wealth,
            percents,
            session.config.leverage_cap ?? 2,
          ),
        })
      : portfolio
        ? await supabase.rpc("submit_portfolio_allocation", {
            p_round_id: liveRound.id,
            p_amounts: amounts.map((a) => roundCents(a ?? 0)),
          })
        : await supabase.rpc("submit_allocation", {
            p_round_id: liveRound.id,
            p_risky_amount: roundCents(risky ?? 0),
          });
    setBusy(false);
    if (error) setError(error.message);
  }

  if (phase === "open" && liveRound) {
    return (
      <Shell
        title={manager || portfolio ? "Your portfolio" : "Your bet"}
        wealth={me.current_wealth}
        roundNumber={session.current_round}
        session={session}
        sharpe={manager ? progress.sharpe : null}
      >
        {manager ? (
          <ManagerAllocationInput
            config={session.config}
            wealth={me.current_wealth}
            percents={percents}
            onChange={setPercents}
            disabled={busy}
          />
        ) : portfolio ? (
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
        {/* Reachable mid-game without pushing the allocation input off a phone. */}
        {manager ? (
          <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl border-2 border-ink bg-paper-2 px-4 text-sm font-semibold text-ink transition marker:content-none hover:bg-brand-soft [&::-webkit-details-marker]:hidden">
              Manager prospectuses
              <ChevronDown className="transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="mt-2">
              {/* Rolled forward every year: the class just watched these funds
                  perform, and a card still quoting only its pre-game decade
                  would be advertising a history that no longer exists. */}
              <ManagerProspectus
                config={session.config}
                managerReturns={progress.managerReturns}
              />
            </div>
          </details>
        ) : null}
        {error ? <Banner kind="error">{error}</Banner> : null}
        {/* `settling` = the host has locked the round but we are still showing
            the open screen, so a submit now would bounce off a locked round. */}
        <Button
          variant="gold"
          onClick={submit}
          disabled={busy || !touched || settling}
          className="w-full text-lg shadow-pop"
        >
          {busy
            ? "Saving…"
            : mine
              ? "Update allocation"
              : manager
                ? unchanged
                  ? "Hold this portfolio"
                  : "Confirm my portfolio"
                : portfolio
                  ? "Lock in my portfolio"
                  : "Lock in my bet"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))}{" "}
            {portfolio || manager ? "invested" : "risky"} — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center font-editorial text-sm italic text-ink-subtle">
            {manager
              ? unchanged
                ? "Unchanged from last year — you keep this portfolio unless you change it."
                : "Set your percentages, then confirm."
              : portfolio
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
      <Shell
        title="Waiting for the reveal"
        flush
        wealth={me.current_wealth}
        roundNumber={session.current_round}
        session={session}
        sharpe={manager ? progress.sharpe : null}
      >
        {/* A colour band filling the ticket edge to edge: the waiting state
            fills the frame the way a result slip would. */}
        <div className="bg-brand-soft bg-dots px-5 pb-8 pt-10 text-center">
          {/* The stamp lands once per round (keyed), a small game-show beat for
              "your choice is in". "Loading" keeps it quiet: nothing locked yet. */}
          {phase === "loading" ? (
            <p className="font-display text-lg font-extrabold uppercase tracking-tight text-ink">
              Getting the next round ready…
            </p>
          ) : (
            <span
              key={liveRound?.id ?? "locked"}
              className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-5 py-2 font-display text-2xl font-black uppercase tracking-tight text-ink shadow-card"
            >
              <Lock /> {mine ? "Locked in" : "Round locked"}
            </span>
          )}
          <p className="mt-4 font-editorial text-base italic text-ink-muted">
            {mine ? "Nice. Now we wait for the market…" : "Waiting for the reveal…"}
          </p>
          {/* While the next round is still loading our allocations are empty,
              which is not the same thing as not having submitted — say nothing
              rather than accuse the student of missing the round. */}
          {phase === "loading" ? null : mine ? (
            <p className="mt-3 font-mono text-sm font-bold text-ink">
              {manager
                ? // safe_amount goes NEGATIVE when levered, so "safe −$50" was
                  // both wrong and alarming — say borrowed and mean it.
                  `Invested ${money(Number(mine.risky_amount))} across ${n} managers · ${
                    Number(mine.safe_amount) < 0
                      ? `borrowed ${money(-Number(mine.safe_amount))}`
                      : `cash ${money(Number(mine.safe_amount))}`
                  }`
                : portfolio
                  ? `Invested ${money(Number(mine.risky_amount))} across ${n} assets · safe ${money(Number(mine.safe_amount))}`
                  : `You risked ${money(Number(mine.risky_amount))} · safe ${money(Number(mine.safe_amount))}`}
            </p>
          ) : (
            <p className="mt-3 font-editorial text-sm italic text-ink-subtle">
              {/* The manager game CARRIES FORWARD — the server rescales last
                  year's shares to current wealth rather than defaulting to
                  all-safe. Telling a holder they are about to sit in cash is
                  the opposite of what happens. */}
              {manager
                ? seeded.some((p) => (p ?? 0) > 0)
                  ? "You didn't change anything — you keep last year's portfolio."
                  : "You haven't hired anyone — you stay in the risk-free asset."
                : "You didn't submit — you'll default to all-safe."}
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

  return (
    <Reveal
      supabase={supabase}
      session={session}
      me={me}
      round={liveRound}
      mine={mine}
      progress={manager ? progress : null}
    />
  );
}

/**
 * Sharpe so far, as a chip beside the figures it qualifies. Absent until two
 * years have resolved (one return has no spread to divide by).
 */
function SharpeChip({ sharpe }: { sharpe: number }) {
  return (
    <span
      className="inline-flex items-baseline gap-2 rounded-xl border-2 border-ink bg-surface px-3 py-1.5"
      title="Sharpe ratio: return per unit of risk taken, across the years so far"
    >
      <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
        Sharpe
      </span>
      <span className="font-mono text-sm font-bold text-ink">{sharpeText(sharpe)}</span>
    </span>
  );
}

/**
 * "Round 6 / 10" on an ink pill, with a thin amber track under the number that
 * fills as the game goes. The same pill heads every phase — open, locked and
 * the reveal — so the student never loses their place.
 */
function RoundPill({ session, roundNumber }: { session: SessionRow; roundNumber: number }) {
  const total = session.config.num_rounds;
  const pct = total > 0 ? Math.min(roundNumber / total, 1) * 100 : 0;
  return (
    <span className="relative inline-flex overflow-hidden rounded-full border-2 border-ink bg-ink px-3.5 pb-1.5 pt-1 font-mono text-sm font-bold uppercase text-paper-inverse">
      {isManager(session.config) ? "Year" : "Round"} {roundNumber} / {total}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-paper-inverse/15">
        <span
          className="block h-full origin-left bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

function Shell({
  children,
  title,
  flush,
  wealth,
  roundNumber,
  session,
  sharpe,
}: {
  children: React.ReactNode;
  /** the ticket's title strip: "Your bet", "Waiting for the reveal" */
  title: string;
  /** the content fills the panel edge to edge (a colour band) */
  flush?: boolean;
  wealth: number;
  /** always the session's current round — never a stale row's number */
  roundNumber: number;
  session: SessionRow;
  /** manager game: Sharpe over the years resolved so far. Risk-adjusted return
   *  used to surface only on the end screen, which is too late to change how
   *  anyone plays — it belongs next to the wealth it is qualifying. */
  sharpe?: number | null;
}) {
  // hide the odds line when assets have custom per-asset odds (one number
  // can't summarize them)
  const customOdds =
    isPortfolio(session.config) &&
    (session.config.assets ?? []).some((a) => a?.good_prob != null);
  // The manager game has no good/bad market to quote odds on — returns are
  // continuous. show_odds_to_students defaults to true and its toggle is hidden
  // for this game type, so without the guard EVERY manager round screen carried
  // a "The market looks like ↑60% ↓40%" bar that describes a different game.
  const showOdds =
    session.config.show_odds_to_students &&
    session.config.market_mode === "auto" &&
    !customOdds &&
    !isManager(session.config);
  const goodPct = Math.round((session.config.good_prob ?? 0.6) * 100);

  return (
    // No card: the phone IS the sheet. A thick rule under the header, then the
    // controls straight on the page (DESIGN.md §4).
    <main className="min-h-dvh bg-surface">
      {/* The paper masthead every game screen shares: where you are, and
          what you have. */}
      <header className="border-b-2 border-ink bg-paper">
      <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3">
        <RoundPill session={session} roundNumber={roundNumber} />
        <span className="text-right">
          <span className="block font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            Your wealth
          </span>
          {/* Rolls to the new balance when the next round opens after a reveal. */}
          <CountUp value={wealth} format={money} className="font-mono text-xl font-bold text-ink" />
        </span>
      </div>
      </header>
      <div className="mx-auto flex max-w-lg flex-col px-5 pb-10 pt-4">
      {sharpe != null ? (
        <div className="mb-4 flex justify-end">
          <SharpeChip sharpe={sharpe} />
        </div>
      ) : null}
      {showOdds ? (
        <div className="mb-4 flex items-center justify-between border-b-[1.5px] border-ink/15 px-1 pb-3 text-sm">
          <span className="font-editorial italic text-ink-muted">
            {isPortfolio(session.config) ? "Each asset looks like" : "The market looks like"}
          </span>
          <span className="flex items-center gap-2 font-mono font-semibold">
            <span className="inline-flex items-center gap-0.5 text-gain">
              <ArrowUp /> {goodPct}%
            </span>
            <span className="text-ink-subtle">·</span>
            <span className="inline-flex items-center gap-0.5 text-loss">
              <ArrowDown /> {100 - goodPct}%
            </span>
          </span>
        </div>
      ) : null}
      {/* The bet slip: one framed panel with a title strip, like a ticket. */}
      <PanelGrid className="animate-pop-in">
        <Panel title={title} bodyClassName={flush ? "p-0 sm:p-0" : "space-y-5"}>
          {children}
        </Panel>
      </PanelGrid>
      </div>
    </main>
  );
}

function Reveal({
  supabase,
  session,
  me,
  round,
  mine,
  progress,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
  mine: ReturnType<typeof useRoundAllocations>["allocations"][number] | null;
  /** manager game only: running index and player returns, in the same units,
   *  covering every year BEFORE this one */
  progress?: ManagerProgress | null;
}) {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);

  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);
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
  const deltaPct = before > 0 ? (delta / before) * 100 : 0;

  // The running figures with THIS year appended: progress stops at last year,
  // so quoting it as-is put "over 4 yrs" under a year-5 headline.
  const running = useMemo(() => {
    if (!manager || !progress) return null;
    const rMarket = round.market_return;
    return managerRunningStats(
      session.config.starting_wealth,
      session.config.risk_free_rate ?? 0,
      [...progress.wealthByYear, resulting],
      rMarket == null ? progress.marketReturns : [...progress.marketReturns, Number(rMarket)],
      before > 0 ? delta / before : null,
    );
  }, [manager, progress, round.market_return, session.config, resulting, before, delta]);

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

  // portfolio and manager games have no single good/bad market — the header
  // reads off YOUR round result. (The manager banner once read the good/bad
  // field, which is always null there, and shouted DOWN over a +7% year.)
  const personal = portfolio || manager;
  const good = personal ? delta >= 0 : outcome === "good";
  // Celebrate a personal win (gained money this round).
  const celebrate = delta > 0;

  return (
    <main className="min-h-dvh bg-surface">
      {celebrate ? <Confetti /> : null}
      <header className="border-b-2 border-ink bg-paper">
        <div className="mx-auto flex max-w-lg items-center px-5 py-3">
          <RoundPill session={session} roundNumber={round.round_number} />
        </div>
      </header>
      <div className={`space-y-5 text-center ${good ? "animate-pop-in" : "animate-shake"}`}>
        {/* The verdict as a full-width band straight under the masthead, not a
            card header: colour does the work, no box around it. */}
        <div
          className={`flex items-center justify-center overflow-hidden border-b-2 border-ink bg-dots-light px-5 py-7 font-display text-4xl font-black uppercase tracking-tight text-white ${
            personal
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
          <span className="inline-flex animate-stamp items-center gap-2">
            {personal ? (
              <>
                {delta > 0 ? <ArrowUp /> : delta < 0 ? <ArrowDown /> : null}
                {delta > 0 ? "Up!" : delta < 0 ? "Down" : manager ? "Flat year" : "Flat round"}
              </>
            ) : (
              <>
                {good ? <ArrowUp /> : <ArrowDown />}
                {good ? "Good!" : "Down"}
              </>
            )}
          </span>
        </div>

        <div className="mx-auto max-w-lg space-y-5 px-5 pb-10">
        {manager ? (
          <>
            <ManagerYearResult
              config={session.config}
              round={round}
              allocation={mine}
              startWealth={before}
              marketSoFar={running?.market ?? null}
              playerSoFar={running?.player ?? null}
            />
            {running?.sharpe != null ? (
              <div className="flex justify-center">
                <SharpeChip sharpe={running.sharpe} />
              </div>
            ) : null}
          </>
        ) : null}

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
          {/* Rolls from the balance going into the round to the new one — the
              moment the market's verdict turns into money. */}
          <CountUp
            value={resulting}
            from={before}
            duration={1100}
            format={money}
            className="block animate-count-pop font-mono text-5xl font-black text-ink"
          />
          <div
            className={`mt-1 inline-flex animate-pop-in items-center gap-1 font-mono text-lg font-bold [animation-delay:0.9s] ${
              delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-ink-muted"
            }`}
          >
            {delta > 0 ? <ArrowUp /> : delta < 0 ? <ArrowDown /> : null}
            {/* Manager game: a percentage, the unit the market is quoted in on
                this same card — the dollars are already in "Your year". */}
            {manager
              ? `${signedPct(deltaPct, 1)} this year`
              : `${signedMoney(delta)} this round`}
          </div>
        </div>

        {/* Where you stand: a panel whose title strip carries your place. */}
        {rank || board ? (
          <PanelGrid className="animate-rise text-left">
            <Panel
              title="Class standings"
              bodyClassName="p-0 sm:p-0"
              action={
                rank ? (
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="flex h-8 min-w-8 items-center justify-center rounded-md border-2 border-ink bg-brand px-1.5 font-display text-base font-black">
                      {ordinal(rank.rank)}
                    </span>
                    of {rank.total}
                  </span>
                ) : null
              }
            >
              {board ? (
                <StudentBoard board={board} />
              ) : (
                <p className="px-4 py-3 font-editorial italic text-ink-muted">
                  {/* the table is still on its way, not withheld */}
                  {session.config.show_full_leaderboard_to_students
                    ? "Loading the table…"
                    : rank && rank.rank === 1
                      ? "Top of the class."
                      : "The host keeps the full table private."}
                </p>
              )}
            </Panel>
          </PanelGrid>
        ) : null}

        <p className="flex items-center justify-center gap-2 font-editorial text-sm italic text-ink-muted">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse-soft rounded-full bg-play" />
          Waiting for the next round…
        </p>
      </div>
      </div>
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
  const myIdx = board.findIndex((r) => r.is_me);
  const keepIndices = useMemo(() => (myIdx >= 0 ? [myIdx] : []), [myIdx]);

  return (
    <div>
      <CondensedList
        items={board}
        keyOf={(r) => r.player_id}
        keepIndices={keepIndices}
        className="divide-y-[1.5px] divide-ink/15 text-left"
        gapClassName="px-4 font-editorial text-xs italic text-ink-subtle hover:text-ink"
        toggleClassName="my-1 px-4 font-editorial text-xs italic text-ink-subtle hover:text-ink"
        renderItem={(r, i) => (
          <li
            style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
            className={`stagger flex animate-rise items-center justify-between gap-3 px-4 py-2 text-sm ${
              // your row carries the timing tower's highlight bar
              r.is_me ? "bg-play-soft font-bold text-ink shadow-[inset_4px_0_0_rgb(var(--play))]" : "text-ink-muted"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-subtle">{r.rank}</span>
              <span className="truncate">{r.display_name}</span>
              {r.is_me ? (
                <span className="shrink-0 font-display text-[11px] font-extrabold uppercase tracking-wide text-play">
                  you
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-mono">{money(Number(r.current_wealth))}</span>
          </li>
        )}
      />
    </div>
  );
}
