"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Button,
  buttonClasses,
  Card,
  CountUp,
  SectionTitle,
} from "@/components/ui";
import { Flag, Newspaper } from "@/components/icons";
import { ChangeChip, Stat, TickerBadge } from "@/components/markets/parts";
import {
  ClassTurnover,
  RevealError,
  RevealSkeleton,
  useReveal,
} from "@/components/markets/RevealParts";
import { centsText, percentText, returnText } from "@/lib/markets/format";
import { ordinal, sharpeText } from "@/lib/game/format";
import type { TradingReveal } from "@/lib/markets/db";
import {
  eraText,
  fillText,
  revealCalendar,
  revealTimeline,
  vsIndexText,
} from "@/lib/markets/trading/reveal";
import { isSimulatedMarket } from "@/lib/markets/trading/config";
import type { TradingPeriod } from "@/lib/game/types";
import { clsx } from "@/components/clsx";
import type { TradingActions, TradingModel } from "./model";

/** periods shown before "Show all" */
const FIRST_PERIODS = 6;

/**
 * Game over: the final account value, the result against buying and holding
 * the index fund, rank, Sharpe, drawdown and turnover, then the reveal: which
 * era it was, which real companies the fake names stood for, the student's
 * own trades on the real calendar beside that period's headlines, and the
 * class's turnover against return (anonymous dots, theirs marked). A game on
 * the simulated market has no era or real companies: it shows how each
 * company did, and the trades in game time.
 */
export function TradingFinished({
  model,
  actions,
}: {
  model: TradingModel;
  actions: TradingActions;
}) {
  const { account } = model;
  const me = model.standings?.find((r) => r.is_me) ?? null;
  const { reveal, retry } = useReveal(actions.loadReveal);
  const mine = reveal?.class.find((c) => c.is_me) ?? null;
  const myReturn = mine ? Number(mine.return) : account.changePct;
  const tone =
    account.change > 0.005 ? "gain" : account.change < -0.005 ? "loss" : "flat";
  const simulated = isSimulatedMarket(model.cfg);

  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-5 px-4 py-8">
      <div className="text-center">
        <span className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-5 py-2 font-display text-2xl font-black uppercase tracking-tight text-ink shadow-card">
          <Flag /> Game over
        </span>
      </div>

      <section
        className={clsx(
          "rounded-2xl border-[2.5px] border-ink p-5 text-white shadow-lift",
          tone === "gain" ? "bg-gain" : tone === "loss" ? "bg-loss" : "bg-ink",
        )}
      >
        <div className="font-display text-xs font-extrabold uppercase tracking-wide text-white/85">
          Final account value
        </div>
        <CountUp
          value={account.nlv}
          from={account.startingCash}
          duration={1600}
          format={centsText}
          className="mt-1 block font-mono text-4xl font-bold tracking-tight"
        />
        <div className="mt-2 font-mono text-sm font-bold text-white/90">
          {returnText(account.changePct)} on {centsText(account.startingCash)}
        </div>
      </section>

      {reveal === null ? <RevealError onRetry={retry} /> : null}

      <Card className="p-5">
        <SectionTitle>You vs the index fund</SectionTitle>
        {reveal === undefined ? (
          <div className="mt-3">
            <RevealSkeleton rows={1} />
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Versus label="You" value={myReturn} me />
              <Versus
                label="Buy and hold"
                value={reveal?.index_return ?? null}
              />
            </div>
            {reveal ? (
              <p className="mt-3 text-sm text-ink">
                {vsIndexText(myReturn, reveal.index_return)}
              </p>
            ) : null}
          </>
        )}
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5">
        <Stat
          label="Rank"
          hint={reveal ? `of ${reveal.class.length}` : undefined}
        >
          {me ? ordinal(me.rank) : "—"}
        </Stat>
        <Stat label="Sharpe" hint="annualized">
          {sharpeText(account.sharpe)}
        </Stat>
        <Stat label="Drawdown" hint="worst fall">
          {account.maxDrawdown > 0
            ? `−${percentText(account.maxDrawdown)}`
            : "0%"}
        </Stat>
        <Stat label="Turnover" hint="a year">
          {mine ? `${Number(Number(mine.turnover).toFixed(2))}×` : "—"}
        </Stat>
      </Card>

      {reveal ? (
        <>
          <RealMarket reveal={reveal} simulated={simulated} />
          <Timeline
            reveal={reveal}
            period={model.cfg.period}
            simulated={simulated}
          />
          <Card className="p-5">
            <SectionTitle>Did trading more pay?</SectionTitle>
            <p className="mt-1 text-sm text-ink-muted">
              Every dot is a classmate. You are the amber one.
            </p>
            <div className="mt-3">
              <ClassTurnover reveal={reveal} />
            </div>
          </Card>
        </>
      ) : reveal === undefined ? (
        <Card className="p-5">
          <RevealSkeleton rows={4} />
        </Card>
      ) : null}

      <Link href="/" className={buttonClasses("secondary", "md", "w-full")}>
        Home
      </Link>
    </main>
  );
}

function Versus({
  label,
  value,
  me = false,
}: {
  label: string;
  value: number | null;
  me?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border-2 border-ink px-3 py-2.5",
        me ? "bg-brand-soft" : "bg-play-soft",
      )}
    >
      <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className="mt-1">
        <ChangeChip value={value} />
      </div>
    </div>
  );
}

/**
 * The era and the real companies behind the fake names, with each one's price
 * change over the game; on the simulated market, just how each company did.
 */
function RealMarket({
  reveal,
  simulated,
}: {
  reveal: TradingReveal;
  simulated: boolean;
}) {
  return (
    <Card className="p-5">
      <SectionTitle>
        {simulated ? "How each company did" : `It was ${eraText(reveal)}`}
      </SectionTitle>
      <p className="mt-1 text-sm text-ink-muted">
        {simulated
          ? "A simulated market: generated prices, no real companies."
          : "Every price was real. Only the names were changed."}
      </p>
      <ul className="mt-3 divide-y divide-ink/10">
        {reveal.instruments.map((i) => (
          <li key={i.slot} className="flex items-center gap-3 py-2.5">
            <TickerBadge ticker={i.ticker} kind={i.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">
                {simulated ? i.name : i.real_name}
              </span>
              <span className="block truncate font-mono text-xs text-ink-muted">
                {simulated ? i.sector : i.real_ticker}
                {!simulated && i.current_name && i.current_name !== i.real_name
                  ? ` · today ${i.current_name}`
                  : ""}
              </span>
            </span>
            <ChangeChip value={i.price_change} size="sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The student's own trades period by period on the real calendar (or in game time), beside that period's headlines. */
function Timeline({
  reveal,
  period,
  simulated,
}: {
  reveal: TradingReveal;
  period: TradingPeriod;
  simulated: boolean;
}) {
  const [all, setAll] = useState(false);
  const cal = revealCalendar(reveal, simulated);
  const periods = revealTimeline(reveal, period, false, cal);
  const shown = all ? periods : periods.slice(0, FIRST_PERIODS);
  const names = new Map(reveal.instruments.map((i) => [i.slot, i]));
  const traded = reveal.my_fills.length > 0;
  return (
    <Card className="p-5">
      <SectionTitle>
        {simulated
          ? "Your trades, period by period"
          : "Your trades on the real calendar"}
      </SectionTitle>
      {!traded ? (
        <p className="mt-1 text-sm text-ink-muted">
          You made no trades. Here is what happened.
        </p>
      ) : null}
      {periods.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Nothing to show.</p>
      ) : (
        <ol className="mt-4 space-y-5 border-l-2 border-ink/15 pl-4">
          {shown.map((p) => (
            <li key={p.round} className="relative">
              <span
                aria-hidden="true"
                className={clsx(
                  "absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-ink",
                  p.fills.length ? "bg-brand" : "bg-surface",
                )}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-ink">
                  {p.span}
                </span>
                {p.indexReturn != null ? (
                  <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                    Index <ChangeChip value={p.indexReturn} size="sm" />
                  </span>
                ) : null}
              </div>
              {p.headlines.map((h) => (
                <p
                  key={h.month + h.text}
                  className="mt-1.5 flex gap-1.5 text-sm text-ink-muted"
                >
                  <Newspaper aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-mono text-xs">
                      {cal.month(h.month)}
                    </span>{" "}
                    {h.text}
                  </span>
                </p>
              ))}
              {p.fills.length ? (
                <ul className="mt-2 space-y-1">
                  {p.fills.map((f, k) => (
                    <li key={k} className="flex gap-2 text-sm text-ink">
                      <span className="w-[5.5rem] shrink-0 font-mono text-xs leading-5 text-ink-muted">
                        {cal.date(f.date)}
                      </span>
                      <span
                        className={clsx(
                          f.reason !== "order" && "font-semibold text-loss",
                        )}
                      >
                        {fillText(f, names.get(f.slot), simulated)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {periods.length > FIRST_PERIODS ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show fewer" : `Show all ${periods.length} periods`}
        </Button>
      ) : null}
    </Card>
  );
}
