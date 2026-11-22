// The behaviour log's client side: event names and the batching queue. Pure.
// The server (log_behavior_events, 0033) takes at most 50 events a call, 30
// calls and 600 events a minute per player, stamps its own time and round,
// and refuses a payload over 2 KB.

export type BehaviorEventType =
  // where the student looked
  | "screen_view"
  | "stock_view"
  | "chart_range"
  | "chart_scrub"
  | "leaderboard_view"
  | "news_view"
  | "orders_view"
  | "position_view"
  // the order ticket, step by step
  | "ticket_open"
  | "ticket_change"
  | "ticket_review"
  | "ticket_back"
  | "ticket_submit"
  | "ticket_abandon"
  | "order_placed"
  | "order_failed"
  | "order_cancel"
  // the friction steps (0035): what slowed an order down, and what sped one up
  | "confirm_shown"
  | "confirm_accepted"
  | "confirm_declined"
  | "risk_shown"
  | "risk_accepted"
  | "risk_declined"
  | "cooldown_blocked"
  | "quick_buy"
  | "celebration_shown"
  | "consent_review"
  // the round clock as this student saw it
  | "phase_seen"
  | "reveal_view"
  | "reveal_dismiss"
  | "visibility";

export interface BehaviorEvent {
  type: BehaviorEventType;
  /** the device's clock, ISO; the server keeps its own beside it */
  ts: string;
  payload?: Record<string, unknown>;
}

export const MAX_BATCH = 50;
/** Events held while offline; the oldest go first beyond this. */
export const MAX_QUEUE = 500;
export const MAX_PAYLOAD_BYTES = 2048;

/** A payload the server will take: plain JSON, at most 2 KB, else a note that it was dropped. */
export function fitPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch {
    return { dropped: "unserializable" };
  }
  if (new TextEncoder().encode(text).length <= MAX_PAYLOAD_BYTES) return JSON.parse(text);
  return { dropped: "too_large" };
}

export function makeEvent(
  type: BehaviorEventType,
  payload?: Record<string, unknown>,
  now: Date = new Date(),
): BehaviorEvent {
  const fitted = fitPayload(payload);
  return fitted ? { type, ts: now.toISOString(), payload: fitted } : { type, ts: now.toISOString() };
}

/** The queue with `e` added, dropping the oldest beyond MAX_QUEUE. */
export function enqueue(queue: BehaviorEvent[], e: BehaviorEvent): BehaviorEvent[] {
  const next = [...queue, e];
  return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
}

/** The next batch to send and what stays queued. */
export function takeBatch(queue: BehaviorEvent[]): [BehaviorEvent[], BehaviorEvent[]] {
  return [queue.slice(0, MAX_BATCH), queue.slice(MAX_BATCH)];
}
