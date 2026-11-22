"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button, CountUp } from "@/components/ui";
import { Confetti } from "@/components/Confetti";
import { ArrowRight, Newspaper } from "@/components/icons";
import { ChangeChip } from "@/components/markets/parts";
import { PriceChart, type ChartPoint } from "@/components/markets/PriceChart";
import { centsText, compactMoney, LEDGER_TEXT, priceText, returnText, SIDE_TEXT, sharesText } from "@/lib/markets/format";
import { formatGameDate, formatGameMonth, periodNoun } from "@/lib/markets/clock";
import { ordinal } from "@/lib/game/format";
import { periodCashflows } from "@/lib/markets/trading/view";
import { clsx } from "@/components/clsx";
import type { TradingActions, TradingModel } from "./model";

/**
 * The period played out: a full-screen takeover. The stamp lands, the account
 * value rolls from where the period started to where it ended while its daily
 * line draws itself, and below sit the market's return, every fill, the cash
 * that came and went, the orders that did not fill, the headlines and the
 * student's rank. One button goes back to the market.
 */
export function PeriodReveal({
  model,
  actions,
  celebrate,
  onDone,
}: {
  model: TradingModel;
  actions: TradingActions;
  celebrate: boolean;
  onDone: () => void;
}) {
  const round = model.round;
  const noun = periodNoun(model.cfg.period);
  const ar = model.accountRounds.find((r) => r.round_number === round);
  const period = model.periods.find((p) => p.round_number === round) ?? null;
  const fills = model.fills.filter((f) => f.round_number === round);
  const flows = periodCashflows(model.ledger, round);
  // this period's orders that did not fill (older ones are in the Orders tab)
  const endedNow = model.orders.filter(
    (o) => o.placed_round === round && (o.status === "rejected" || o.status === "expired"),
  );
  const tickers = new Map(model.listings.map((l) => [l.slot, l.ticker]));
  const me = model.standings?.find((r) => r.is_me) ?? null;

  const start = ar ? Number(ar.nlv_start) : model.account.nlv;
  const end = ar ? Number(ar.nlv_end) : model.account.nlv;
  const delta = end - start;
  const ret = start > 0 ? end / start - 1 : null;
  const points = useMemo<ChartPoint[]>(() => {
    const days = ar?.daily_nlv ?? [];
    const end = model.asOf ? formatGameDate(model.asOf) : null;
    return [start, ...days.map(Number)].map((v, i) => ({
      x: i,
      value: v,
      label: i === 0 ? `${noun} start` : i === days.length && end ? end : `Trading day ${i}`,
    }));
  }, [ar, start, model.asOf, noun]);

  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    actions.log("reveal_view", { round, nlv_end: end, fills: fills.length });
    btn.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = delta > 0.005 ? "gain" : delta < -0.005 ? "loss" : "flat";
  // the celebrate_fills knob: confetti for a winning period with fills (logged, since it is a treatment)
  const confetti = celebrate && fills.length > 0 && tone === "gain";
  useEffect(() => {
    if (confetti) actions.log("celebration_shown", { round, fills: fills.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-paper"
    >
      {confetti ? <Confetti /> : null}
      <div className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6">
        <div className="text-center">
          <span
            id="reveal-title"
            className="inline-flex animate-stamp items-center gap-2 rounded-xl border-[3px] border-ink bg-brand px-5 py-2 font-display text-2xl font-black uppercase tracking-tight text-ink shadow-card"
          >
            {noun} {round} is in
          </span>
        </div>

        <section
          className={clsx(
            "overflow-hidden rounded-2xl border-[2.5px] border-ink p-5 shadow-lift",
            tone === "gain" ? "bg-gain-soft" : tone === "loss" ? "bg-loss-soft" : "bg-surface",
          )}
        >
          <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            Your account
          </div>
          <CountUp
            value={end}
            from={start}
            duration={1800}
            format={centsText}
            className="mt-1 block font-mono text-4xl font-bold tracking-tight text-ink"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChangeChip value={delta} money />
            <ChangeChip value={ret} />
            <span className="text-xs text-ink-muted">this {noun.toLowerCase()}</span>
          </div>
          {points.length > 1 ? (
            <div className="mt-4 rounded-xl border-2 border-ink bg-surface p-2">
              <PriceChart
                points={points}
                height={150}
                baseline={start}
                format={compactMoney}
                animate
                ariaLabel={`Your account through ${noun.toLowerCase()} ${round}: ${returnText(ret)}`}
              />
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Compare label="You" value={ret} />
            <Compare label="The market" value={period?.index_return ?? null} />
          </div>
        </section>

        {me ? (
          <p className="text-center font-display text-lg font-extrabold uppercase tracking-tight text-ink">
            You&apos;re {ordinal(me.rank)}
            {model.standings && model.standings.length > 1 ? ` of ${model.standings.length}` : ""}
          </p>
        ) : null}

        <Section title="Your trades">
          {fills.length === 0 ? (
            <p className="font-editorial text-sm italic text-ink-muted">Nothing filled this {noun.toLowerCase()}.</p>
          ) : (
            <ul className="divide-y divide-ink/10">
              {fills.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold text-ink">
                      {SIDE_TEXT[f.side]} {sharesText(Number(f.quantity))} {tickers.get(f.slot)}
                    </span>
                    {f.reason !== "order" ? (
                      <span className="block text-xs font-semibold text-loss">
                        {f.reason === "margin_call" ? "Margin call" : "Company stopped trading"}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono font-bold text-ink">@ {priceText(Number(f.price))}</span>
                </li>
              ))}
            </ul>
          )}
          {endedNow.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-ink/10 pt-2">
              {endedNow.map((o) => (
                <li key={o.id} className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink">{tickers.get(o.slot)}</span>{" "}
                  {o.status === "expired"
                    ? "order expired without filling"
                    : `order not filled: ${o.reject_reason ?? "refused"}`}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {flows.length > 0 ? (
          <Section title="Cash in and out">
            <dl className="divide-y divide-ink/10">
              {flows.map((f) => (
                <div key={f.kind} className="flex items-center justify-between py-2 text-sm">
                  <dt className="text-ink-muted">{LEDGER_TEXT[f.kind]}</dt>
                  <dd>
                    <ChangeChip value={f.amount} money size="sm" />
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        {period && period.headlines.length > 0 ? (
          <Section title="In the news" icon={<Newspaper />}>
            <ul className="space-y-3">
              {period.headlines.map((h, i) => (
                <li key={i} className="text-sm text-ink">
                  <span className="block font-mono text-xs text-ink-muted">{formatGameMonth(h.y, h.m)}</span>
                  {h.text}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Button ref={btn} className="w-full text-lg shadow-pop" onClick={onDone}>
          Back to the market <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Compare({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border-2 border-ink bg-surface px-3 py-2">
      <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5">
        <ChangeChip value={value} />
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="animate-rise rounded-2xl border-2 border-ink bg-surface p-5 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
