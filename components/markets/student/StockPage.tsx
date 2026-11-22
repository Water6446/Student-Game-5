"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Card, SectionTitle, Segmented, Skeleton } from "@/components/ui";
import { ArrowLeft, ChevronDown, Info, Newspaper, Wallet } from "@/components/icons";
import { ChangeChip, Stat, TickerBadge } from "@/components/markets/parts";
import { OrderRow } from "@/components/markets/rows";
import { PriceChart, type ChartMarker, type ChartPoint } from "@/components/markets/PriceChart";
import { centsText, percentText, priceText, returnText, SIDE_TEXT, sharesText } from "@/lib/markets/format";
import { formatGameDate, formatGameMonth, periodNoun } from "@/lib/markets/clock";
import type { DailyBar, OrderSide } from "@/lib/markets/db";
import {
  downsample,
  PRICE_RANGE_TEXT,
  priceRanges,
  rangePosition,
  slicePriceRange,
  ticketSides,
  type PriceRange,
} from "@/lib/markets/trading/view";
import type { TradingActions, TradingModel } from "./model";
import { TopBar } from "./TradingApp";

const MAX_POINTS = 320;

/**
 * One company (or the index fund): its price history with range tabs and
 * scrubbing, your position and open orders in it, the 52-week range, the
 * dividend yield, what it does, and the market's recent headlines. Buy and
 * Sell are pinned to the bottom of the screen.
 */
export function StockPage({
  slot,
  model,
  actions,
  onBack,
  onTrade,
}: {
  slot: number;
  model: TradingModel;
  actions: TradingActions;
  onBack: () => void;
  onTrade: (side: OrderSide) => void;
}) {
  const listing = model.listings.find((l) => l.slot === slot) ?? null;
  const quote = listing?.quote ?? null;
  const position = model.positions.find((p) => p.slot === slot) ?? null;
  const qty = position?.quantity ?? 0;
  const noun = periodNoun(model.cfg.period).toLowerCase();
  const revealed = model.periods.length;
  const backRef = useRef<HTMLButtonElement>(null);

  const [bars, setBars] = useState<DailyBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    actions.loadHistory(slot).then(
      (b) => active && setBars(b),
      (e: Error) => active && setError(e.message),
    );
    return () => {
      active = false;
    };
  }, [actions, slot, revealed]);

  useEffect(() => {
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-trade-ticket]")) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const ranges = useMemo(() => priceRanges(bars ?? []), [bars]);
  const [range, setRange] = useState<PriceRange>("1y");
  const activeRange: PriceRange = ranges.includes(range) ? range : (ranges[ranges.length - 1] ?? "all");
  const points = useMemo<ChartPoint[]>(
    () =>
      downsample(slicePriceRange(bars ?? [], activeRange), MAX_POINTS).map((b) => ({
        x: b[0],
        value: b[7],
        label: formatGameDate([b[0], b[1], b[2], b[3]]),
      })),
    [bars, activeRange],
  );
  const markers = useMemo<ChartMarker[]>(() => {
    if (points.length === 0) return [];
    const from = points[0].x;
    return model.fills
      .filter((f) => f.slot === slot && f.game_day >= from)
      .map((f) => ({
        x: f.game_day,
        kind: f.side === "buy" || f.side === "buy_to_cover" ? "buy" : "sell",
        label: `${SIDE_TEXT[f.side]} ${sharesText(Number(f.quantity))} @ ${priceText(Number(f.price))}`,
      }));
  }, [model.fills, slot, points]);
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const scrubbing = useRef(false);
  useEffect(() => {
    if (scrub && !scrubbing.current) {
      scrubbing.current = true;
      actions.log("chart_scrub", { slot, range: activeRange });
    }
    if (!scrub) scrubbing.current = false;
  }, [scrub, actions, slot, activeRange]);

  const sides = ticketSides(qty, model.cfg.shorting_enabled);
  const delisted = quote?.delisted ?? false;
  const closedReason =
    delisted
      ? "This company no longer trades."
      : model.phase === "lobby"
        ? "Trading opens when the professor starts the game."
        : model.phase === "open"
          ? model.account.frozen && qty === 0
            ? "Your account is frozen: you can only close positions."
            : null
          : model.phase === "finished"
            ? "The game is over."
            : `Trading opens with the next ${noun}.`;
  const openOrders = model.orders.filter((o) => o.slot === slot && o.status === "open");
  const recentNews = [...model.periods].reverse().flatMap((p) => p.headlines).slice(0, 4);

  if (!listing) return null;

  const first = points[0]?.value ?? null;
  const shownPrice = scrub ? scrub.value : quote?.last ?? null;
  const shownChange = scrub && first ? scrub.value / first - 1 : quote?.change ?? null;
  const changeLabel = scrub
    ? `${scrub.label} · vs. ${points[0]?.label ?? "start"}`
    : model.changeBasis === "year"
      ? "over the past year"
      : `over the last ${noun}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${listing.name} (${listing.ticker})`}
      className="fixed inset-0 z-40 overflow-y-auto bg-paper"
    >
      <TopBar
        model={model}
        left={
          <Button ref={backRef} variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ArrowLeft /> Back
          </Button>
        }
      />
      <div className="mx-auto max-w-md space-y-5 px-4 pb-36 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <TickerBadge ticker={listing.ticker} kind={listing.kind} />
            <span className="rounded-full border-2 border-ink/20 bg-surface px-2 py-0.5 text-xs font-semibold text-ink-muted">
              {listing.sector}
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-black uppercase leading-[.95] tracking-tight text-ink">
            {listing.name}
          </h1>
        </div>

        <Card>
          <div aria-live="polite">
            <span className="font-mono text-4xl font-bold tracking-tight text-ink">{priceText(shownPrice)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ChangeChip value={shownChange} />
            <span className="text-xs text-ink-muted">{changeLabel}</span>
          </div>
          <div className="mt-4">
            {error ? (
              <Banner kind="error">{error}</Banner>
            ) : bars == null ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <PriceChart
                points={points}
                markers={markers}
                format={(v) => priceText(v).replace(/\.\d+$/, "")}
                onScrub={setScrub}
                ariaLabel={`${listing.ticker} price, ${PRICE_RANGE_TEXT[activeRange]}: ${returnText(
                  first && points.length ? points[points.length - 1].value / first - 1 : null,
                )}. Use the arrow keys to read prices.`}
              />
            )}
          </div>
          {ranges.length > 1 ? (
            <Segmented
              label="Chart range"
              size="sm"
              className="mt-3 w-full"
              value={activeRange}
              onChange={(r) => {
                setRange(r);
                actions.log("chart_range", { slot, range: r });
              }}
              options={ranges.map((r) => ({ value: r, label: PRICE_RANGE_TEXT[r] }))}
            />
          ) : null}
        </Card>

        {position ? (
          <Card>
            <SectionTitle icon={<Wallet />}>{qty < 0 ? "Your short position" : "Your position"}</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label={qty < 0 ? "Shares short" : "Shares"}>{sharesText(Math.abs(qty))}</Stat>
              <Stat label="Average cost">{priceText(position.averageCost)}</Stat>
              <Stat label="Market value">{centsText(position.value)}</Stat>
              <div>
                <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">
                  Unrealized
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <ChangeChip value={position.unrealized} money size="sm" />
                  <ChangeChip value={position.unrealizedPct} size="sm" />
                </div>
              </div>
              {Math.abs(position.realized) >= 0.005 ? (
                <div className="col-span-2">
                  <div className="font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">
                    Realized so far
                  </div>
                  <div className="mt-0.5">
                    <ChangeChip value={position.realized} money size="sm" />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {openOrders.length > 0 ? (
          <Card>
            <SectionTitle>Open orders</SectionTitle>
            <div className="mt-1 divide-y divide-ink/10">
              {openOrders.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  ticker={listing.ticker}
                  placed={`${periodNoun(model.cfg.period)} ${o.placed_round}`}
                  canCancel={model.phase === "open"}
                  onCancel={() => void actions.cancelOrder(o.id)}
                />
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="space-y-4">
          <SectionTitle>Key figures</SectionTitle>
          {quote?.low_52w != null && quote.high_52w != null && quote.last != null ? (
            <div>
              <div className="flex items-center justify-between font-display text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">
                <span>52-week low</span>
                <span>52-week high</span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-full border-2 border-ink bg-paper-2">
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-ink bg-brand"
                  style={{ left: `${rangePosition(quote.last, quote.low_52w, quote.high_52w) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-sm font-bold text-ink">
                <span>{priceText(quote.low_52w)}</span>
                <span>{priceText(quote.high_52w)}</span>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Dividend yield" hint="past year's dividends ÷ price">
              {quote?.dividend_yield ? percentText(quote.dividend_yield) : "None"}
            </Stat>
            <Stat label="Last close">{model.asOf ? formatGameDate(model.asOf) : "—"}</Stat>
          </div>
          <div className="flex gap-2 rounded-xl border-2 border-ink/15 bg-paper-2 px-3 py-2.5 text-sm text-ink">
            <Info className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <p>{listing.about}</p>
          </div>
        </Card>

        {recentNews.length > 0 ? (
          <details
            className="group rounded-2xl border-2 border-ink bg-surface shadow-card"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open) actions.log("news_view", { slot, from: "stock" });
            }}
          >
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-5 font-display text-lg font-extrabold uppercase tracking-tight text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Newspaper /> Market news
              </span>
              <ChevronDown className="transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ul className="space-y-3 px-5 pb-5">
              {recentNews.map((h, i) => (
                <li key={i} className="text-sm text-ink">
                  <span className="block font-mono text-xs text-ink-muted">{formatGameMonth(h.y, h.m)}</span>
                  {h.text}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-ink bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md px-4 py-3">
          {closedReason ? (
            <p className="mb-2 text-center text-xs font-semibold text-ink-muted">{closedReason}</p>
          ) : null}
          <div className="flex gap-3">
            {sides.map((side, i) => (
              <Button
                key={side}
                variant={i === 0 ? "gold" : "secondary"}
                className="flex-1 text-lg"
                disabled={closedReason != null}
                onClick={() => onTrade(side)}
              >
                {SIDE_TEXT[side]}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
