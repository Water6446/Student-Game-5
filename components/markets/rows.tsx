"use client";

import { clsx } from "@/components/clsx";
import { Button } from "@/components/ui";
import { ChangeChip, TickerBadge } from "./parts";
import { centsText, orderSummary, priceText, sharesText } from "@/lib/markets/format";
import type { MarketFillRow, MarketOrderRow, InstrumentKind } from "@/lib/markets/db";
import type { PositionView } from "@/lib/markets/trading/view";

/**
 * One holding: ticker, size and average cost, then its value (ink) and its
 * unrealized gain or loss (the coloured chip). Shorts say so in words.
 */
export function PositionRow({
  p,
  kind,
  onOpen,
}: {
  p: PositionView;
  kind?: InstrumentKind;
  onOpen?: () => void;
}) {
  const short = p.quantity < 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[60px] w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-brand-soft/60"
    >
      <TickerBadge ticker={p.ticker} kind={kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
        <span className="block font-mono text-xs text-ink-muted">
          {short ? (
            <span className="mr-1 rounded border border-loss/40 bg-loss-soft px-1 font-display text-[10px] font-extrabold uppercase text-loss">
              Short
            </span>
          ) : null}
          {sharesText(Math.abs(p.quantity))} sh · avg {priceText(p.averageCost)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-sm font-bold text-ink">{centsText(p.value)}</span>
        <ChangeChip value={p.unrealized} money size="sm" />
      </span>
    </button>
  );
}

const STATUS_TEXT: Record<MarketOrderRow["status"], string> = {
  open: "Open",
  filled: "Filled",
  canceled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
};

const STATUS_STYLE: Record<MarketOrderRow["status"], string> = {
  open: "border-play/40 bg-play-soft text-play",
  filled: "border-gain/40 bg-gain-soft text-gain",
  canceled: "border-ink/20 bg-paper-2 text-ink-muted",
  rejected: "border-loss/40 bg-loss-soft text-loss",
  expired: "border-ink/20 bg-paper-2 text-ink-muted",
};

/**
 * One order: what it asked for, where it stands, and why when it did not fill.
 * An open order can be cancelled while trading is open.
 */
export function OrderRow({
  order,
  ticker,
  placed,
  fills,
  onCancel,
  canCancel,
  busy,
}: {
  order: MarketOrderRow;
  ticker: string;
  /** "Quarter 3" */
  placed: string;
  fills?: MarketFillRow[];
  onCancel?: () => void;
  canCancel?: boolean;
  busy?: boolean;
}) {
  const filled = (fills ?? []).filter((f) => f.order_id === order.id);
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">
          {orderSummary(
            {
              ...order,
              quantity: order.quantity == null ? null : Number(order.quantity),
              notional: order.notional == null ? null : Number(order.notional),
              limit_price: order.limit_price == null ? null : Number(order.limit_price),
              stop_price: order.stop_price == null ? null : Number(order.stop_price),
            },
            ticker,
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span
            className={clsx(
              "rounded-full border-2 px-2 font-display text-[10px] font-extrabold uppercase tracking-wide",
              STATUS_STYLE[order.status],
            )}
          >
            {STATUS_TEXT[order.status]}
            {order.status === "open" && order.triggered ? " · triggered" : ""}
          </span>
          {order.status === "open" ? (
            <>
              <span>
                {order.order_type === "market"
                  ? "Fills as the round plays out"
                  : order.tif === "gtc"
                    ? "Until cancelled"
                    : "This round only"}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{placed}</span>
        </div>
        {filled.map((f) => (
          <div key={f.id} className="mt-1 font-mono text-xs text-ink">
            {sharesText(Number(f.quantity))} @ {priceText(Number(f.price))}
            {Number(f.commission) > 0 ? ` + ${centsText(Number(f.commission))} commission` : ""}
          </div>
        ))}
        {order.status === "rejected" && order.reject_reason ? (
          <div className="mt-1 text-xs font-semibold text-loss">Not filled: {order.reject_reason}</div>
        ) : null}
      </div>
      {order.status === "open" && onCancel ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={!canCancel || busy}
          onClick={onCancel}
          aria-label={`Cancel order: ${ticker}`}
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
