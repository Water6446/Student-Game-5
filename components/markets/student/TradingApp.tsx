"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "@/components/clsx";
import { ChartLine, Clock, Home, ListChecks, Lock } from "@/components/icons";
import { PRESSABLE } from "@/components/ui";
import { formatCountdown, periodNoun, periodPlural } from "@/lib/markets/clock";
import type { OrderSide } from "@/lib/markets/db";
import { useCountdown } from "@/components/markets/use-countdown";
import { ClockChip } from "@/components/markets/parts";
import type { TradingActions, TradingModel } from "./model";
import { TradingHome } from "./TradingHome";
import { MarketList } from "./MarketList";
import { OrdersList } from "./OrdersList";
import { StockPage } from "./StockPage";
import { TradeTicket } from "./TradeTicket";
import { PeriodReveal } from "./PeriodReveal";
import { TradingFinished } from "./TradingFinished";
import { ConsentScreen } from "@/components/research/ConsentScreen";

export type TradingTab = "home" | "market" | "orders";

export interface TicketRequest {
  slot: number;
  side: OrderSide;
  /** where the ticket was opened from, for the research log */
  from: "stock" | "position" | "market";
}

const URGENT_SECONDS = 10;

/**
 * The student's paper trading app: a phone-first shell with three tabs (the
 * account, the market, orders), a stock page that slides over them, the trade
 * ticket as a bottom sheet, and the period reveal as a takeover. It renders a
 * TradingModel and calls TradingActions; it never touches the database.
 */
export function TradingApp({ model, actions }: { model: TradingModel; actions: TradingActions }) {
  const { phase, round, knobs } = model;
  const [tab, setTab] = useState<TradingTab>("home");
  const [stock, setStock] = useState<number | null>(null);
  const [ticket, setTicket] = useState<TicketRequest | null>(null);
  const [reviewingConsent, setReviewingConsent] = useState(false);
  // The last reveal this student dismissed, kept across a refresh.
  const seenKey = `trade-reveal-seen:${model.sessionId}`;
  const [seenReveal, setSeenRevealState] = useState<number | null>(() => {
    try {
      const v = window.sessionStorage.getItem(seenKey);
      return v == null ? null : Number(v);
    } catch {
      return null;
    }
  });
  const setSeenReveal = (r: number) => {
    setSeenRevealState(r);
    try {
      window.sessionStorage.setItem(seenKey, String(r));
    } catch {
      // private mode: the reveal shows again after a refresh, which is harmless
    }
  };
  const log = actions.log;

  // Each phase change, as this student saw it (round-phase timestamps, Q14).
  useEffect(() => {
    log("phase_seen", { phase, round });
  }, [log, phase, round]);

  useEffect(() => {
    log("screen_view", { screen: tab });
    if (tab === "orders") log("orders_view", { open: model.orders.filter((o) => o.status === "open").length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, tab]);

  // The stock page is a history entry, so a phone's Back button closes it.
  const stockRef = useRef<number | null>(null);
  stockRef.current = stock;
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { tradeStock?: number } | null)?.tradeStock;
      setStock(typeof s === "number" ? s : null);
      setTicket(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openStock = useCallback(
    (slot: number, from: string) => {
      log("stock_view", { slot, from });
      if (stockRef.current == null) window.history.pushState({ tradeStock: slot }, "");
      else window.history.replaceState({ tradeStock: slot }, "");
      setStock(slot);
    },
    [log],
  );
  const closeStock = useCallback(() => {
    if ((window.history.state as { tradeStock?: number } | null)?.tradeStock != null) window.history.back();
    else setStock(null);
  }, []);

  // Toasts sit above the pinned tab bar and Buy/Sell bar, not on them.
  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty("--toast-offset", "5.5rem");
    return () => {
      el.style.removeProperty("--toast-offset");
    };
  }, []);

  // Nothing behind an overlay scrolls.
  const overlay = stock != null || ticket != null;
  useEffect(() => {
    if (!overlay) return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, [overlay]);

  // A new round closes whatever ticket was open on the last one.
  useEffect(() => {
    if (phase !== "open") setTicket(null);
  }, [phase]);

  const showReveal =
    phase === "revealed" && seenReveal !== round && model.accountRounds.some((r) => r.round_number === round);

  if (phase === "finished") {
    return <TradingFinished model={model} actions={actions} />;
  }

  // Research mode: the consent screen comes before play, and again on request.
  if (model.research.mode && (model.research.consent === null || reviewingConsent)) {
    return (
      <ConsentScreen
        changing={model.research.consent !== null}
        onCancel={() => setReviewingConsent(false)}
        onAnswer={async (yes) => {
          const err = await actions.answerConsent(yes);
          if (!err) setReviewingConsent(false);
          return err;
        }}
      />
    );
  }

  const openOrders = model.orders.filter((o) => o.status === "open").length;
  const screen =
    tab === "home" ? (
      <TradingHome
        model={model}
        actions={actions}
        onOpenStock={(slot) => openStock(slot, "position")}
        onGoTo={setTab}
        onReviewConsent={() => {
          log("consent_review");
          setReviewingConsent(true);
        }}
      />
    ) : tab === "market" ? (
      <MarketList model={model} actions={actions} onOpenStock={(slot) => openStock(slot, "market")} />
    ) : (
      <OrdersList model={model} actions={actions} />
    );

  return (
    <div className="min-h-dvh pb-28">
      <TopBar model={model} />
      <main className="mx-auto max-w-md space-y-5 px-4 pb-6 pt-4">{screen}</main>
      <nav
        aria-label="Trading"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 px-3 py-2.5">
          <TabButton icon={<Home />} label="Account" active={tab === "home"} onClick={() => setTab("home")} />
          <TabButton icon={<ChartLine />} label="Market" active={tab === "market"} onClick={() => setTab("market")} />
          <TabButton
            icon={<ListChecks />}
            label="Orders"
            badge={openOrders > 0 ? openOrders : null}
            active={tab === "orders"}
            onClick={() => setTab("orders")}
          />
        </div>
      </nav>

      {stock != null ? (
        <StockPage
          key={stock}
          slot={stock}
          model={model}
          actions={actions}
          onBack={closeStock}
          onTrade={(side) => setTicket({ slot: stock, side, from: "stock" })}
        />
      ) : null}

      {ticket ? (
        <TradeTicket
          key={`${ticket.slot}:${round}`}
          request={ticket}
          model={model}
          actions={actions}
          onClose={() => setTicket(null)}
        />
      ) : null}

      {showReveal ? (
        <PeriodReveal
          model={model}
          actions={actions}
          celebrate={knobs.celebrate_fills}
          onDone={() => {
            log("reveal_dismiss", { round });
            setSeenReveal(round);
            setTab("home");
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-ink font-display text-xs font-extrabold uppercase tracking-wide",
        active
          ? "translate-x-[2px] translate-y-[2px] bg-ink text-paper-inverse"
          : clsx("bg-surface text-ink shadow-card hover:bg-paper-2", PRESSABLE),
      )}
    >
      <span className="text-lg">{icon}</span>
      {label}
      {badge != null ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-[1.375rem] rounded-full border-2 border-ink bg-brand px-1 font-mono text-[11px] font-bold leading-5 text-ink">
          {badge}
          <span className="sr-only"> open</span>
        </span>
      ) : null}
    </button>
  );
}

/** "Quarter 7 / 25" with its progress track, and the round clock. */
export function TopBar({ model, left }: { model: TradingModel; left?: React.ReactNode }) {
  const { phase, round, cfg } = model;
  const secs = useCountdown(phase === "open" ? model.closesAt : null);
  const total = cfg.num_rounds;
  const pct = total > 0 ? Math.min(round / total, 1) * 100 : 0;
  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-surface">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
        {left ?? (
          <span className="relative inline-flex overflow-hidden rounded-full border-2 border-ink bg-ink px-3 pb-1.5 pt-1 font-mono text-sm font-bold uppercase text-paper-inverse">
            {phase === "lobby" ? `${total} ${periodPlural(cfg.period)}` : `${periodNoun(cfg.period)} ${round} / ${total}`}
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-paper-inverse/15">
              <span className="block h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
            </span>
          </span>
        )}
        {phase === "open" && secs != null ? (
          <ClockChip tone={secs <= URGENT_SECONDS ? "urgent" : "open"}>
            <Clock aria-hidden="true" />
            <span className="sr-only">Trading closes in </span>
            <span aria-hidden={secs > URGENT_SECONDS ? undefined : true}>{formatCountdown(secs)}</span>
          </ClockChip>
        ) : phase === "open" ? (
          <ClockChip tone="open">Trading open</ClockChip>
        ) : phase === "lobby" ? (
          <ClockChip tone="closed">Not started</ClockChip>
        ) : phase === "revealed" ? (
          <ClockChip tone="closed">Results in</ClockChip>
        ) : (
          <ClockChip tone="closed">
            <Lock aria-hidden="true" /> Closed
          </ClockChip>
        )}
      </div>
    </header>
  );
}
