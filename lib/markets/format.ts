// Display helpers for the trading screens. Presentation only; every number
// they format comes from the server (or from a TS mirror, for previews).

import { money } from "../game/format";
import type { LedgerKind, OrderSide, OrderType } from "./db";

const MINUS = "−";

/** A share count: "12", "3.1416", "−50" (stored to 6 places; shown to at most 4). */
export function sharesText(q: number): string {
  const v = Number.isFinite(q) ? q : 0;
  const text = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 4 });
  return v < 0 ? `${MINUS}${text}` : text;
}

/** A share price, always to the cent: "$52.30" (four places under $1). */
export function priceText(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const digits = Math.abs(p) < 1 ? 4 : 2;
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Money always to the cent, for balances that move by cents: "$100,290.95". */
export function centsText(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const text = `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `${MINUS}${text}` : text;
}

/** Signed money to the cent: "+$12.50", "−$3.00", "$0.00". */
export function signedCents(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const rounded = Math.round(n * 100) / 100;
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
  return `${sign}${centsText(Math.abs(rounded))}`;
}

/** A fractional return as a signed percentage: 0.0523 → "+5.23%", null → "—". */
export function returnText(r: number | null | undefined, digits = 2): string {
  if (r == null || !Number.isFinite(r)) return "—";
  const pct = r * 100;
  const fixed = Math.abs(pct).toFixed(digits);
  const zero = Number(fixed) === 0;
  const sign = zero ? "" : pct > 0 ? "+" : MINUS;
  return `${sign}${fixed}%`;
}

/** A fraction as an unsigned percentage: 0.25 → "25%", 0.0312 → "3.12%". */
export function percentText(r: number | null | undefined, digits = 2): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${Number((r * 100).toFixed(digits))}%`;
}

/** Short money for chart axes: "$950", "$12.4k", "$1.25M". */
export function compactMoney(v: number): string {
  const n = Math.abs(v);
  const sign = v < 0 ? MINUS : "";
  if (n >= 1e9) return `${sign}$${Number((n / 1e9).toPrecision(3))}B`;
  if (n >= 1e6) return `${sign}$${Number((n / 1e6).toPrecision(3))}M`;
  if (n >= 1e4) return `${sign}$${Number((n / 1e3).toPrecision(3))}k`;
  if (n >= 100) return `${sign}$${Math.round(n).toLocaleString("en-US")}`;
  return `${sign}$${Number(n.toPrecision(3))}`;
}

export const SIDE_TEXT: Record<OrderSide, string> = {
  buy: "Buy",
  sell: "Sell",
  sell_short: "Sell short",
  buy_to_cover: "Buy to cover",
};

export const TYPE_TEXT: Record<OrderType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop-limit",
};

/**
 * One line for an order: "Buy 10 ACME at market", "Buy $1,000 of ACME at
 * market", "Sell 5 ACME · stop $48.00", "Buy 20 ACME · stop $51.00, limit $51.50".
 */
export function orderSummary(o: {
  side: OrderSide;
  order_type: OrderType;
  quantity: number | null;
  notional: number | null;
  limit_price: number | null;
  stop_price: number | null;
}, ticker: string): string {
  const what =
    o.quantity != null ? `${sharesText(o.quantity)} ${ticker}` : `${money(o.notional ?? 0)} of ${ticker}`;
  const head = `${SIDE_TEXT[o.side]} ${what}`;
  switch (o.order_type) {
    case "market":
      return `${head} at market`;
    case "limit":
      return `${head} · limit ${priceText(o.limit_price)}`;
    case "stop":
      return `${head} · stop ${priceText(o.stop_price)}`;
    case "stop_limit":
      return `${head} · stop ${priceText(o.stop_price)}, limit ${priceText(o.limit_price)}`;
  }
}

export const LEDGER_TEXT: Record<LedgerKind, string> = {
  trade: "Trades",
  commission: "Commissions",
  dividend: "Dividends",
  distribution: "Spin-off payments",
  interest: "Interest on cash",
  margin_interest: "Margin interest",
  borrow_fee: "Borrow fees",
  forced_liquidation: "Margin call sales",
  delisting: "Delisting payouts",
};
