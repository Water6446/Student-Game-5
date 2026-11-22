"use client";

import { useMemo, useState } from "react";
import { Card, PRESSABLE, SectionTitle, Segmented, SkeletonCards } from "@/components/ui";
import { clsx } from "@/components/clsx";
import { ChartLine, Hourglass, Lightning, TrendDown, TrendUp, Users } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { ChangeChip, TickerBadge } from "@/components/markets/parts";
import { Sparkline } from "@/components/markets/Sparkline";
import { useCountdown } from "@/components/markets/use-countdown";
import { centsText, priceText } from "@/lib/markets/format";

const wholeDollars = (n: number) => "$" + n.toLocaleString("en-US");
import { formatGameDate, periodNoun } from "@/lib/markets/clock";
import { checkOrder, marginParams } from "@/lib/markets/trading/orders";
import { decisionContext, quickBuyAmounts } from "@/lib/markets/trading/context";
import { moversOf, sortListings, type Listing, type MarketSort } from "@/lib/markets/trading/view";
import { cooldownEndsAt } from "@/lib/research/friction";
import type { TradingActions, TradingModel } from "./model";

const SORTS: readonly { value: MarketSort; label: string }[] = [
  { value: "name", label: "A–Z" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
];

/**
 * Every company and the index fund at the last close: price, change, a year's
 * sparkline. The biggest movers sit on top when the friction profile shows
 * them; what the class is buying shows only where that knob is on. With the
 * one_tap_buy knob every row gets a Buy button that places a market order for
 * the chosen amount straight away, with no ticket (the low friction profile).
 */
export function MarketList({
  model,
  actions,
  onOpenStock,
}: {
  model: TradingModel;
  actions: TradingActions;
  onOpenStock: (slot: number) => void;
}) {
  const [sort, setSort] = useState<MarketSort>("name");
  const quick = useQuickBuy(model, actions);
  const noun = periodNoun(model.cfg.period).toLowerCase();
  const index = model.listings.find((l) => l.kind === "index_fund") ?? null;
  const equities = useMemo(
    () => sortListings(model.listings.filter((l) => l.kind === "equity"), sort),
    [model.listings, sort],
  );
  const movers = useMemo(() => moversOf(model.listings), [model.listings]);
  const bySlot = new Map(model.listings.map((l) => [l.slot, l]));
  const basis = model.changeBasis === "year" ? "over the past year" : `over the last ${noun}`;

  if (!model.ready) return <SkeletonCards label="Loading the market" />;

  return (
    <>
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink">The market</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {model.asOf ? `Closing prices, ${formatGameDate(model.asOf)}` : "Closing prices"} · change {basis}
        </p>
      </div>

      {quick.on ? <QuickBuyBar quick={quick} /> : null}

      {index ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => onOpenStock(index.slot)}
            className={clsx("block w-full rounded-2xl border-2 border-ink bg-play-soft p-4 text-left shadow-card", PRESSABLE)}
          >
            <span className={clsx("flex items-center gap-2.5", quick.on && "pr-20")}>
              <TickerBadge ticker={index.ticker} kind="index_fund" />
              <span className="min-w-0">
                <span className="block font-display text-sm font-extrabold uppercase leading-tight tracking-tight text-ink">
                  {index.name}
                </span>
                <span className="block text-xs text-ink-muted">The whole market in one fund</span>
              </span>
            </span>
            <span className="mt-3 flex items-center gap-3">
              <Sparkline values={index.quote?.spark ?? []} className="h-10 w-auto flex-1" />
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-base font-bold text-ink">{priceText(index.quote?.last)}</span>
                <ChangeChip value={index.quote?.change} size="sm" />
              </span>
            </span>
          </button>
          {quick.on && !index.quote?.delisted ? (
            <span className="absolute right-4 top-4">
              <QuickBuyButton quick={quick} l={index} />
            </span>
          ) : null}
        </div>
      ) : null}

      {model.knobs.show_movers && (movers.up.length > 0 || movers.down.length > 0) ? (
        <Card>
          <SectionTitle icon={<ChartLine />}>Biggest moves</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MoverColumn icon={<TrendUp />} title="Up" rows={movers.up} onOpen={onOpenStock} />
            <MoverColumn icon={<TrendDown />} title="Down" rows={movers.down} onOpen={onOpenStock} />
          </div>
        </Card>
      ) : null}

      {model.knobs.show_class_popular && model.phase === "open" && model.activity?.most_bought.length ? (
        <Card>
          <SectionTitle icon={<Users />}>Your class is buying</SectionTitle>
          <ul className="mt-3 flex flex-wrap gap-2">
            {model.activity.most_bought.map((m) => {
              const l = bySlot.get(m.slot);
              if (!l) return null;
              return (
                <li key={m.slot}>
                  <button
                    type="button"
                    onClick={() => onOpenStock(m.slot)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-ink bg-surface px-3 text-sm font-bold text-ink shadow-card transition hover:bg-paper-2"
                  >
                    {l.ticker}
                    <span className="font-mono text-xs text-ink-muted">{m.players}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="rounded-2xl border-2 border-ink bg-surface pb-1 shadow-card">
        <div className="px-5 pt-5">
          <h2 className="font-display text-lg font-extrabold uppercase tracking-tight text-ink sm:text-xl">Companies</h2>
          <Segmented label="Sort companies" size="sm" className="mt-3 w-full" options={SORTS} value={sort} onChange={setSort} />
        </div>
        <ul className="mt-3 divide-y divide-ink/10">
          {equities.map((l) => (
            <li key={l.slot}>
              <ListingRow l={l} onOpen={() => onOpenStock(l.slot)} quick={quick.on ? quick : null} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ListingRow({ l, onOpen, quick }: { l: Listing; onOpen: () => void; quick: QuickBuy | null }) {
  const gone = l.quote?.delisted;
  const row = (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[64px] w-full min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-brand-soft/60"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm font-extrabold tracking-wide text-ink">{l.ticker}</span>
        <span className="block truncate text-xs text-ink-muted">{gone ? "No longer trades" : l.name}</span>
      </span>
      {gone ? null : <Sparkline values={l.quote?.spark ?? []} className="w-14" />}
      <span className="flex w-[5.25rem] shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-sm font-bold text-ink">{priceText(l.quote?.last)}</span>
        {gone ? null : <ChangeChip value={l.quote?.change} size="sm" />}
      </span>
    </button>
  );
  if (!quick || gone) return row;
  // the Buy button sits beside the row's button, never inside it
  return (
    <div className="flex items-center">
      {row}
      <span className="shrink-0 pr-4">
        <QuickBuyButton quick={quick} l={l} />
      </span>
    </div>
  );
}

// ---- one-tap Buy ------------------------------------------------------------------

interface QuickBuy {
  on: boolean;
  amounts: number[];
  amount: number;
  setAmount: (n: number) => void;
  busy: number | null;
  coolSecs: number;
  buy: (l: Listing) => Promise<void>;
}

function newRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const capitalize = (s: string) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A market buy for a preset dollar amount, checked by the same place_order
 * mirror as the ticket and carrying the same decision context (from:
 * "quick_buy"). The cooldown still applies: the server enforces it.
 */
function useQuickBuy(model: TradingModel, actions: TradingActions): QuickBuy {
  const { cfg, knobs, account } = model;
  const toast = useToast();
  const amounts = useMemo(() => quickBuyAmounts(cfg.starting_wealth), [cfg.starting_wealth]);
  const [amount, setAmount] = useState(() => amounts[Math.min(1, amounts.length - 1)]);
  const [busy, setBusy] = useState<number | null>(null);
  const coolSecs = useCountdown(cooldownEndsAt(model.lastOrderAt, knobs.cooldown_seconds)) ?? 0;
  const on = knobs.one_tap_buy && model.phase === "open" && model.ready && !account.frozen;

  async function buy(l: Listing) {
    if (busy != null) return;
    if (coolSecs > 0) {
      actions.log("cooldown_blocked", { slot: l.slot, seconds: coolSecs, where: "quick_buy" });
      toast(`Next order in ${coolSecs} s`, { tone: "info" });
      return;
    }
    const last = l.quote?.last ?? 0;
    const position = model.positions.find((p) => p.slot === l.slot);
    const marks = {
      lmv: account.longValue,
      smv: account.shortValue,
      equity: account.cash + account.longValue - account.shortValue,
    };
    const check = checkOrder(
      { side: "buy", type: "market", quantity: null, notional: amount, limit: null, stop: null },
      {
        last,
        position: position?.quantity ?? 0,
        pendingClose: 0,
        marks,
        openReserves: account.reserved,
        params: marginParams(cfg),
        shortingEnabled: cfg.shorting_enabled,
        frozen: account.frozen,
      },
    );
    if (!check.ok) {
      actions.log("order_failed", { slot: l.slot, reason: check.reason.slice(0, 200), from: "quick_buy" });
      toast(capitalize(check.reason), { tone: "error" });
      return;
    }
    setBusy(l.slot);
    actions.log("quick_buy", { slot: l.slot, amount });
    const me = model.standings?.find((r) => r.is_me);
    const err = await actions.placeOrder(
      {
        slot: l.slot,
        side: "buy",
        order_type: "market",
        quantity: null,
        notional: amount,
        limit_price: null,
        stop_price: null,
        tif: "round",
        client_ref: newRef(),
      },
      decisionContext({
        from: "quick_buy",
        ticketMs: null,
        reviewMs: null,
        chips: [],
        mode: "dollars",
        round: model.round,
        secondsLeft: null,
        nlv: account.nlv,
        cash: account.cash,
        buyingPower: account.buyingPower,
        position: position?.quantity ?? 0,
        unrealized: position?.unrealized ?? 0,
        holdings: model.positions.length,
        last,
        change: l.quote?.change ?? null,
        changeBasis: model.changeBasis,
        rank: me?.rank ?? null,
        classSize: model.standings?.length ?? null,
        frozen: account.frozen,
      }),
    );
    setBusy(null);
    if (err) {
      actions.log("order_failed", { slot: l.slot, reason: err.slice(0, 200), from: "quick_buy" });
      toast(capitalize(err), { tone: "error" });
      return;
    }
    actions.log("order_placed", { slot: l.slot, side: "buy", type: "market", from: "quick_buy" });
    toast(`Order placed: Buy ${centsText(amount)} of ${l.ticker}`, { tone: "success" });
  }

  return { on, amounts, amount, setAmount, busy, coolSecs, buy };
}

function QuickBuyBar({ quick }: { quick: QuickBuy }) {
  return (
    <div className="rounded-2xl border-2 border-ink bg-brand-soft px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-display text-sm font-extrabold uppercase tracking-tight text-ink">
          <Lightning aria-hidden="true" /> One-tap Buy
        </span>
        {quick.coolSecs > 0 ? (
          <span className="flex items-center gap-1 font-mono text-xs font-bold text-ink-muted">
            <Hourglass aria-hidden="true" /> {quick.coolSecs} s
          </span>
        ) : null}
      </div>
      <Segmented
        label="One-tap Buy amount"
        size="sm"
        className="mt-2 w-full"
        value={String(quick.amount)}
        onChange={(v) => quick.setAmount(Number(v))}
        options={quick.amounts.map((a) => ({ value: String(a), label: wholeDollars(a) }))}
      />
    </div>
  );
}

function QuickBuyButton({ quick, l }: { quick: QuickBuy; l: Listing }) {
  const busy = quick.busy === l.slot;
  return (
    <button
      type="button"
      onClick={() => void quick.buy(l)}
      disabled={quick.busy != null}
      aria-label={`Buy ${centsText(quick.amount)} of ${l.ticker}`}
      className={clsx(
        "inline-flex min-h-[44px] min-w-[4.25rem] items-center justify-center rounded-xl border-2 border-ink bg-brand px-3 font-display text-sm font-extrabold uppercase text-ink shadow-card disabled:opacity-60",
        PRESSABLE,
      )}
    >
      {busy ? "…" : "Buy"}
    </button>
  );
}

function MoverColumn({
  icon,
  title,
  rows,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Listing[];
  onOpen: (slot: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
        {icon} {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-subtle">None</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((l) => (
            <li key={l.slot}>
              <button
                type="button"
                onClick={() => onOpen(l.slot)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper-2 px-2.5 text-left transition hover:bg-brand-soft"
              >
                <span className="font-mono text-xs font-extrabold text-ink">{l.ticker}</span>
                <ChangeChip value={l.quote?.change} size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
