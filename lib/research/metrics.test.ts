import { describe, expect, it } from "vitest";
import { annualTurnover } from "../markets/trading/stats";
import { EXPORT_FIXTURE as T } from "./__fixtures__/export";
import type { ExportEvent } from "./export";
import { allMetrics, applyFill, hhi, holdingsByRound, median, metricsByArm, playerMetrics, topGainers } from "./metrics";

const ev = (type: string, pid = "P1"): ExportEvent => ({
  id: 0,
  pid,
  round: 1,
  type,
  client_ts: null,
  server_ts: "2026-01-01T10:00:00Z",
  payload: {},
});
const EVENTS = [ev("ticket_open"), ev("ticket_open"), ev("ticket_open"), ev("ticket_open"), ev("ticket_abandon"), ev("ticket_open", "P2")];

describe("holdings from fills", () => {
  it("keeps the average cost through buys, partial sales, shorts and covers", () => {
    let h = applyFill({ qty: 0, cost: 0 }, "buy", 10, 5);
    h = applyFill(h, "buy", 10, 7);
    expect(h).toEqual({ qty: 20, cost: 120 });
    h = applyFill(h, "sell", 5, 9);
    expect(h.qty).toBe(15);
    expect(h.cost).toBeCloseTo(90); // still $6 a share
    expect(applyFill(h, "sell", 15, 1)).toEqual({ qty: 0, cost: 0 });
    let s = applyFill({ qty: 0, cost: 0 }, "sell_short", 5, 10);
    expect(s).toEqual({ qty: -5, cost: -50 });
    s = applyFill(s, "buy_to_cover", 2, 8);
    expect(s.qty).toBe(-3);
    expect(s.cost).toBeCloseTo(-30);
  });

  it("rebuilds each round's closing holdings", () => {
    const h = holdingsByRound(T.fills.filter((f) => f.pid === "P1"), 3);
    expect(h[0].size).toBe(0);
    expect(h[1].get(1)).toEqual({ qty: 100, cost: 5000 });
    expect(h[2].get(1)).toEqual({ qty: 0, cost: 0 });
    expect(h[2].get(2)).toEqual({ qty: 150, cost: 7250 });
    expect(h[3].get(1)).toEqual({ qty: -10, cost: -570 });
  });
});

describe("helpers", () => {
  it("median and HHI", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(hhi([])).toBeNull();
    expect(hhi([5])).toBe(1);
    expect(hhi([1, 1, 1, 1])).toBeCloseTo(0.25);
    expect(hhi([-3, 1])).toBeCloseTo(0.625);
  });

  it("takes only rising companies as a round's top gainers", () => {
    const g = topGainers(T);
    expect([...g.get(1)!]).toEqual([1]);
    expect([...g.get(2)!]).toEqual([3]);
    expect(g.get(3)!.size).toBe(0);
  });
});

describe("one student's metrics", () => {
  const m = playerMetrics(T, "P1", EVENTS);

  it("counts activity", () => {
    expect(m.rounds).toBe(3);
    expect(m.orders).toBe(7);
    expect(m.orders_per_round).toBeCloseTo(7 / 3);
    expect(m.trades).toBe(7);
    expect(m.turnover).toBeCloseTo(annualTurnover([10980, 8250, 1260], [10000, 9800, 10100], "quarter"));
    expect(m.final_return).toBeCloseTo(0.005);
  });

  it("times the ticket from the order context and the events", () => {
    expect(m.tickets_opened).toBe(4);
    expect(m.abandon_rate).toBe(0.25);
    expect(m.ticket_ms_median).toBe(6000);
    expect(m.review_ms_median).toBe(2000);
  });

  it("measures concentration, the index share, leverage and shorting at round ends", () => {
    const r1 = hhi([6000, 4500])!;
    const r3 = hhi([7800, 660, 550])!;
    expect(m.hhi_mean).toBeCloseTo((r1 + 1 + r3) / 3);
    expect(m.index_share_mean).toBeCloseTo((1000 / 11500 + 1020 / 8520 + 1040 / 10050) / 3);
    expect(m.leverage_max).toBeCloseTo(11500 / 9800);
    expect(m.short_rounds).toBeCloseTo(1 / 3);
  });

  it("sees a sale after a losing round and none after a winning one", () => {
    expect(m.sell_after_loss).toBe(1);
    expect(m.sell_after_gain).toBe(0);
  });

  it("measures chasing as the share of buying in last round's top gainers", () => {
    // round 2 bought $2,250 of company 2 (it fell in round 1); round 3 bought $690 of company 3 (round 2's top gainer)
    expect(m.chasing).toBeCloseTo(690 / (2250 + 690));
  });

  it("measures the disposition effect and doubling down at the prior close", () => {
    // round 2 sold company 1 (a gain); kept the index (a gain) and company 2 (a loss)
    expect(m.pgr).toBe(0.5);
    expect(m.plr).toBe(0);
    expect(m.disposition).toBe(0.5);
    // the one purchase adding to a holding (company 2) added to a losing one
    expect(m.doubling_down).toBe(1);
  });

  it("leaves a quiet student's ratios undefined rather than zero", () => {
    const q = playerMetrics(T, "P2", EVENTS);
    expect(q.orders).toBe(0);
    expect(q.trades_per_round).toBe(0);
    expect(q.abandon_rate).toBe(0);
    expect(q.hhi_mean).toBeNull();
    expect(q.chasing).toBeNull();
    expect(q.disposition).toBeNull();
    expect(q.doubling_down).toBeNull();
    expect(q.leverage_mean).toBe(0);
  });
});

describe("by arm", () => {
  it("averages each metric over the students it is defined for", () => {
    const arms = metricsByArm(allMetrics(T, EVENTS));
    expect(arms.map((a) => [a.arm, a.players])).toEqual([
      ["high", 1],
      ["low", 1],
    ]);
    expect(arms[1].disposition).toBe(0.5);
    expect(arms[0].disposition).toBeNull();
  });
});
