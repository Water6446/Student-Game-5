"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, ChipButton, Field, NumberField, Segmented, Toggle } from "@/components/ui";
import { AlertTriangle, Clock, Hourglass, X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { TickerBadge } from "@/components/markets/parts";
import { useCountdown } from "@/components/markets/use-countdown";
import { centsText, orderSummary, priceText, SIDE_TEXT, sharesText, TYPE_TEXT } from "@/lib/markets/format";
import { formatCountdown, periodNoun } from "@/lib/markets/clock";
import type { OrderSide, OrderType } from "@/lib/markets/db";
import {
  buyingPower,
  checkOrder,
  freeEquity,
  marginParams,
  referencePrice,
  RISK_TEXT,
  riskWarning,
  round6,
  type OrderDraft,
  type RiskWarning,
} from "@/lib/markets/trading/orders";
import { decisionContext } from "@/lib/markets/trading/context";
import { confirmationMatches, cooldownEndsAt, needsReview } from "@/lib/research/friction";
import { pendingClose, ticketSides } from "@/lib/markets/trading/view";
import type { TradingActions, TradingModel } from "./model";
import type { TicketRequest } from "./TradingApp";

const TYPES: OrderType[] = ["market", "limit", "stop", "stop_limit"];
const CHIPS = [0.25, 0.5, 1] as const;

const opening = (side: OrderSide) => side === "buy" || side === "sell_short";
const buyish = (side: OrderSide) => side === "buy" || side === "buy_to_cover";

function parse(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function newRef(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The order ticket, a bottom sheet: side, order type, amount in dollars or
 * shares, limit/stop prices and how long the order lasts, with a live estimate
 * and the exact reason the server would refuse it (lib/markets/trading/orders.ts
 * mirrors place_order). The friction knobs decide the amount chips, the
 * review screen, the typed confirmation, the risk warning before a short sale
 * or a margin buy, and the wait between orders (a rule place_order enforces;
 * the ticket only counts it down). Every step is logged, and the placed order
 * carries the decision context (what the student could see when they placed it).
 */
export function TradeTicket({
  request,
  model,
  actions,
  onClose,
}: {
  request: TicketRequest;
  model: TradingModel;
  actions: TradingActions;
  onClose: () => void;
}) {
  const { cfg, knobs, account } = model;
  const toast = useToast();
  const listing = model.listings.find((l) => l.slot === request.slot);
  const last = listing?.quote?.last ?? 0;
  const position = model.positions.find((p) => p.slot === request.slot);
  const qty = position?.quantity ?? 0;
  const sides = ticketSides(qty, cfg.shorting_enabled);

  const [side, setSide] = useState<OrderSide>(sides.includes(request.side) ? request.side : sides[0]);
  const [type, setType] = useState<OrderType>("market");
  const [mode, setMode] = useState<"dollars" | "shares">(opening(request.side) ? "dollars" : "shares");
  const [amountText, setAmountText] = useState("");
  const [limitText, setLimitText] = useState("");
  const [stopText, setStopText] = useState("");
  const [gtc, setGtc] = useState(false);
  const [stage, setStage] = useState<"edit" | "risk" | "review">("edit");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secs = useCountdown(model.phase === "open" ? model.closesAt : null);
  const coolSecs = useCountdown(cooldownEndsAt(model.lastOrderAt, knobs.cooldown_seconds)) ?? 0;
  const cooling = coolSecs > 0;

  // research log: when the ticket opened, what changed, how it ended
  const openedAt = useRef(Date.now());
  const reviewAt = useRef<number | null>(null);
  const confirmAt = useRef<number | null>(null);
  const riskAt = useRef<number | null>(null);
  const riskDone = useRef<{ kind: RiskWarning; ms: number } | null>(null);
  const coolLogged = useRef(false);
  const chips = useRef<string[]>([]);
  const placed = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const amountRef = useRef(amountText);
  amountRef.current = amountText;
  const clientRef = useRef(newRef());
  useEffect(() => {
    actions.log("ticket_open", { slot: request.slot, side: request.side, from: request.from });
    const started = openedAt.current;
    return () => {
      if (!placed.current) {
        actions.log("ticket_abandon", {
          slot: request.slot,
          stage: stageRef.current,
          ms: Date.now() - started,
          had_amount: amountRef.current.trim() !== "",
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (field: string, value: unknown) => actions.log("ticket_change", { field, value });
  useEffect(() => {
    // not while this ticket's own order is going in: that order started the wait
    if (cooling && !coolLogged.current && !busy && !placed.current) {
      coolLogged.current = true;
      actions.log("cooldown_blocked", { slot: request.slot, seconds: coolSecs, where: "ticket" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooling]);

  // ---- the draft and what the server would say about it -------------------------
  const amount = parse(amountText);
  const limit = type === "limit" || type === "stop_limit" ? parse(limitText) : null;
  const stop = type === "stop" || type === "stop_limit" ? parse(stopText) : null;
  const dollars = type === "market" && mode === "dollars";
  const params = marginParams(cfg);
  const marks = { lmv: account.longValue, smv: account.shortValue, equity: account.cash + account.longValue - account.shortValue };
  const closingSide = side === "sell" || side === "buy_to_cover";
  const pending = closingSide && last > 0 ? pendingClose(model.orders, request.slot, side, last) : 0;
  const held = side === "sell" ? Math.max(qty, 0) : side === "buy_to_cover" ? Math.max(-qty, 0) : 0;
  const available = Math.max(0, round6(held - pending));

  const draft: OrderDraft = {
    side,
    type,
    quantity: dollars ? null : amount,
    notional: dollars ? amount : null,
    limit,
    stop,
  };
  const check =
    amount == null || last <= 0
      ? null
      : checkOrder(draft, {
          last,
          position: qty,
          pendingClose: pending,
          marks,
          openReserves: account.reserved,
          params,
          shortingEnabled: cfg.shorting_enabled,
          frozen: account.frozen,
        });

  const estPrice =
    type === "market"
      ? last * (buyish(side) ? 1 + cfg.spread / 2 : 1 - cfg.spread / 2)
      : type === "stop"
        ? (stop ?? last) * (buyish(side) ? 1 + cfg.spread / 2 : 1 - cfg.spread / 2)
        : limit ?? last;
  const estShares = check?.ok ? check.quantity : null;
  const estTotal = estShares != null ? estShares * estPrice : null;
  const bpAfter =
    check?.ok && opening(side) ? buyingPower(marks, params, account.reserved + check.reserve) : null;

  // what one "100%" chip means for the current draft
  const chipBase = useMemo(() => {
    if (closingSide) return available;
    if (dollars) return Math.floor(account.buyingPower * 100) / 100;
    const ref = referencePrice(side, type, last, limit, stop);
    if (!(ref > 0)) return 0;
    const free = freeEquity(marks, params, account.reserved) - params.commission;
    return Math.max(0, Math.floor((free / (ref * (params.im + params.spread / 2))) * 1e4) / 1e4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closingSide, available, dollars, account, side, type, last, limit, stop]);

  function pickChip(f: number) {
    const v = f === 1 ? chipBase : dollars ? Math.floor(chipBase * f * 100) / 100 : Math.floor(chipBase * f * 1e4) / 1e4;
    setAmountText(v > 0 ? String(v) : "");
    chips.current.push(`${Math.round(f * 100)}%`);
    change("chip", Math.round(f * 100));
  }

  const ticker = listing?.ticker ?? "";
  const summary = orderSummary(
    {
      side,
      order_type: type,
      quantity: dollars ? null : amount,
      notional: dollars ? amount : null,
      limit_price: limit,
      stop_price: stop,
    },
    ticker,
  );
  const tradingOpen = model.phase === "open";
  const canSubmit = tradingOpen && check?.ok === true && !busy && !cooling;
  const review = needsReview(knobs);
  const risk = knobs.risk_disclosure
    ? riskWarning(side, buyish(side) ? estTotal : null, account.cash, cfg.margin_enabled)
    : null;
  const confirmed = !knobs.typed_confirmation || confirmationMatches(confirmText, amount);

  // edit -> (risk warning) -> (review, with the typed confirmation) -> placed
  function advance() {
    if (!canSubmit) return;
    if (risk && riskDone.current?.kind !== risk) {
      riskAt.current = Date.now();
      setStage("risk");
      actions.log("risk_shown", { slot: request.slot, kind: risk });
      return;
    }
    toReviewOrPlace();
  }
  function toReviewOrPlace() {
    if (!review) {
      void place();
      return;
    }
    reviewAt.current = Date.now();
    setStage("review");
    actions.log("ticket_review", { slot: request.slot, side, type });
    if (knobs.typed_confirmation) {
      confirmAt.current = Date.now();
      setConfirmText("");
      actions.log("confirm_shown", { slot: request.slot });
    }
  }
  const noun = periodNoun(cfg.period).toLowerCase();

  async function place() {
    if (!check?.ok || cooling || (stage === "review" && !confirmed)) return;
    setBusy(true);
    setError(null);
    const confirmMs = knobs.typed_confirmation && confirmAt.current ? Date.now() - confirmAt.current : null;
    if (confirmMs != null) actions.log("confirm_accepted", { slot: request.slot, ms: confirmMs });
    actions.log("ticket_submit", { slot: request.slot, side, type, stage });
    const me = model.standings?.find((r) => r.is_me);
    const context = decisionContext({
      from: request.from,
      ticketMs: Date.now() - openedAt.current,
      reviewMs: reviewAt.current ? Date.now() - reviewAt.current : null,
      chips: chips.current,
      mode: dollars ? "dollars" : "shares",
      round: model.round,
      secondsLeft: secs,
      nlv: account.nlv,
      cash: account.cash,
      buyingPower: account.buyingPower,
      position: qty,
      unrealized: position?.unrealized ?? 0,
      holdings: model.positions.length,
      last,
      change: listing?.quote?.change ?? null,
      changeBasis: model.changeBasis,
      rank: me?.rank ?? null,
      classSize: model.standings?.length ?? null,
      frozen: account.frozen,
      confirmMs,
      risk: riskDone.current?.kind ?? null,
      riskMs: riskDone.current?.ms ?? null,
    });
    const err = await actions.placeOrder(
      {
        slot: request.slot,
        side,
        order_type: type,
        quantity: dollars ? null : amount,
        notional: dollars ? amount : null,
        limit_price: limit,
        stop_price: stop,
        tif: type === "market" ? "round" : gtc ? "gtc" : "round",
        client_ref: clientRef.current,
      },
      context,
    );
    setBusy(false);
    if (err) {
      actions.log("order_failed", { slot: request.slot, reason: err.slice(0, 200) });
      setError(err);
      setStage("edit");
      // a corrected order is a new order
      clientRef.current = newRef();
      return;
    }
    placed.current = true;
    actions.log("order_placed", { slot: request.slot, side, type });
    toast(`Order placed: ${summary}`);
    onClose();
  }

  // ---- the sheet: focus in, Escape out, Tab stays inside ----------------------------
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    return () => opener?.focus?.();
  }, []);
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const items = sheet.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (items.length === 0) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }

  if (!listing) return null;

  return (
    <div data-trade-ticket className="fixed inset-0 z-50 flex items-end justify-center">
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-ink/45" onClick={onClose} />
      <section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative max-h-[92dvh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-3xl border-2 border-b-0 border-ink bg-surface pb-[env(safe-area-inset-bottom)] shadow-lift outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-2 border-ink/10 bg-surface px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <TickerBadge ticker={listing.ticker} kind={listing.kind} />
            <h2 id="ticket-title" className="truncate font-display text-lg font-extrabold uppercase tracking-tight text-ink">
              {SIDE_TEXT[side]}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {secs != null ? (
              <span className={secs <= 10 ? "font-mono text-sm font-bold text-loss" : "font-mono text-sm font-bold text-ink-muted"}>
                <Clock className="mr-1 inline" aria-hidden="true" />
                {formatCountdown(secs)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the order ticket"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl text-ink transition hover:bg-ink/[0.06]"
            >
              <X />
            </button>
          </div>
        </div>

        {stage === "edit" ? (
          <div className="space-y-4 px-5 pb-5 pt-4">
            <p className="text-sm text-ink-muted">
              {listing.name} · last close <span className="font-mono font-bold text-ink">{priceText(last)}</span>
              {closingSide ? (
                <>
                  {" "}
                  · you can {side === "sell" ? "sell" : "cover"}{" "}
                  <span className="font-mono font-bold text-ink">{sharesText(available)}</span>
                </>
              ) : null}
            </p>

            {sides.length > 1 ? (
              <Segmented
                label="Order side"
                className="w-full"
                value={side}
                onChange={(s) => {
                  setSide(s);
                  setMode(opening(s) && type === "market" ? "dollars" : "shares");
                  setAmountText("");
                  change("side", s);
                }}
                options={sides.map((s) => ({ value: s, label: SIDE_TEXT[s] }))}
              />
            ) : null}

            <div role="group" aria-label="Order type" className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => (
                <ChipButton
                  key={t}
                  active={type === t}
                  className="px-1 text-xs"
                  onClick={() => {
                    setType(t);
                    if (t !== "market" && mode === "dollars") {
                      setMode("shares");
                      setAmountText("");
                    }
                    change("type", t);
                  }}
                >
                  {TYPE_TEXT[t]}
                </ChipButton>
              ))}
            </div>

            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field label={dollars ? "Amount" : "Shares"}>
                  <NumberField
                    prefix={dollars ? "$" : undefined}
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={amountText}
                    placeholder="0"
                    onChange={(e) => setAmountText(e.target.value)}
                    aria-describedby="ticket-estimate"
                  />
                </Field>
              </div>
              {type === "market" ? (
                <Segmented
                  label="Enter the amount in"
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setAmountText("");
                    change("mode", m);
                  }}
                  options={[
                    { value: "dollars", label: "$", ariaLabel: "Dollars" },
                    { value: "shares", label: "Sh", ariaLabel: "Shares" },
                  ]}
                />
              ) : null}
            </div>

            {knobs.amount_chips && chipBase > 0 ? (
              <div className="flex gap-2">
                {CHIPS.map((f) => (
                  <ChipButton key={f} onClick={() => pickChip(f)}>
                    {f === 1 ? (closingSide ? "All" : "Max") : `${f * 100}%`}
                  </ChipButton>
                ))}
              </div>
            ) : null}

            {type === "limit" || type === "stop_limit" ? (
              <Field
                label="Limit price"
                hint={buyish(side) ? "Pays this price or less" : "Gets this price or more"}
              >
                <NumberField prefix="$" inputMode="decimal" step="any" min={0} value={limitText} placeholder={last.toFixed(2)} onChange={(e) => setLimitText(e.target.value)} />
              </Field>
            ) : null}
            {type === "stop" || type === "stop_limit" ? (
              <Field
                label="Stop price"
                hint={buyish(side) ? "Triggers if the price rises to this" : "Triggers if the price falls to this"}
              >
                <NumberField prefix="$" inputMode="decimal" step="any" min={0} value={stopText} placeholder={last.toFixed(2)} onChange={(e) => setStopText(e.target.value)} />
              </Field>
            ) : null}
            {type !== "market" ? (
              <Toggle
                label="Keep it open in later rounds"
                checked={gtc}
                onChange={(v) => {
                  setGtc(v);
                  change("gtc", v);
                }}
              />
            ) : null}

            <Estimate
              id="ticket-estimate"
              rows={[
                ["Estimated price", priceText(estPrice)],
                ...(dollars && estShares != null ? ([["Estimated shares", sharesText(estShares)]] as [string, string][]) : []),
                ...(estTotal != null
                  ? ([[buyish(side) ? "Estimated cost" : "Estimated proceeds", centsText(estTotal)]] as [string, string][])
                  : []),
                ...(cfg.commission > 0 ? ([["Commission", centsText(cfg.commission)]] as [string, string][]) : []),
                ...(bpAfter != null ? ([["Buying power after", centsText(bpAfter)]] as [string, string][]) : []),
                ...(closingSide && estShares != null
                  ? ([["Shares left after", sharesText(Math.max(0, available - estShares))]] as [string, string][])
                  : []),
              ]}
            />

            {check && !check.ok ? <Problem>{capitalize(check.reason)}</Problem> : null}
            {error ? <Problem>{capitalize(error)}</Problem> : null}
            {!tradingOpen ? <Problem>Trading is closed for this {noun}.</Problem> : null}

            <p className="text-xs text-ink-subtle">
              {type === "market"
                ? `Fills at the start of the ${noun}, at the last close plus half the spread.`
                : `Fills during the ${noun} if the price reaches it.`}
            </p>

            {cooling ? <CooldownNote secs={coolSecs} /> : null}
            <Button variant="gold" className="w-full text-lg shadow-pop" disabled={!canSubmit} onClick={advance}>
              {busy ? "Placing…" : review ? "Review order" : "Place order"}
            </Button>
          </div>
        ) : stage === "risk" && risk ? (
          <div className="space-y-4 px-5 pb-5 pt-4">
            <div role="alert" className="rounded-xl border-2 border-ink bg-loss-soft p-4 shadow-card">
              <div className="flex items-center gap-2 font-display text-lg font-extrabold leading-tight text-ink">
                <AlertTriangle className="shrink-0 text-loss" aria-hidden="true" />
                {RISK_TEXT[risk].title}
              </div>
              <p className="mt-2 text-sm text-ink">{RISK_TEXT[risk].body}</p>
            </div>
            <p className="text-sm text-ink-muted">
              Your order: <span className="font-bold text-ink">{summary}</span>
            </p>
            {cooling ? <CooldownNote secs={coolSecs} /> : null}
            <Button
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              onClick={() => {
                const ms = riskAt.current ? Date.now() - riskAt.current : 0;
                riskDone.current = { kind: risk, ms };
                actions.log("risk_accepted", { slot: request.slot, kind: risk, ms });
                toReviewOrPlace();
              }}
            >
              {busy ? "Placing…" : "I understand, continue"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => {
                actions.log("risk_declined", {
                  slot: request.slot,
                  kind: risk,
                  ms: riskAt.current ? Date.now() - riskAt.current : null,
                });
                setStage("edit");
              }}
            >
              Go back
            </Button>
          </div>
        ) : (
          <div className="space-y-4 px-5 pb-5 pt-4">
            <div className="rounded-xl border-2 border-ink bg-paper-2 p-4 shadow-card">
              <div className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">Your order</div>
              <p className="mt-1 font-display text-xl font-extrabold leading-tight text-ink">{summary}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {type === "market" ? "This round only" : gtc ? "Stays open until it fills or you cancel it" : "This round only"}
              </p>
            </div>
            <Estimate
              rows={[
                ["Estimated price", priceText(estPrice)],
                ...(estShares != null ? ([["Shares", sharesText(estShares)]] as [string, string][]) : []),
                ...(estTotal != null
                  ? ([[buyish(side) ? "Estimated cost" : "Estimated proceeds", centsText(estTotal)]] as [string, string][])
                  : []),
                ...(bpAfter != null ? ([["Buying power after", centsText(bpAfter)]] as [string, string][]) : []),
              ]}
            />
            {knobs.typed_confirmation ? (
              <Field
                label={dollars ? "Type the dollar amount again to confirm" : "Type the number of shares again to confirm"}
              >
                <NumberField
                  prefix={dollars ? "$" : undefined}
                  inputMode="decimal"
                  step="any"
                  min={0}
                  autoComplete="off"
                  value={confirmText}
                  placeholder="0"
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </Field>
            ) : null}
            {!tradingOpen ? <Problem>Trading is closed for this {noun}.</Problem> : null}
            {cooling ? <CooldownNote secs={coolSecs} /> : null}
            <Button
              variant="gold"
              className="w-full text-lg shadow-pop"
              disabled={!canSubmit || !confirmed}
              onClick={place}
            >
              {busy ? "Placing…" : "Place order"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setStage("edit");
                const ms = reviewAt.current ? Date.now() - reviewAt.current : null;
                actions.log("ticket_back", { slot: request.slot, ms });
                if (knobs.typed_confirmation) {
                  actions.log("confirm_declined", { slot: request.slot, typed: confirmText.trim() !== "", ms });
                }
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** The friction profile's wait between orders, counting down (place_order enforces it). */
function CooldownNote({ secs }: { secs: number }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 text-sm font-semibold text-ink">
      <Hourglass className="shrink-0" aria-hidden="true" />
      <span>
        Next order in <span className="font-mono font-bold tabular-nums">{secs} s</span>
      </span>
    </p>
  );
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function Estimate({ rows, id }: { rows: [string, string][]; id?: string }) {
  return (
    <dl id={id} className="divide-y divide-ink/10 rounded-xl border-2 border-ink/15 bg-paper-2/60 px-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="font-mono font-bold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-loss">
      <AlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
