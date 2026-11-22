"use client";

import { useState } from "react";
import { Banner, Card, SectionTitle } from "@/components/ui";
import { ListChecks } from "@/components/icons";
import { OrderRow } from "@/components/markets/rows";
import { periodNoun } from "@/lib/markets/clock";
import { priceText, SIDE_TEXT, sharesText } from "@/lib/markets/format";
import type { MarketOrderRow } from "@/lib/markets/db";
import type { TradingActions, TradingModel } from "./model";

const placedAt = (o: MarketOrderRow) => Date.parse(o.placed_at) || 0;

/**
 * Open orders first (cancellable while trading is open), then everything that
 * has finished, newest round first, each with its fills or the reason it did
 * not fill.
 */
export function OrdersList({ model, actions }: { model: TradingModel; actions: TradingActions }) {
  const noun = periodNoun(model.cfg.period);
  const tickers = new Map(model.listings.map((l) => [l.slot, l.ticker]));
  const open = model.orders.filter((o) => o.status === "open").sort((a, b) => placedAt(a) - placedAt(b));
  const done = model.orders
    .filter((o) => o.status !== "open")
    .sort((a, b) => b.placed_round - a.placed_round || placedAt(b) - placedAt(a));
  // Margin-call sales and delisting payouts have no order behind them.
  const forced = model.fills.filter((f) => f.reason !== "order");
  const rounds = [...new Set([...done.map((o) => o.placed_round), ...forced.map((f) => f.round_number)])].sort(
    (a, b) => b - a,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCancel = model.phase === "open";

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    const err = await actions.cancelOrder(id);
    if (err) setError(err);
    actions.log("order_cancel", { order_id: id, ok: !err });
    setBusyId(null);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink">Orders</h1>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Card>
        <SectionTitle
          icon={<ListChecks />}
          info={`Orders fill as the ${noun.toLowerCase()} plays out. Open buy and short orders hold buying power until they fill or you cancel them.`}
          infoLabel="About open orders"
        >
          Open
        </SectionTitle>
        {open.length === 0 ? (
          <p className="mt-3 font-editorial text-sm italic text-ink-muted">No open orders.</p>
        ) : (
          <div className="mt-1 divide-y divide-ink/10">
            {open.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                ticker={tickers.get(o.slot) ?? `#${o.slot}`}
                placed={`${noun} ${o.placed_round}`}
                fills={model.fills}
                canCancel={canCancel}
                busy={busyId === o.id}
                onCancel={() => void cancel(o.id)}
              />
            ))}
          </div>
        )}
        {open.length > 0 && !canCancel ? (
          <p className="mt-2 text-xs text-ink-subtle">Orders can be cancelled while trading is open.</p>
        ) : null}
      </Card>

      {rounds.map((r) => (
        <Card key={r}>
          <SectionTitle>{`${noun} ${r}`}</SectionTitle>
          <div className="mt-1 divide-y divide-ink/10">
            {done
              .filter((o) => o.placed_round === r)
              .map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  ticker={tickers.get(o.slot) ?? `#${o.slot}`}
                  placed={`${noun} ${o.placed_round}`}
                  fills={model.fills}
                />
              ))}
            {forced
              .filter((f) => f.round_number === r)
              .map((f) => (
                <div key={f.id} className="py-3">
                  <div className="text-sm font-bold text-ink">
                    {SIDE_TEXT[f.side]} {sharesText(Number(f.quantity))} {tickers.get(f.slot) ?? `#${f.slot}`} @{" "}
                    {priceText(Number(f.price))}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-loss">
                    {f.reason === "margin_call"
                      ? "Margin call: sold to bring the account back above its maintenance requirement"
                      : "The company stopped trading: settled at its final value"}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}

      {model.orders.length === 0 ? (
        <p className="text-center font-editorial text-sm italic text-ink-muted">
          Orders you place show up here, with their fills.
        </p>
      ) : null}
    </>
  );
}
