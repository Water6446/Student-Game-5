"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { clsx } from "@/components/clsx";
import { joinDisplayUrl, joinUrl } from "@/lib/game/db";
import { COLOR } from "@/lib/design/colors";
import { SITE } from "@/lib/marketing/content";
import type {
  DailyBar,
  MarketPeriodResultRow,
  SessionInstrumentRow,
  TradingReveal,
} from "@/lib/markets/db";
import { eraText } from "@/lib/markets/trading/reveal";
import { isSimulatedMarket } from "@/lib/markets/trading/config";
import {
  formatCountdown,
  formatGameDate,
  formatGameMonth,
  periodNoun,
  periodSpan,
} from "@/lib/markets/clock";
import {
  centsText,
  compactMoney,
  priceText,
  returnText,
} from "@/lib/markets/format";
import { tradeHostPath } from "@/lib/markets/routes";
import { periodChanges, rankMoves } from "@/lib/markets/trading/host";
import { roundsLine } from "@/lib/markets/trading/summary";
import { downsample, periodSlice } from "@/lib/markets/trading/view";
import { CountUp } from "@/components/ui";
import { CondensedList } from "@/components/CondensedList";
import { Confetti } from "@/components/Confetti";
import {
  ChartLine,
  Clock,
  Lock,
  Maximize,
  Newspaper,
  Trophy,
  Users,
  X,
} from "@/components/icons";
import { Podium, Sunburst } from "@/components/host/present-parts";
import { PriceChart, type ChartPoint } from "@/components/markets/PriceChart";
import { ChangeChip } from "@/components/markets/parts";
import {
  ClassTurnover,
  RevealError,
  RevealSkeleton,
  useReveal,
} from "@/components/markets/RevealParts";
import type { HostActions, HostModel } from "./model";
import { RankMove } from "./parts";

// The projector shows the class what everyone may see: the clock, counts,
// the market, the standings. Never a student's orders, never the real era.
type PresentActions = Pick<HostActions, "loadIndexHistory" | "loadReveal">;

/**
 * The paper trading projector (DESIGN.md §9): read-only, driven by the same
 * model as the host's control screen, which keeps it live. Lobby: the join
 * code; trading: a giant clock and how many have traded; after each period a
 * full-screen reveal of what the market did; then the standings; at the end,
 * the finale: the podium, the real era, and turnover against return.
 */
export function TradingPresent({
  model,
  actions,
}: {
  model: HostModel;
  actions: PresentActions;
}) {
  return (
    <main className="flex min-h-dvh flex-col px-[3vw] py-[2.5vh]">
      <PresentHeader model={model} />
      <div className="flex flex-1 flex-col">
        {model.status === "lobby" ? (
          <PresentLobby model={model} />
        ) : model.status === "finished" ? (
          <PresentFinished model={model} actions={actions} />
        ) : (
          <PresentActive model={model} actions={actions} />
        )}
      </div>
    </main>
  );
}

function PresentHeader({ model }: { model: HostModel }) {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  const iconBtn =
    "flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-surface text-ink-muted shadow-card transition hover:text-ink";
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-brand text-ink">
          <ChartLine />
        </span>
        <span className="font-display text-2xl font-black uppercase tracking-tight">
          {SITE.name}
        </span>
        <span className="hidden font-display text-2xl font-extrabold uppercase tracking-tight text-ink-muted md:inline">
          · Paper trading
        </span>
      </div>
      <div className="flex items-center gap-3">
        {model.status !== "finished" ? (
          <span className="hidden items-baseline gap-2 rounded-full border-2 border-ink bg-surface px-4 py-1.5 shadow-card sm:flex">
            <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-muted">
              join code
            </span>
            <span className="font-mono text-xl font-bold tracking-[0.25em] text-ink">
              {model.joinCode}
            </span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleFs}
          aria-label={fs ? "Exit fullscreen" : "Go fullscreen"}
          title={fs ? "Exit fullscreen" : "Go fullscreen"}
          className={iconBtn}
        >
          <Maximize />
        </button>
        <Link
          href={tradeHostPath(model.sessionId)}
          aria-label="Exit present mode"
          title="Exit present mode"
          className={iconBtn}
        >
          <X />
        </Link>
      </div>
    </header>
  );
}

/* ── Lobby ───────────────────────────────────────────────────────────────── */
function PresentLobby({ model }: { model: HostModel }) {
  const link = joinUrl(model.joinCode);
  const { players } = model;
  return (
    <div className="grid flex-1 items-center gap-8 py-4 lg:grid-cols-2">
      <div className="flex animate-pop-in flex-col items-center justify-center rounded-3xl border-2 border-ink bg-ink p-10 text-center text-paper-inverse shadow-lift-brand">
        <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-paper-inverse/70">
          Game code
        </p>
        <p className="flex font-mono text-7xl font-black text-paper-inverse sm:text-8xl">
          {model.joinCode.split("").map((ch, i) => (
            <span
              key={i}
              className="stagger inline-block w-[0.9em] animate-count-pop text-center"
              style={{ "--i": i + 3 } as React.CSSProperties}
            >
              {ch}
            </span>
          ))}
        </p>
        <div className="mt-8 rounded-3xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_rgb(var(--brand))]">
          <QRCodeSVG value={link} size={220} fgColor={COLOR.ink} />
        </div>
        <p className="mt-6 break-all font-editorial text-2xl italic text-paper-inverse/80">
          join from your phone: {joinDisplayUrl()}
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
          In the room
        </p>
        <p
          key={players.length}
          className="animate-count-pop font-mono text-[clamp(5rem,16vw,11rem)] font-black leading-none text-ink"
        >
          {players.length}
        </p>
        <p className="flex items-center gap-3 text-3xl font-bold text-ink">
          <Users className="text-[0.8em] text-ink-muted" />
          {players.length === 1 ? "trader" : "traders"} in
        </p>
        <p className="max-w-2xl font-editorial text-2xl italic text-ink-muted">
          {centsText(model.cfg.starting_wealth).replace(/\.00$/, "")} each ·{" "}
          {roundsLine(model.cfg).split(" · ")[0]} ·{" "}
          {isSimulatedMarket(model.cfg)
            ? "a simulated market"
            : "real stocks, names and dates hidden"}
        </p>
        {players.length > 0 ? (
          <ul className="mt-2 flex max-h-[26vh] max-w-2xl flex-wrap content-start justify-center gap-2 overflow-hidden">
            {players.slice(-36).map((p, i) => (
              <li
                key={p.id}
                className={`animate-pop-in rounded-full border-2 border-ink px-4 py-1.5 font-display text-xl font-extrabold text-ink shadow-card ${
                  [
                    "bg-brand-soft",
                    "bg-play-soft",
                    "bg-gain-soft",
                    "bg-surface",
                  ][i % 4]
                }`}
              >
                {p.display_name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* ── The index chart's data ─────────────────────────────────────────────── */
function useIndexBars(
  model: HostModel,
  actions: PresentActions,
): DailyBar[] | null {
  const [bars, setBars] = useState<DailyBar[] | null>(null);
  const load = useRef(actions.loadIndexHistory);
  load.current = actions.loadIndexHistory;
  const revealed = model.periods.length;
  useEffect(() => {
    let live = true;
    load
      .current()
      .then((b) => live && setBars(b))
      .catch(() => live && setBars([]));
    return () => {
      live = false;
    };
  }, [revealed]);
  return bars;
}

// Projector axis labels: "$130", or "$129.50" when the ticks fall between dollars.
const axisMoney = (v: number) =>
  Number.isInteger(v) ? compactMoney(v) : priceText(v);

const toPoints = (bars: DailyBar[]): ChartPoint[] =>
  bars.map(([g, y, m, d, , , , c]) => ({
    x: g,
    value: c,
    label: formatGameDate([g, y, m, d]),
  }));

/* ── Active ──────────────────────────────────────────────────────────────── */
function PresentActive({
  model,
  actions,
}: {
  model: HostModel;
  actions: PresentActions;
}) {
  const { cfg, phase, round } = model;
  const noun = periodNoun(cfg.period);
  const bars = useIndexBars(model, actions);
  const period = model.periods.find((p) => p.round_number === round) ?? null;
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

  // The market so far: from the start of Year 1 once a period is in, the year
  // before it until then.
  const chart = useMemo(() => {
    if (!bars || bars.length === 0) return null;
    const from = model.periods.length > 0 ? 0 : bars[bars.length - 1][0] - 365;
    const start = Math.max(0, bars.findIndex((b) => b[0] >= from) - 1);
    const slice = bars.slice(start);
    return { points: downsample(toPoints(slice), 320), baseline: slice[0][7] };
  }, [bars, model.periods.length]);

  // The takeover: once per round, when it flips to revealed.
  const [takeover, setTakeover] = useState<number | null>(null);
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "revealed" || shown.current === round) return;
    shown.current = round;
    setTakeover(round);
    const t = setTimeout(() => setTakeover(null), 7000);
    return () => clearTimeout(t);
  }, [phase, round]);

  const latestHeadline = cfg.headlines
    ? ([...model.periods].reverse().find((p) => p.headlines.length > 0)
        ?.headlines[0] ?? null)
    : null;

  return (
    <div className="grid flex-1 gap-6 py-4 lg:grid-cols-[1fr_1.1fr]">
      {/* min-w-0: a long name or a wide figure must truncate, not widen the grid */}
      <div className="flex min-h-0 min-w-0 flex-col gap-6">
        <StatusPanel model={model} period={period} />
        <section className="rounded-3xl border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="mb-2 flex items-center gap-2 font-display text-2xl font-black uppercase tracking-tight text-ink">
            <ChartLine /> The market
          </h2>
          {chart ? (
            <PriceChart
              points={chart.points}
              baseline={chart.baseline}
              height={260}
              size="lg"
              format={axisMoney}
              ariaLabel="The index fund so far"
            />
          ) : (
            <div className="flex h-[260px] items-center justify-center font-editorial text-2xl italic text-ink-muted">
              {bars ? "No prices yet" : "Loading the market…"}
            </div>
          )}
          {latestHeadline ? (
            <p className="mt-3 flex items-start gap-2 text-2xl text-ink">
              <Newspaper className="mt-1 shrink-0 text-ink-muted" />
              <span>
                <span className="font-mono text-xl text-ink-muted">
                  {formatGameMonth(latestHeadline.y, latestHeadline.m)}
                </span>{" "}
                {latestHeadline.text}
              </span>
            </p>
          ) : null}
        </section>
      </div>

      <section className="min-w-0 rounded-3xl border-2 border-ink bg-surface p-6 shadow-card sm:p-8">
        <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-black uppercase tracking-tight text-ink">
          <Trophy /> Standings
        </h2>
        <Leaderboard model={model} moves={moves} changes={changes} />
      </section>

      {takeover != null && period ? (
        <RevealTakeover
          model={model}
          period={period}
          bars={bars}
          moves={moves}
          celebrate={model.knobs.celebrate_fills}
          onDismiss={() => setTakeover(null)}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">
        {phase === "revealed" && period
          ? `${noun} ${round}: the market ${returnText(period.index_return)}`
          : ""}
      </span>
    </div>
  );
}

function StatusPanel({
  model,
  period,
}: {
  model: HostModel;
  period: MarketPeriodResultRow | null;
}) {
  const { cfg, phase, round } = model;
  const noun = periodNoun(cfg.period);
  const span = periodSpan(cfg.period, round);
  const secs = model.secondsLeft;
  const urgent = secs != null && secs > 0 && secs <= 10;
  const a = model.activity;
  const total = a?.players ?? model.players.length;
  const traded = a?.players_with_orders ?? null;
  const names = new Map(model.instruments.map((i) => [i.slot, i]));

  return (
    <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-ink bg-play-soft bg-dots p-8 text-center shadow-card">
      <p className="font-display text-xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
        {noun} {round} / {cfg.num_rounds}
      </p>
      {span ? (
        <p className="font-display text-lg font-extrabold uppercase tracking-[0.15em] text-ink-muted">
          {span}
        </p>
      ) : null}

      {phase === "loading" ? (
        <p className="mt-6 animate-pulse-soft font-editorial text-3xl italic text-ink-muted">
          Getting {noun.toLowerCase()} {round} ready…
        </p>
      ) : phase === "open" ? (
        <>
          <p className="mt-4 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
            Trading is open
          </p>
          <p
            role="timer"
            className={clsx(
              "mt-5 inline-flex items-center gap-4 rounded-3xl border-[3px] border-ink px-8 py-2 font-mono text-[clamp(4rem,11vw,8rem)] font-black leading-none tabular-nums shadow-lift transition-colors",
              urgent ? "bg-loss text-white" : "bg-surface text-ink",
            )}
          >
            <Clock className="text-[0.5em]" />
            {secs == null ? "—" : formatCountdown(secs)}
          </p>
          <div className="mt-6 font-mono text-5xl font-black text-ink">
            {traded == null ? "—" : <CountUp value={traded} duration={400} />}
            <span className="text-ink-muted">/{total}</span>
          </div>
          <div className="mt-3 h-6 w-full max-w-md overflow-hidden rounded-full border-[3px] border-ink bg-surface shadow-card">
            <div
              className="h-full bg-gain transition-[width] duration-700 ease-out"
              style={{
                width: `${total > 0 && traded != null ? Math.min(traded / total, 1) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold uppercase tracking-wide text-ink-muted">
            {total > 0 && traded === total
              ? "Everyone has traded"
              : "have placed an order"}
          </p>
          {/* What classmates buy is a friction knob: the projector shows it only
              when the students' own screens do. */}
          {model.knobs.show_class_popular && a && a.most_bought.length > 0 ? (
            <p className="mt-3 text-2xl text-ink">
              Most bought:{" "}
              {a.most_bought
                .slice(0, 3)
                .map((m) => names.get(m.slot)?.ticker ?? "?")
                .join(", ")}
            </p>
          ) : null}
        </>
      ) : phase === "closed" ? (
        <>
          <p className="mt-8 inline-flex animate-stamp items-center gap-4 rounded-2xl border-[3px] border-ink bg-brand px-8 py-3 font-display text-4xl font-black uppercase tracking-tight text-ink shadow-lift sm:text-5xl">
            <Lock /> Trading is closed
          </p>
          <p className="mt-4 animate-pulse-soft font-editorial text-2xl italic text-ink-muted">
            The market is playing out the {noun.toLowerCase()}…
          </p>
        </>
      ) : period ? (
        <>
          <p className="mt-4 font-display text-4xl font-black uppercase tracking-tight text-ink sm:text-5xl">
            {noun} {round} is in
          </p>
          <p className="mt-4 flex items-center gap-3 text-3xl font-bold text-ink">
            The market <ChangeChip value={period.index_return} size="lg" />
          </p>
          <Movers period={period} names={names} />
        </>
      ) : (
        <p className="mt-6 animate-pulse-soft font-editorial text-3xl italic text-ink-muted">
          Results are coming in…
        </p>
      )}
    </section>
  );
}

/** The period's three biggest risers and fallers, as big chips. */
function Movers({
  period,
  names,
  compact = false,
}: {
  period: MarketPeriodResultRow;
  names: Map<number, SessionInstrumentRow>;
  /** one row of pills, for the takeover, where height is short */
  compact?: boolean;
}) {
  const up = period.movers.filter((m) => m.ret > 0).slice(0, 3);
  const down = [...period.movers]
    .filter((m) => m.ret < 0)
    .sort((a, b) => a.ret - b.ret)
    .slice(0, 3);
  if (up.length + down.length === 0) return null;
  const item = (m: { slot: number; ret: number }, i: number) => (
    <li
      key={m.slot}
      style={{ "--i": i + 4 } as React.CSSProperties}
      className={clsx(
        "stagger flex animate-rise items-center gap-3 rounded-2xl border-2 bg-surface text-ink",
        compact
          ? "border-white/60 py-1.5 pl-4 pr-2"
          : "justify-between border-ink px-4 py-2 shadow-card",
      )}
    >
      <span className="font-mono text-2xl font-black">
        {names.get(m.slot)?.ticker ?? "?"}
      </span>
      <ChangeChip value={m.ret} size="lg" />
    </li>
  );
  if (compact) {
    return (
      <ul className="mx-auto flex max-w-5xl flex-wrap justify-center gap-3">
        {[...up, ...down].map(item)}
      </ul>
    );
  }
  return (
    <div className="mx-auto mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
      {up.length > 0 ? <ul className="space-y-2">{up.map(item)}</ul> : <span />}
      {down.length > 0 ? (
        <ul className="space-y-2">{down.map((m, i) => item(m, i + 3))}</ul>
      ) : null}
    </div>
  );
}

/* ── The board ───────────────────────────────────────────────────────────── */
function Leaderboard({
  model,
  moves,
  changes,
  rows,
}: {
  model: HostModel;
  moves: Map<string, number>;
  changes: Map<string, number>;
  /** a slice of the standings (places 4+ under the podium); all of them by default */
  rows?: NonNullable<HostModel["standings"]>;
}) {
  const list = rows ?? model.standings ?? [];
  if (list.length === 0) {
    return (
      <p className="text-center font-editorial text-xl italic text-ink-subtle">
        No players yet.
      </p>
    );
  }
  return (
    <CondensedList
      items={list}
      keyOf={(r) => r.player_id}
      moreNoun="players"
      className="space-y-2"
      gapClassName="font-editorial text-lg italic text-ink-muted hover:text-ink"
      toggleClassName="mt-3 font-editorial text-lg italic text-ink-muted hover:text-ink"
      renderItem={(r, i) => {
        // As a percentage: "−8.0%" leaves the name room that "−$8,930.93" takes.
        const d = changes.get(r.player_id);
        const pct = d != null && r.nlv - d > 0 ? d / (r.nlv - d) : null;
        return (
          <li
            style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
            className="stagger flex animate-rise items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-surface px-5 py-3 shadow-card"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border-2 px-1 font-mono text-2xl font-bold ${
                  r.rank === 1
                    ? "border-ink bg-brand text-ink"
                    : r.rank <= 3
                      ? "border-ink bg-paper-2 text-ink"
                      : "border-transparent text-ink-muted"
                }`}
              >
                {r.rank}
              </span>
              <RankMove move={moves.get(r.player_id)} size="lg" />
              <span className="truncate font-display text-2xl font-extrabold text-ink sm:text-3xl">
                {r.display_name}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {pct != null && Math.abs(pct) >= 0.00005 ? (
                <ChangeChip value={pct} size="lg" />
              ) : null}
              <span className="font-mono text-2xl font-bold text-ink sm:text-3xl">
                {centsText(r.nlv).replace(/\.\d\d$/, "")}
              </span>
            </span>
          </li>
        );
      }}
    />
  );
}

/* ── The reveal ──────────────────────────────────────────────────────────── */
function RevealTakeover({
  model,
  period,
  bars,
  moves,
  celebrate,
  onDismiss,
}: {
  model: HostModel;
  period: MarketPeriodResultRow;
  bars: DailyBar[] | null;
  moves: Map<string, number>;
  celebrate: boolean;
  onDismiss: () => void;
}) {
  const noun = periodNoun(model.cfg.period);
  const ret = period.index_return ?? 0;
  const up = ret >= 0;
  const names = new Map(model.instruments.map((i) => [i.slot, i]));
  // The period's line, once the history that includes it has arrived.
  const points = useMemo(() => {
    if (!bars || period.first_game_day == null || period.last_game_day == null)
      return null;
    const slice = periodSlice(
      bars,
      period.first_game_day,
      period.last_game_day,
    );
    if (slice.length < 2 || slice[slice.length - 1][0] < period.last_game_day)
      return null;
    return toPoints(slice);
  }, [bars, period]);
  const climber = useMemo(() => {
    let best: { id: string; move: number } | null = null;
    for (const [id, move] of moves)
      if (move > 0 && (!best || move > best.move)) best = { id, move };
    if (!best) return null;
    const name = model.standings?.find(
      (s) => s.player_id === best!.id,
    )?.display_name;
    return name ? { name, move: best.move } : null;
  }, [moves, model.standings]);
  const a = model.activity;
  // A quarter of the screen's height, so the whole takeover fits a 720p projector.
  const [chartHeight, setChartHeight] = useState(220);
  useEffect(
    () =>
      setChartHeight(
        Math.round(Math.min(300, Math.max(160, window.innerHeight * 0.26))),
      ),
    [],
  );

  // A click anywhere dismisses it (the host's mouse is the only input on a
  // projector); the X is the labelled control for keyboards and screen readers.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${noun} ${model.round} results`}
      onClick={onDismiss}
      className={clsx(
        "fixed inset-0 z-50 flex animate-pop-in cursor-pointer flex-col items-center justify-center gap-[2.2vh] overflow-hidden px-[4vw] py-[3vh] text-white",
        up ? "bg-gain" : "bg-loss",
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close the results"
        autoFocus
        className="absolute right-[3vw] top-[2.5vh] z-10 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-surface text-2xl text-ink shadow-card"
      >
        <X />
      </button>
      <Sunburst />
      {celebrate && up ? <Confetti /> : null}
      <span className="relative font-display text-xl font-extrabold uppercase tracking-[0.3em] opacity-90">
        {noun} {model.round} is in
      </span>
      <span className="relative animate-stamp font-display text-[clamp(2.5rem,min(8vw,10vh),7rem)] font-black uppercase leading-none tracking-tight">
        The market {up ? "rose" : "fell"}
      </span>
      <span className="relative animate-count-pop font-mono text-[clamp(2rem,min(6vw,8vh),5rem)] font-black leading-none [animation-delay:0.3s]">
        {returnText(period.index_return)}
      </span>
      {points ? (
        <div className="relative w-full max-w-4xl rounded-3xl border-[3px] border-ink bg-surface p-4 text-left shadow-lift">
          <PriceChart
            points={points}
            baseline={points[0].value}
            height={chartHeight}
            size="lg"
            animate
            format={axisMoney}
            ariaLabel={`The index fund over ${noun.toLowerCase()} ${model.round}`}
          />
        </div>
      ) : null}
      <div className="relative w-full max-w-4xl">
        <Movers period={period} names={names} compact />
      </div>
      <span className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-2xl font-bold">
        {a ? (
          <span>
            {a.players_with_orders} of {a.players} traded
          </span>
        ) : null}
        {climber ? (
          <span>
            Biggest climb: {climber.name} (up {climber.move})
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* ── Finished ────────────────────────────────────────────────────────────── */
const FINALE = [
  "Final standings",
  "The real market",
  "Did trading pay?",
] as const;
const SIMULATED_FINALE = [
  "Final standings",
  "The companies",
  "Did trading pay?",
] as const;

/**
 * The finale, three screens the host steps through (the buttons, or the arrow
 * keys and space): the podium, then the real era and companies, then the
 * class's turnover against return with the Barber & Odean takeaway. Dots
 * only, never names.
 */
function PresentFinished({
  model,
  actions,
}: {
  model: HostModel;
  actions: PresentActions;
}) {
  const [step, setStep] = useState(0);
  const simulated = isSimulatedMarket(model.cfg);
  const steps = simulated ? SIMULATED_FINALE : FINALE;
  const { reveal, retry } = useReveal(actions.loadReveal);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("button, a, input, textarea, select")
      )
        return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setStep((s) => Math.min(steps.length - 1, s + 1));
      } else if (e.key === "ArrowLeft") {
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="flex flex-1 flex-col">
      {step === 0 ? (
        <FinalStandings model={model} />
      ) : reveal === undefined ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-3xl">
            <RevealSkeleton rows={5} />
          </div>
        </div>
      ) : reveal === null ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-2xl">
            <RevealError onRetry={retry} />
          </div>
        </div>
      ) : step === 1 ? (
        <FinaleMarket reveal={reveal} simulated={simulated} />
      ) : (
        <FinaleTurnover reveal={reveal} />
      )}
      <nav
        aria-label="Finale"
        className="mt-6 flex flex-wrap items-center justify-center gap-3"
      >
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
            className={clsx(
              "min-h-[48px] rounded-full border-2 border-ink px-5 font-display text-lg font-extrabold uppercase tracking-tight shadow-card transition",
              i === step
                ? "bg-ink text-paper-inverse"
                : "bg-surface text-ink-muted hover:text-ink",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function FinalStandings({ model }: { model: HostModel }) {
  const rows = model.standings ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const noun = periodNoun(model.cfg.period).toLowerCase();
  const market =
    model.periods.reduce((v, p) => v * (1 + Number(p.index_return ?? 0)), 1) -
    1;
  const changes = useMemo(() => new Map<string, number>(), []);
  return (
    <div className="flex flex-1 flex-col py-4">
      <div className="mb-8 text-center">
        <h2 className="flex animate-rise items-center justify-center gap-3 font-display text-5xl font-black uppercase tracking-tight text-ink">
          <Trophy className="text-ink" /> Final standings
        </h2>
        <p className="mt-1 font-editorial text-2xl italic text-ink-muted">
          {model.periods.length} {noun}
          {model.periods.length === 1 ? "" : "s"} · the market{" "}
          {returnText(market)} · game over
        </p>
      </div>
      {podium.length > 0 ? (
        <Podium
          entries={podium.map((r) => ({
            id: r.player_id,
            name: r.display_name,
            value: r.nlv,
          }))}
          startingWealth={model.cfg.starting_wealth}
        />
      ) : null}
      {rest.length > 0 ? (
        <div className="mx-auto mt-8 w-full max-w-3xl">
          <Leaderboard
            model={model}
            moves={new Map()}
            changes={changes}
            rows={rest}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * "It was 1987–1993": the stamp, then every fake name beside its real company
 * and how its price moved. On the simulated market there is no era to stamp:
 * each company the class traded and how it did.
 */
function FinaleMarket({
  reveal,
  simulated,
}: {
  reveal: TradingReveal;
  simulated: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center py-4">
      {simulated ? (
        <h2 className="animate-rise text-center font-display text-5xl font-black uppercase tracking-tight text-ink">
          How each company did
        </h2>
      ) : (
        <>
          <p className="font-display text-3xl font-extrabold uppercase tracking-wide text-ink-muted">
            It was
          </p>
          <h2 className="mt-1 animate-stamp rounded-2xl border-[3px] border-ink bg-brand px-10 py-3 font-display text-[clamp(4rem,10vw,9rem)] font-black leading-none tracking-tight text-ink shadow-lift">
            {eraText(reveal)}
          </h2>
        </>
      )}
      <p className="mt-4 font-editorial text-2xl italic text-ink-muted">
        {simulated
          ? "A simulated market: generated prices, no real companies."
          : "Every price was real. Only the names were changed."}
      </p>
      <ul className="mt-8 grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-3 xl:grid-cols-3">
        {reveal.instruments.map((i, k) => (
          <li
            key={i.slot}
            className="flex animate-rise items-center gap-3 rounded-xl border-2 border-ink bg-surface px-4 py-2.5 shadow-card"
            style={{ animationDelay: `${Math.min(k, 20) * 0.04}s` }}
          >
            <span
              className={clsx(
                "w-24 shrink-0 font-mono text-lg font-bold text-ink-muted",
                !simulated && "line-through decoration-2",
              )}
            >
              {i.ticker}
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold text-ink">
              {simulated ? i.name : i.real_name}
            </span>
            <ChangeChip value={i.price_change} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinaleTurnover({ reveal }: { reveal: TradingReveal }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col py-4">
      <h2 className="text-center font-display text-5xl font-black uppercase tracking-tight text-ink">
        Did trading more pay?
      </h2>
      <p className="mb-6 mt-1 text-center font-editorial text-2xl italic text-ink-muted">
        Each dot is one of you. The dashed line is buying the index fund and
        holding it.
      </p>
      <ClassTurnover reveal={reveal} size="lg" height={480} />
    </div>
  );
}
