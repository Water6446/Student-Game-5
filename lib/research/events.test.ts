import { describe, expect, it } from "vitest";
import { enqueue, fitPayload, makeEvent, MAX_BATCH, MAX_QUEUE, takeBatch, type BehaviorEvent } from "./events";

describe("behaviour log queue", () => {
  it("stamps events with the device time", () => {
    const e = makeEvent("ticket_open", { slot: 3 }, new Date("2026-11-20T10:00:00Z"));
    expect(e).toEqual({ type: "ticket_open", ts: "2026-11-20T10:00:00.000Z", payload: { slot: 3 } });
    expect(makeEvent("orders_view").payload).toBeUndefined();
  });

  it("drops a payload the server would refuse rather than the event", () => {
    expect(fitPayload({ big: "x".repeat(3000) })).toEqual({ dropped: "too_large" });
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(fitPayload(loop)).toEqual({ dropped: "unserializable" });
    expect(fitPayload({ a: 1, skip: undefined })).toEqual({ a: 1 });
  });

  it("keeps the newest events when the queue overflows", () => {
    let q: BehaviorEvent[] = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) q = enqueue(q, makeEvent("screen_view", { i }));
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q[0].payload).toEqual({ i: 5 });
  });

  it("sends at most one server batch at a time", () => {
    const q = Array.from({ length: MAX_BATCH + 7 }, () => makeEvent("chart_scrub"));
    const [batch, rest] = takeBatch(q);
    expect(batch).toHaveLength(MAX_BATCH);
    expect(rest).toHaveLength(7);
  });
});
