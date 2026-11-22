// Order acceptance and buying power. Pure. MIRRORS place_order in
// supabase/migrations/0033_trading_rpcs.sql — the server is the authority; the
// trade ticket uses this to show exactly what the server will accept.
//
//   marks at the last revealed close p;  equity E = cash + LMV − SMV
//   im = initial margin when margin is on, else 1 (fully cash-backed)
//   requirement IR = im × (LMV + SMV)
//   free = E − IR − (reserves held by open orders)
//   an order that ADDS exposure reserves  qty × ref × (im + spread/2) + commission
//   closing orders (sell a long, cover a short) reserve nothing and are capped
//   at the shares held minus shares already in open closing orders.

import type { TradingConfig } from "./config";
import type { OrderSide, OrderType } from "../db";

export interface MarginParams {
  /** initial requirement as a fraction of position value (1 = no borrowing) */
  im: number;
  maintLong: number;
  maintShort: number;
  spread: number;
  commission: number;
}

export function marginParams(
  c: Pick<TradingConfig, "margin_enabled" | "initial_margin" | "maint_long" | "maint_short" | "spread" | "commission">,
): MarginParams {
  return {
    im: c.margin_enabled ? c.initial_margin : 1,
    maintLong: c.maint_long,
    maintShort: c.maint_short,
    spread: c.spread,
    commission: c.commission,
  };
}

export const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
export const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export interface Holding {
  slot: number;
  /** signed: negative is short */
  quantity: number;
}

export interface Marks {
  lmv: number;
  smv: number;
  equity: number;
}

/** Long and short market value, and equity, at the given prices. */
export function marksOf(cash: number, holdings: Holding[], price: (slot: number) => number | undefined): Marks {
  let lmv = 0;
  let smv = 0;
  for (const h of holdings) {
    const p = price(h.slot);
    if (p === undefined) continue;
    if (h.quantity > 0) lmv += h.quantity * p;
    else if (h.quantity < 0) smv += -h.quantity * p;
  }
  return { lmv, smv, equity: cash + lmv - smv };
}

/** Equity not tied up by positions or open orders. */
export function freeEquity(m: Marks, params: MarginParams, openReserves: number): number {
  return m.equity - params.im * (m.lmv + m.smv) - openReserves;
}

/**
 * Buying power in dollars of stock: the largest market buy the server would
 * accept right now (before commission is set aside).
 */
export function buyingPower(m: Marks, params: MarginParams, openReserves: number): number {
  const free = freeEquity(m, params, openReserves) - params.commission;
  return Math.max(0, free / (params.im + params.spread / 2));
}

/** The price an order's exposure is measured at, conservatively. */
export function referencePrice(
  side: OrderSide,
  type: OrderType,
  last: number,
  limit?: number | null,
  stop?: number | null,
): number {
  if (side === "buy") {
    if (type === "market") return last;
    if (type === "limit" || type === "stop_limit") return limit ?? last;
    return Math.max(stop ?? last, last);
  }
  // opening a short: exposure grows with the price it fills at
  if (type === "limit" || type === "stop_limit") return Math.max(limit ?? last, last);
  return last;
}

/** Shares a dollar market order buys (or sells) at the expected fill price. */
export function sharesForNotional(notional: number, last: number, side: OrderSide, spread: number): number {
  const px = last * (side === "buy" || side === "buy_to_cover" ? 1 + spread / 2 : 1 - spread / 2);
  return round6(notional / px);
}

/** Buying power an exposure-adding order holds while it is open. */
export function orderReserve(quantity: number, refPrice: number, params: MarginParams): number {
  return round4(quantity * refPrice * (params.im + params.spread / 2) + params.commission);
}

export interface OrderDraft {
  side: OrderSide;
  type: OrderType;
  quantity?: number | null;
  notional?: number | null;
  limit?: number | null;
  stop?: number | null;
}

export interface OrderContext {
  last: number;
  /** current signed position in this slot */
  position: number;
  /** shares already in open orders of the same closing side on this slot */
  pendingClose: number;
  marks: Marks;
  openReserves: number;
  params: MarginParams;
  shortingEnabled: boolean;
  frozen: boolean;
}

export type OrderCheck =
  | { ok: true; quantity: number; reserve: number }
  | { ok: false; reason: string };

/** What place_order would say about a draft order. */
export function checkOrder(d: OrderDraft, ctx: OrderContext): OrderCheck {
  const hasQty = d.quantity != null;
  const hasNotional = d.notional != null;
  if (hasQty === hasNotional) return { ok: false, reason: "give either a number of shares or a dollar amount" };
  if (hasNotional && d.type !== "market") {
    return { ok: false, reason: "dollar amounts are for market orders; enter shares for this order type" };
  }
  if ((d.type === "limit" || d.type === "stop_limit") !== (d.limit != null)) {
    return { ok: false, reason: `a ${d.type.replace("_", "-")} order ${d.limit == null ? "needs" : "does not take"} a limit price` };
  }
  if ((d.type === "stop" || d.type === "stop_limit") !== (d.stop != null)) {
    return { ok: false, reason: `a ${d.type.replace("_", "-")} order ${d.stop == null ? "needs" : "does not take"} a stop price` };
  }
  if ((d.limit != null && d.limit <= 0) || (d.stop != null && d.stop <= 0)) {
    return { ok: false, reason: "prices must be above $0" };
  }
  if (d.side === "sell_short" && !ctx.shortingEnabled) return { ok: false, reason: "short selling is off in this session" };

  let qty: number;
  if (hasQty) {
    qty = round6(d.quantity as number);
    if (!(qty > 0)) return { ok: false, reason: "shares must be more than 0" };
  } else {
    if (!((d.notional as number) >= 1)) return { ok: false, reason: "the dollar amount must be at least $1" };
    qty = sharesForNotional(d.notional as number, ctx.last, d.side, ctx.params.spread);
    if (!(qty > 0)) return { ok: false, reason: "that dollar amount buys no shares" };
  }

  if (d.side === "buy" && ctx.position < 0) return { ok: false, reason: "you are short this one: use buy to cover first" };
  if (d.side === "sell_short" && ctx.position > 0) {
    return { ok: false, reason: "you own this one: sell it before selling short" };
  }
  if (ctx.frozen && (d.side === "buy" || d.side === "sell_short")) {
    return { ok: false, reason: "your account is frozen: you can only close positions" };
  }

  if (d.side === "sell" || d.side === "buy_to_cover") {
    const held = d.side === "sell" ? Math.max(ctx.position, 0) : Math.max(-ctx.position, 0);
    const room = Math.max(held - ctx.pendingClose, 0);
    if (qty > held - ctx.pendingClose + 5e-7) {
      return { ok: false, reason: `you can ${d.side.replace(/_/g, " ")} at most ${room.toFixed(6)} shares` };
    }
    return { ok: true, quantity: qty, reserve: 0 };
  }

  const reserve = orderReserve(qty, referencePrice(d.side, d.type, ctx.last, d.limit, d.stop), ctx.params);
  const free = freeEquity(ctx.marks, ctx.params, ctx.openReserves);
  if (free + 0.005 < reserve) {
    return {
      ok: false,
      reason: `not enough buying power: this order needs $${reserve.toFixed(2)}, you have $${Math.max(free, 0).toFixed(2)} available`,
    };
  }
  return { ok: true, quantity: qty, reserve };
}

export type RiskWarning = "short" | "margin";

/**
 * The risk warning an order needs where the friction profile asks for one
 * (knob risk_disclosure): a short sale, whose loss has no ceiling, or a buy
 * that costs more than the cash on hand and so borrows the rest. Null otherwise.
 */
export function riskWarning(
  side: OrderSide,
  estimatedCost: number | null,
  cash: number,
  marginEnabled: boolean,
): RiskWarning | null {
  if (side === "sell_short") return "short";
  if (side === "buy" && marginEnabled && estimatedCost != null && estimatedCost > Math.max(0, cash) + 0.005) {
    return "margin";
  }
  return null;
}

export const RISK_TEXT: Record<RiskWarning, { title: string; body: string }> = {
  short: {
    title: "A short sale can lose more than you have",
    body: "You sell borrowed shares and must buy them back later. If the price rises there is no limit to what that costs, and a borrow fee is charged every day.",
  },
  margin: {
    title: "This order borrows money",
    body: "It costs more than your cash, so the rest is a loan that charges interest every day. Losses grow faster on borrowed money, and if your account falls too far your largest holding is sold at the close.",
  },
};
