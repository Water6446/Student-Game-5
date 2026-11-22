"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "@/components/clsx";
import type { PlayerRow } from "@/lib/game/db";
import type { SessionInstrumentRow, TradingStandingRow, TradingTruth } from "@/lib/markets/db";
import type { TradingConfig } from "@/lib/markets/trading/config";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import { configSummary, roundsLine } from "@/lib/markets/trading/summary";
import { FRICTION_PROFILE_TEXT, frictionLabel, frictionSummary, type FrictionKnobs } from "@/lib/research/friction";
import type { SessionConditions } from "@/components/markets/use-friction";
import { centsText, percentText } from "@/lib/markets/format";
import { sharpeText } from "@/lib/game/format";
import { Banner, Button } from "@/components/ui";
import { CondensedList } from "@/components/CondensedList";
import { RankBadge } from "@/components/RankBadge";
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Sliders } from "@/components/icons";
import { ChangeChip, TickerBadge } from "@/components/markets/parts";

/** Open / Time's up / Results: a label, not a button, so no offset shadow. The dot pings while orders come in. */
export function TradingStatusBadge({ phase }: { phase: TradingPhase }) {
  const styles: Partial<Record<TradingPhase, { cls: string; dot: string; label: string }>> = {
    loading: { cls: "bg-paper-2 text-ink-muted", dot: "bg-ink-subtle", label: "Loading" },
    open: { cls: "bg-gain-soft text-gain", dot: "bg-gain", label: "Trading" },
    closed: { cls: "bg-brand-soft text-ink", dot: "bg-brand-strong", label: "Closed" },
    revealed: { cls: "bg-play-soft text-play", dot: "bg-play", label: "Revealed" },
  };
  const s = styles[phase];
  if (!s) return null;
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide ${s.cls}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {phase === "open" ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${s.dot}`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}

/** Places climbed or fallen over the last period: "▲2" in green, "▼1" in red, nothing when level. */
export function RankMove({ move, size = "sm" }: { move: number | undefined; size?: "sm" | "lg" }) {
  if (!move) return null;
  const up = move > 0;
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center font-mono font-bold",
        size === "lg" ? "text-xl" : "text-xs",
        up ? "text-gain" : "text-loss",
      )}
      aria-label={`${up ? "up" : "down"} ${Math.abs(move)} place${Math.abs(move) === 1 ? "" : "s"}`}
    >
      {up ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
      {Math.abs(move)}
    </span>
  );
}

/** "Sharpe 0.84 · drawdown 6.2%": the risk side of a standings row. */
export function riskLine(sharpe: number | null, drawdown: number): string {
  return `Sharpe ${sharpeText(sharpe)} · drawdown ${percentText(drawdown)}`;
}

// The control panel's list: whoever is falling behind matters as much as the
// lead, so it keeps the top and the bottom in view.
const STANDINGS_CONDENSE = { top: 8, bottom: 3 };

/**
 * The host's live leaderboard: rank (and places moved last period), name, the
 * account value in ink, its change last period as a chip, and Sharpe and
 * drawdown under the value. Ranks are the server's (get_trading_standings).
 */
export function HostStandings({
  standings,
  players,
  moves,
  changes,
  manage,
}: {
  standings: TradingStandingRow[] | null;
  players: PlayerRow[];
  moves: Map<string, number>;
  changes: Map<string, number>;
  manage?: (player: PlayerRow) => React.ReactNode;
}) {
  if (standings == null) {
    return <p className="font-editorial text-sm italic text-ink-subtle">Loading the standings…</p>;
  }
  if (standings.length === 0) {
    return <p className="font-editorial text-sm italic text-ink-subtle">No players yet.</p>;
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <CondensedList
      items={standings}
      keyOf={(r) => r.player_id}
      options={STANDINGS_CONDENSE}
      moreNoun="players"
      className="space-y-1.5"
      gapClassName="font-editorial text-sm italic text-ink-subtle hover:text-ink"
      toggleClassName="mt-2 font-editorial text-sm italic text-ink-subtle hover:text-ink"
      renderItem={(r) => {
        const p = byId.get(r.player_id);
        return (
          <li className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-paper-2 px-3 py-2">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <RankBadge rank={r.rank} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate font-semibold text-ink">{r.display_name}</span>
                  <RankMove move={moves.get(r.player_id)} />
                </span>
                {/* under the name, so a phone keeps the name readable */}
                <span className="block truncate font-mono text-[11px] leading-tight text-ink-subtle">
                  {riskLine(r.sharpe, r.max_drawdown)}
                </span>
              </span>
              {p && manage ? manage(p) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {changes.has(r.player_id) ? (
                <ChangeChip value={changes.get(r.player_id)} money size="sm" className="hidden sm:inline-flex" />
              ) : null}
              <span className="font-mono text-base font-bold text-ink">{centsText(r.nlv)}</span>
            </span>
          </li>
        );
      }}
    />
  );
}

/** The session's setup in plain words, collapsed: rarely needed mid-class. */
export function SettingsDisclosure({
  cfg,
  knobs,
  conditions,
  children,
}: {
  cfg: TradingConfig;
  knobs: FrictionKnobs;
  conditions?: SessionConditions | null;
  /** more at the bottom (the research download) */
  children?: React.ReactNode;
}) {
  const perPlayer = cfg.friction_assignment === "per_player";
  return (
    <details className="group">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl border-2 border-ink bg-paper-2 px-4 text-sm font-semibold text-ink transition marker:content-none hover:bg-brand-soft [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Sliders /> Session settings
        </span>
        <ChevronDown className="transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-3 rounded-xl border-2 border-ink bg-surface p-4 text-sm text-ink-muted">
        <ul className="space-y-1">
          <li>{roundsLine(cfg)}</li>
          {configSummary(cfg).map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>
            {cfg.show_full_leaderboard_to_students
              ? "Students see the full leaderboard"
              : "Students see only their own rank"}
          </li>
        </ul>
        <div>
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink">
            {perPlayer ? `Friction: ${frictionLabel(cfg)}` : `${frictionLabel(cfg)} friction, what students get`}
          </div>
          {perPlayer ? (
            <ul className="mt-1 space-y-0.5">
              {cfg.friction_arms.map((arm) => {
                const n = conditions?.armCounts.find((a) => a.arm === arm)?.players ?? 0;
                return (
                  <li key={arm}>
                    {FRICTION_PROFILE_TEXT[arm].label}: {n} student{n === 1 ? "" : "s"}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {frictionSummary(knobs).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {cfg.research_mode ? (
          <div>
            <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink">Research consent</div>
            <p className="mt-1">
              {conditions
                ? `${conditions.consent.agreed} agreed · ${conditions.consent.declined} declined · ${conditions.consent.undecided} not answered`
                : "Counting…"}
            </p>
          </div>
        ) : null}
        {children}
      </div>
    </details>
  );
}

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * The real era and the real companies behind the fake names, for the host
 * only (get_trading_truth). Hidden until asked for on every visit, because a
 * host's laptop is often mirrored to the projector; the projector never shows it.
 */
export function RealDates({
  loadTruth,
  instruments,
  finished = false,
}: {
  loadTruth: () => Promise<TradingTruth | null>;
  instruments: SessionInstrumentRow[];
  /** the game is over: open from the start, and no longer a secret */
  finished?: boolean;
}) {
  const [open, setOpen] = useState(finished);
  const [truth, setTruth] = useState<TradingTruth | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  const load = useRef(loadTruth);
  load.current = loadTruth;

  // Fetched the first time it opens, then kept for the visit.
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void load.current().then((t) => (t ? setTruth(t) : setFailed(true)));
  }, [open]);
  const show = () => setOpen(true);

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={show}>
        <Eye /> Show real dates <span className="font-normal text-ink-muted">(host only)</span>
      </Button>
    );
  }

  const fake = new Map(instruments.map((i) => [i.slot, i]));
  return (
    <section className="rounded-xl border-2 border-ink bg-paper-2 p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">The real market</h3>
          <p className="text-xs text-ink-muted">
            {finished
              ? "The game is over, so students see this too."
              : "Only on this screen. Check the projector isn’t mirroring it."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="min-w-[44px]">
          <EyeOff /> Hide
        </Button>
      </div>
      {failed ? (
        <div className="mt-3">
          <Banner kind="error">Couldn&apos;t load the real dates. Reload the page to try again.</Banner>
        </div>
      ) : !truth ? (
        <p className="mt-3 font-editorial text-sm italic text-ink-subtle">Loading…</p>
      ) : (
        <>
          <p className="mt-3 font-display text-2xl font-black text-ink">Year 1 is {truth.start_year}</p>
          <p className="text-sm text-ink-muted">
            Trading runs {fmtDate(truth.window_first_date)} to {fmtDate(truth.window_last_date)}; the charts start{" "}
            {fmtDate(truth.history_first_date)}. {truth.host_picked_year ? "You picked the year." : "A random era."}
            {truth.data_license === "dev-only" ? " Development data." : ""}
          </p>
          <ul className="mt-3 max-h-72 divide-y divide-ink/10 overflow-y-auto rounded-lg border-2 border-ink bg-surface">
            {truth.instruments.map((t) => {
              const f = fake.get(t.slot);
              const renamed = t.current_name !== t.real_name;
              return (
                <li key={t.slot} className="flex items-center gap-3 px-3 py-2">
                  {f ? <TickerBadge ticker={f.ticker} kind={f.kind} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {t.real_name} <span className="font-mono text-xs text-ink-muted">{t.real_ticker}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-subtle">
                      {f ? `Plays as ${f.name}` : ""}
                      {renamed ? ` · today ${t.current_name} (${t.current_ticker})` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** Development data must never reach a real class: said once, at the top. */
export function DevDataBanner() {
  return (
    <Banner kind="info">
      Development market data: for testing only, never for a real class.
    </Banner>
  );
}
