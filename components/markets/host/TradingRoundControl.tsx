"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "@/components/clsx";
import {
  formatCountdown,
  formatGameMonth,
  periodNoun,
  periodSpan,
} from "@/lib/markets/clock";
import { tradePresentPath } from "@/lib/markets/routes";
import {
  indexPath,
  periodChanges,
  rankMoves,
} from "@/lib/markets/trading/host";
import {
  Banner,
  Button,
  Card,
  CountUp,
  SectionTitle,
  buttonClasses,
} from "@/components/ui";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Flag,
  Lock,
  Monitor,
  Newspaper,
  Plus,
  Trash,
  Trophy,
} from "@/components/icons";
import { useConfirm } from "@/components/ConfirmDialog";
import { useHotkeys } from "@/components/use-hotkeys";
import { RoundTrack } from "@/components/host/RoundTrack";
import { WealthChart } from "@/components/host/WealthChart";
import { ChangeChip, TickerBadge } from "@/components/markets/parts";
import type { HostActions, HostModel } from "./model";
import {
  DevDataBanner,
  HostStandings,
  RealDates,
  SettingsDisclosure,
  TradingStatusBadge,
} from "./parts";
import { isSimulatedMarket } from "@/lib/markets/trading/config";
import { ResearchExport } from "@/components/research/ResearchExport";

const EXTEND_SECONDS = 30;

/**
 * The host's live screen while a game runs. One pinned action does the next
 * thing (Lock & reveal → Next quarter → … → Finish game), the round clock and
 * the order counter sit under it while trading is open, and the period's
 * result replaces them once it is revealed. Standings and the class's wealth
 * chart fill the rest; the real dates hide behind a host-only control.
 */
export function TradingRoundControl({
  model,
  actions,
}: {
  model: HostModel;
  actions: HostActions;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { cfg, phase, round } = model;
  const noun = periodNoun(cfg.period);
  const last = round >= cfg.num_rounds;
  const span = periodSpan(cfg.period, round);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const e = await fn();
    setBusy(false);
    if (e) setError(e);
  }

  async function finishEarly() {
    const ok = await confirm({
      title: "Finish the game early?",
      body: (
        <>
          <p>
            You&apos;re at {noun.toLowerCase()} {round} of {cfg.num_rounds}. The
            game ends now: no more trading, students see their final results
            {isSimulatedMarket(cfg) ? "" : " and the real companies"}.
          </p>
          <p>This cannot be undone.</p>
        </>
      ),
      confirmLabel: "Finish game",
      tone: "danger",
    });
    if (ok) void run(actions.finish);
  }

  async function deleteSession() {
    const ok = await confirm({
      title: `Delete session ${model.joinCode}?`,
      body: "This permanently removes every player, order and trade in it. It cannot be undone.",
      confirmLabel: "Delete session",
      tone: "danger",
    });
    if (ok) void run(actions.deleteSession);
  }

  // The pinned button and its keyboard shortcut read the SAME choice. Gold for
  // the beats that move the game (reveal, finish); blue for moving on.
  const primary: {
    label: string;
    run: () => void;
    disabled: boolean;
    variant: "gold" | "primary";
    icon?: React.ReactNode;
  } | null =
    phase === "loading"
      ? null
      : phase === "open"
        ? {
            label: "Lock & reveal",
            run: () => run(actions.lockAndReveal),
            disabled: busy || model.settling,
            variant: "gold",
            icon: <Lock />,
          }
        : phase === "closed"
          ? {
              label: busy ? "Revealing…" : "Reveal the market",
              run: () => run(actions.lockAndReveal),
              disabled: busy,
              variant: "gold",
            }
          : last
            ? {
                label: "Finish game",
                run: () => run(actions.finish),
                disabled: busy,
                variant: "gold",
                icon: <Trophy />,
              }
            : {
                label: `Next ${noun.toLowerCase()}`,
                run: () => run(actions.next),
                disabled: busy,
                variant: "primary",
                icon: <ArrowRight />,
              };
  const primaryReady = primary != null && !primary.disabled;
  useHotkeys(
    primaryReady
      ? { space: () => primary!.run(), enter: () => primary!.run() }
      : {},
  );

  const active = useMemo(
    () => new Set(model.players.map((p) => p.id)),
    [model.players],
  );
  const moves = useMemo(
    () => rankMoves(model.rounds, model.allocations, (id) => active.has(id)),
    [model.rounds, model.allocations, active],
  );
  const changes = useMemo(
    () => periodChanges(model.rounds, model.allocations),
    [model.rounds, model.allocations],
  );
  const benchmark = useMemo(() => {
    const series = indexPath(model.periods, cfg.starting_wealth);
    return series.length > 0 ? { label: "The index fund", series } : null;
  }, [model.periods, cfg.starting_wealth]);
  // Each segment green or red by the market's move that period.
  const track = useMemo(
    () =>
      model.periods.map((p) => ({
        round_number: p.round_number,
        status: "revealed",
        market_outcome:
          p.index_return == null
            ? null
            : p.index_return >= 0
              ? ("good" as const)
              : ("bad" as const),
      })),
    [model.periods],
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {model.devData ? (
        <div className="mb-4">
          <DevDataBanner />
        </div>
      ) : null}
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Link
              href="/host"
              className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft /> Dashboard
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
                {noun} {round}
                <span className="text-ink-subtle"> / {cfg.num_rounds}</span>
              </h1>
              <TradingStatusBadge phase={phase} />
            </div>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {[span, model.title, model.joinCode].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href={tradePresentPath(model.sessionId)}
              target="_blank"
              aria-label="Present: open the projector view in a new tab"
              className={buttonClasses("secondary", "sm", "min-w-[44px]")}
              title="Open the projector view in a new tab"
            >
              <Monitor /> <span className="hidden sm:inline">Present</span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={finishEarly}
              disabled={busy}
              aria-label="Finish early: end the game now"
              title="End the game now"
              className="min-w-[44px]"
            >
              <Flag /> <span className="hidden sm:inline">Finish early</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteSession}
              disabled={busy}
              aria-label="Delete this session"
              title="Delete this session"
              className="min-w-[44px] text-loss hover:bg-loss-soft hover:text-loss"
            >
              <Trash /> <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>
        <RoundTrack
          total={cfg.num_rounds}
          current={round}
          phase={phase === "revealed" ? "revealed" : "open"}
          rounds={track}
          sharedBasic
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="min-w-0 space-y-5">
          {/* Pinned first, so Lock & reveal and Next sit under the same cursor. */}
          {primary ? (
            <Button
              onClick={primary.run}
              disabled={primary.disabled}
              variant={primary.variant}
              className="w-full text-lg shadow-pop"
            >
              {primary.label}
              {primary.icon}
            </Button>
          ) : (
            <>
              <Button disabled variant="secondary" className="w-full text-lg">
                Loading {noun.toLowerCase()} {round}…
              </Button>
              <p className="text-center font-editorial text-sm italic text-ink-subtle">
                Syncing with the server…
              </p>
            </>
          )}

          {error ? <Banner kind="error">{error}</Banner> : null}

          {phase === "open" || phase === "closed" ? (
            <OpenPanel
              model={model}
              busy={busy}
              onExtend={() => run(() => actions.extend(EXTEND_SECONDS))}
            />
          ) : phase === "revealed" ? (
            <RevealedPanel model={model} />
          ) : null}

          <SettingsDisclosure
            cfg={cfg}
            knobs={model.knobs}
            conditions={model.conditions}
          >
            <div>
              <div className="mb-2 font-display text-xs font-extrabold uppercase tracking-wide text-ink">
                Research data so far
              </div>
              <ResearchExport
                joinCode={model.joinCode}
                researchMode={cfg.research_mode}
                loadTables={actions.loadResearch}
                loadEvents={actions.loadResearchEvents}
              />
            </div>
          </SettingsDisclosure>
          {isSimulatedMarket(cfg) ? null : (
            <RealDates
              loadTruth={actions.loadTruth}
              instruments={model.instruments}
            />
          )}
        </Card>

        <Card className="min-w-0">
          <SectionTitle
            className="mb-3"
            info="By account value at the last close. Sharpe is annualized from each player's period returns; drawdown is the largest fall from a peak."
            infoLabel="About the standings"
          >
            Standings
          </SectionTitle>
          <HostStandings
            standings={model.standings}
            players={model.players}
            moves={moves}
            changes={changes}
            manage={actions.manage}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle className="mb-3">
          Account values by {noun.toLowerCase()}
        </SectionTitle>
        <WealthChart
          players={model.players}
          rounds={model.rounds}
          allocations={model.allocations}
          startingWealth={cfg.starting_wealth}
          benchmark={benchmark}
          unitLabel={noun}
        />
      </Card>
    </main>
  );
}

/** While trading is open (or just closed): the clock, more time, and who has traded. */
function OpenPanel({
  model,
  busy,
  onExtend,
}: {
  model: HostModel;
  busy: boolean;
  onExtend: () => void;
}) {
  const secs = model.secondsLeft;
  const timeUp = secs === 0 && model.roundStatus === "open";
  const locked = model.roundStatus === "locked";
  const urgent = secs != null && secs > 0 && secs <= 10;
  const a = model.activity;
  const total = a?.players ?? model.players.length;
  const traded = a?.players_with_orders ?? null;
  const names = new Map(model.instruments.map((i) => [i.slot, i]));

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        {locked ? (
          <span className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-4 py-1.5 font-display text-lg font-black uppercase tracking-tight text-ink shadow-card">
            <Lock /> Trading closed
          </span>
        ) : (
          <span
            className={clsx(
              "inline-flex items-center gap-3 rounded-2xl border-[3px] border-ink px-5 py-2 font-mono text-5xl font-black tabular-nums shadow-card transition-colors",
              urgent
                ? "bg-loss text-white"
                : timeUp
                  ? "bg-paper-2 text-ink-muted"
                  : "bg-surface text-ink",
            )}
            role="timer"
            aria-label={
              secs == null
                ? "No time limit"
                : `${formatCountdown(secs)} left to trade`
            }
          >
            <Clock className="text-[0.6em]" />
            {secs == null ? "—" : formatCountdown(secs)}
          </span>
        )}
        <p className="font-editorial text-sm italic text-ink-muted">
          {locked
            ? "Playing out the period…"
            : timeUp
              ? "Time's up: no new orders. Reveal, or add time."
              : "left to trade"}
        </p>
        {model.roundStatus === "open" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onExtend}
            disabled={busy}
          >
            <Plus /> {EXTEND_SECONDS} seconds
          </Button>
        ) : null}
      </div>

      <div className="text-center">
        <div className="font-mono text-5xl font-black text-ink">
          {traded == null ? "—" : <CountUp value={traded} duration={400} />}
          <span className="text-ink-subtle"> / {total}</span>
        </div>
        <Meter value={traded ?? 0} total={total} />
        <div className="mt-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
          {total > 0 && traded === total
            ? "Everyone has traded"
            : "have placed an order"}
        </div>
        {a && a.orders > 0 ? (
          <p className="mt-1 text-xs text-ink-subtle">
            {a.orders} order{a.orders === 1 ? "" : "s"} this round
          </p>
        ) : null}
      </div>

      {a && a.most_bought.length > 0 ? (
        <div>
          <div className="mb-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            Most bought
          </div>
          <ul className="space-y-1">
            {a.most_bought.slice(0, 3).map((m) => {
              const i = names.get(m.slot);
              return (
                <li key={m.slot} className="flex items-center gap-2 text-sm">
                  {i ? <TickerBadge ticker={i.ticker} kind={i.kind} /> : null}
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {i?.name ?? `Slot ${m.slot}`}
                  </span>
                  <span className="shrink-0 font-mono text-ink-muted">
                    {m.players} student{m.players === 1 ? "" : "s"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** After the reveal: what the market did, the movers, the headlines, and how many traded. */
function RevealedPanel({ model }: { model: HostModel }) {
  const p = model.periods.find((x) => x.round_number === model.round);
  const names = new Map(model.instruments.map((i) => [i.slot, i]));
  const noun = periodNoun(model.cfg.period);
  if (!p)
    return (
      <p className="text-center font-editorial text-sm italic text-ink-subtle">
        Loading the results…
      </p>
    );
  const up = p.movers.filter((m) => m.ret > 0).slice(0, 3);
  const down = [...p.movers]
    .filter((m) => m.ret < 0)
    .sort((a, b) => a.ret - b.ret)
    .slice(0, 3);
  const a = model.activity;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-4 py-1.5 font-display text-lg font-black uppercase tracking-tight text-ink shadow-card">
          {noun} {model.round} is in
        </span>
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          The market <ChangeChip value={p.index_return} />
        </div>
        {a ? (
          <p className="font-editorial text-sm italic text-ink-muted">
            {a.players_with_orders} of {a.players} traded this{" "}
            {noun.toLowerCase()}
          </p>
        ) : null}
      </div>

      {up.length + down.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MoverList title="Biggest risers" rows={up} names={names} />
          <MoverList title="Biggest fallers" rows={down} names={names} />
        </div>
      ) : null}

      {model.cfg.headlines && p.headlines.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            <Newspaper /> In the news
          </div>
          <ul className="space-y-1.5">
            {p.headlines.slice(0, 3).map((h, k) => (
              <li key={k} className="text-sm text-ink">
                <span className="font-mono text-xs text-ink-subtle">
                  {formatGameMonth(h.y, h.m)}
                </span>{" "}
                {h.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MoverList({
  title,
  rows,
  names,
}: {
  title: string;
  rows: { slot: number; ret: number }[];
  names: Map<
    number,
    { ticker: string; name: string; kind: "equity" | "index_fund" }
  >;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
        {title}
      </div>
      <ul className="space-y-1">
        {rows.map((m) => {
          const i = names.get(m.slot);
          return (
            <li key={m.slot} className="flex items-center gap-2 text-sm">
              {i ? <TickerBadge ticker={i.ticker} kind={i.kind} /> : null}
              <span className="min-w-0 flex-1 truncate text-ink">
                {i?.name}
              </span>
              <ChangeChip value={m.ret} size="sm" />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Fills as students place their first order this round. */
function Meter({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(value / total, 1) * 100 : 0;
  return (
    <div className="mx-auto mt-3 h-4 w-full max-w-xs overflow-hidden rounded-full border-2 border-ink bg-paper-2 shadow-card">
      <div
        className="h-full rounded-r-full border-ink bg-gain transition-[width] duration-500 ease-out"
        style={{
          width: `${pct}%`,
          borderRightWidth: pct > 0 && pct < 100 ? 2 : 0,
        }}
      />
    </div>
  );
}
