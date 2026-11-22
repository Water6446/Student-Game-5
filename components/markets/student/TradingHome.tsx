"use client";

import { useMemo, useState } from "react";
import { Banner, Button, Card, CountUp, InfoTip, SectionTitle, Segmented, TextInput } from "@/components/ui";
import { ArrowRight, FileText, Pencil, Sparkle, Trophy, Wallet } from "@/components/icons";
import { consentStatusLine } from "@/lib/research/consent";
import { RankBadge } from "@/components/RankBadge";
import { ChangeChip, Stat } from "@/components/markets/parts";
import { PositionRow } from "@/components/markets/rows";
import { PriceChart, type ChartPoint } from "@/components/markets/PriceChart";
import { centsText, compactMoney, percentText, returnText } from "@/lib/markets/format";
import { formatGameDate, periodNoun, periodPlural } from "@/lib/markets/clock";
import { sharpeText } from "@/lib/game/format";
import {
  accountRanges,
  accountSeries,
  sliceAccountSeries,
  type AccountRange,
} from "@/lib/markets/trading/view";
import type { TradingActions, TradingModel } from "./model";
import type { TradingTab } from "./TradingApp";

const RANGE_TEXT = (noun: string): Record<AccountRange, string> => ({ period: noun, year: "Year", all: "All" });

export function TradingHome({
  model,
  actions,
  onOpenStock,
  onGoTo,
  onReviewConsent,
}: {
  model: TradingModel;
  actions: TradingActions;
  onOpenStock: (slot: number) => void;
  onGoTo: (tab: TradingTab) => void;
  /** reopen the consent screen (research mode) */
  onReviewConsent?: () => void;
}) {
  const { account, cfg, phase } = model;
  const noun = periodNoun(cfg.period);
  const openOrders = model.orders.filter((o) => o.status === "open").length;
  const kinds = new Map(model.listings.map((l) => [l.slot, l.kind]));

  return (
    <>
      {phase === "lobby" ? <LobbyCard model={model} actions={actions} onBrowse={() => onGoTo("market")} /> : null}
      <PhaseLine model={model} />
      {account.frozen ? (
        <Banner kind="error">
          Your account fell below zero and is frozen: you can only sell or cover what you hold.
        </Banner>
      ) : null}

      <AccountCard model={model} />

      <Card className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Buying power" hint={cfg.margin_enabled ? "with margin" : "cash only"}>
          {centsText(account.buyingPower)}
        </Stat>
        {account.marginLoan > 0 ? (
          <Stat label="Margin loan" hint="charged interest">
            <span className="text-loss">{centsText(account.marginLoan)}</span>
          </Stat>
        ) : (
          <Stat label="Cash" hint={account.shortValue > 0 ? "includes short sale proceeds" : "earns T-bill interest"}>
            {centsText(account.cash)}
          </Stat>
        )}
        <div className="flex min-w-0 items-start gap-1.5">
          <Stat label="Sharpe" hint="annualized">
            {sharpeText(account.sharpe)}
          </Stat>
          <span className="mt-0.5">
            <InfoTip label="About the Sharpe ratio">
              Return above T-bills per unit of risk, scaled to a year. It needs two {periodPlural(cfg.period)} to compute.
            </InfoTip>
          </span>
        </div>
        <div className="flex min-w-0 items-start gap-1.5">
          <Stat label="Max drawdown" hint="worst fall from a peak">
            {account.maxDrawdown > 0 ? `−${percentText(account.maxDrawdown)}` : "0%"}
          </Stat>
        </div>
      </Card>

      <Card>
        <SectionTitle
          icon={<Wallet />}
          info="Value at the last close. Gains and losses are unrealized until you sell or cover."
          infoLabel="About your positions"
        >
          Your positions
        </SectionTitle>
        {model.positions.length === 0 ? (
          <div className="mt-4 rounded-xl border-2 border-dashed border-ink/30 bg-paper-2 px-4 py-5 text-center">
            <p className="font-editorial italic text-ink-muted">No positions yet: everything is in cash.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => onGoTo("market")}>
              Browse the market <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-ink/10">
            {model.positions.map((p) => (
              <PositionRow
                key={p.slot}
                p={p}
                kind={kinds.get(p.slot)}
                onOpen={() => {
                  actions.log("position_view", { slot: p.slot, qty: p.quantity, unrealized: Math.round(p.unrealized) });
                  onOpenStock(p.slot);
                }}
              />
            ))}
          </div>
        )}
        {openOrders > 0 ? (
          <button
            type="button"
            onClick={() => onGoTo("orders")}
            className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-xl border-2 border-ink bg-play-soft px-4 text-sm font-bold text-play transition hover:bg-play-soft/70"
          >
            {openOrders} open order{openOrders === 1 ? "" : "s"}
            <ArrowRight />
          </button>
        ) : null}
      </Card>

      <StandingsCard model={model} actions={actions} />

      {model.research.mode && onReviewConsent ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink/15 bg-paper-2 px-4 py-2.5">
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
            <FileText className="shrink-0" aria-hidden="true" />
            {consentStatusLine(model.research.consent)}
          </p>
          <Button variant="ghost" size="sm" onClick={onReviewConsent}>
            Change
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** One line on where the round stands: what the student can do right now. */
function PhaseLine({ model }: { model: TradingModel }) {
  const noun = periodNoun(model.cfg.period).toLowerCase();
  const text =
    model.phase === "open"
      ? `Trading is open. Orders fill as this ${noun} plays out.`
      : model.phase === "closed"
        ? `Trading is closed. Waiting for the ${noun} to play out…`
        : model.phase === "revealed"
          ? `That ${noun} is in. The next one opens soon.`
          : model.phase === "loading"
            ? `Getting the next ${noun} ready…`
            : null;
  if (!text) return null;
  return <p className="text-center font-editorial text-sm italic text-ink-muted">{text}</p>;
}

function AccountCard({ model }: { model: TradingModel }) {
  const { account, cfg, accountRounds } = model;
  const noun = periodNoun(cfg.period);
  const revealed = accountRounds.length;
  const lastRound = accountRounds[accountRounds.length - 1]?.round_number ?? 0;
  const ranges = accountRanges(cfg.period, revealed);
  const [range, setRange] = useState<AccountRange>("all");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const series = useMemo(() => accountSeries(accountRounds, account.startingCash), [accountRounds, account.startingCash]);
  const points = useMemo<ChartPoint[]>(() => {
    const shown = ranges.includes(range) ? sliceAccountSeries(series, range, cfg.period, lastRound) : series;
    return shown.map((p) => ({ x: p.i, value: p.value, label: p.round === 0 ? "Start" : `${noun} ${p.round}` }));
  }, [series, range, ranges, cfg.period, lastRound, noun]);

  const base = points[0]?.value ?? account.startingCash;
  const value = scrub ? scrub.value : account.nlv;
  const change = scrub ? scrub.value - account.startingCash : account.change;

  return (
    <Card>
      <div className="flex items-center gap-1.5">
        <span className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
          Account value
        </span>
        <InfoTip label="About account value">
          Cash plus your shares at the last close, minus what you owe on shorts and margin. It is your score.
        </InfoTip>
      </div>
      <div aria-live="polite" className="mt-1">
        {scrub ? (
          <span className="font-mono text-4xl font-bold tracking-tight text-ink">{centsText(value)}</span>
        ) : (
          <CountUp value={value} format={centsText} className="font-mono text-4xl font-bold tracking-tight text-ink" />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChangeChip value={change} money />
        <ChangeChip value={account.startingCash > 0 ? change / account.startingCash : null} />
        <span className="text-xs text-ink-muted">
          {scrub ? scrub.label : "since the start"}
          {!scrub && model.asOf ? ` · as of ${formatGameDate(model.asOf)}` : ""}
        </span>
      </div>
      {revealed > 0 ? (
        <div className="mt-4">
          <PriceChart
            points={points}
            height={170}
            baseline={base}
            format={compactMoney}
            onScrub={setScrub}
            ariaLabel={`Account value chart, ${returnText(account.changePct)} since the start. Use the arrow keys to read values.`}
          />
          {ranges.length > 1 ? (
            <Segmented
              label="Chart range"
              size="sm"
              className="mt-3 w-full"
              value={ranges.includes(range) ? range : "all"}
              onChange={setRange}
              options={ranges.map((r) => ({ value: r, label: RANGE_TEXT(noun)[r] }))}
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border-2 border-dashed border-ink/30 bg-paper-2 px-4 py-6 text-center font-editorial text-sm italic text-ink-muted">
          Your account chart appears after the first {noun.toLowerCase()} plays out.
        </p>
      )}
    </Card>
  );
}

/** You're in, your name (editable until the game starts) and the starting cash. */
function LobbyCard({
  model,
  actions,
  onBrowse,
}: {
  model: TradingModel;
  actions: TradingActions;
  onBrowse: () => void;
}) {
  const [name, setName] = useState(model.me.name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const err = await actions.rename(name.trim().slice(0, 40) || "Player");
    if (err) setError(err);
    else setEditing(false);
  }
  return (
    <Card className="animate-pop-in text-center">
      <div className="mx-auto flex h-14 w-14 animate-bob items-center justify-center rounded-2xl border-2 border-ink bg-brand text-2xl text-ink shadow-card">
        <Sparkle />
      </div>
      <div className="mt-4 inline-flex animate-stamp items-center rounded-full border-2 border-ink bg-gain px-3.5 py-1 font-display text-sm font-extrabold uppercase tracking-wide text-white shadow-card">
        You&apos;re in
      </div>
      {editing ? (
        <div className="mt-4 space-y-3">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            maxLength={40}
            autoFocus
            aria-label="Your name"
            className="text-center text-lg"
          />
          <div className="flex justify-center gap-2">
            <Button onClick={save}>Save name</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`${model.me.name}: change your name`}
          className="group mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-xl font-bold text-ink transition hover:bg-play-soft"
        >
          {model.me.name}
          <Pencil className="text-base text-play transition-transform group-hover:-rotate-12" />
        </button>
      )}
      {error ? (
        <div className="mt-3 text-left">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}
      <p className="mt-3 font-editorial italic text-ink-muted">
        Waiting for the professor to start. The market is open for browsing.
      </p>
      <Button variant="secondary" className="mt-4 w-full" onClick={onBrowse}>
        Look around the market <ArrowRight />
      </Button>
    </Card>
  );
}

/** Your rank, and the class standings when the host shows them. */
function StandingsCard({ model, actions }: { model: TradingModel; actions: TradingActions }) {
  const rows = model.standings;
  if (!rows || rows.length === 0 || model.accountRounds.length === 0) return null;
  const me = rows.find((r) => r.is_me);
  const others = rows.length > 1;
  return (
    <Card>
      <SectionTitle icon={<Trophy />}>Standings</SectionTitle>
      {me ? (
        <p className="mt-2 text-sm text-ink">
          You&apos;re <span className="font-mono font-bold">#{me.rank}</span>
          {others ? ` of ${rows.length}` : ""} by account value.
        </p>
      ) : null}
      {others ? (
        <details
          className="group mt-3"
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) actions.log("leaderboard_view", { rank: me?.rank ?? null });
          }}
        >
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-xl border-2 border-ink bg-paper-2 px-4 text-sm font-semibold text-ink transition hover:bg-brand-soft [&::-webkit-details-marker]:hidden">
            The whole class
            <ArrowRight className="transition-transform duration-200 group-open:rotate-90" />
          </summary>
          <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li
                key={r.player_id}
                className={
                  r.is_me
                    ? "flex items-center gap-3 rounded-xl border-2 border-ink bg-play-soft px-3 py-2"
                    : "flex items-center gap-3 rounded-xl border-2 border-ink bg-paper-2 px-3 py-2"
                }
              >
                <RankBadge rank={r.rank} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {r.display_name}
                  {r.is_me ? " (you)" : ""}
                </span>
                <span className="font-mono text-sm font-bold text-ink">{centsText(r.nlv)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Card>
  );
}
