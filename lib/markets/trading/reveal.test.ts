import { describe, expect, it } from "vitest";
import type { RevealClassRow, TradingReveal } from "../db";
import {
  classPoints,
  eraText,
  fillText,
  gameCalendar,
  gameSpanText,
  monthText,
  periodSpanText,
  realDateText,
  revealCsv,
  revealFileName,
  revealTimeline,
  turnoverTakeaway,
  vsIndexText,
  type ClassPoint,
} from "./reveal";

const row = (over: Partial<RevealClassRow>): RevealClassRow => ({
  player_id: null,
  name: null,
  is_me: false,
  nlv: 100_000,
  return: 0,
  turnover: 0,
  sharpe: null,
  max_drawdown: 0,
  trades: 0,
  ...over,
});

const REVEAL: TradingReveal = {
  start_year: 1987,
  window_first_date: "1987-01-02",
  window_last_date: "1993-12-31",
  played_last_date: "1987-12-31",
  starting_cash: 100_000,
  index_return: 0.05,
  periods: [
    { round: 1, first_date: "1987-01-02", last_date: "1987-03-31", index_return: 0.2, headlines: [] },
    { round: 2, first_date: "1987-04-01", last_date: "1987-06-30", index_return: 0.04, headlines: [] },
    {
      round: 4,
      first_date: "1987-10-01",
      last_date: "1987-12-31",
      index_return: -0.23,
      headlines: [
        { month: "1987-10", text: "Black Monday" },
        { month: "1987-10", text: "A second line for October" },
        { month: "1987-11", text: "November" },
      ],
    },
  ],
  instruments: [
    {
      slot: 3,
      kind: "equity",
      sector: "Technology",
      name: "Corvane Systems",
      ticker: "CRVN",
      real_name: "Apple Computer",
      real_ticker: "AAPL",
      current_name: "Apple Inc.",
      price_change: 0.4,
    },
  ],
  my_fills: [
    { round: 2, date: "1987-04-01", slot: 3, side: "buy", quantity: 100, price: 50, notional: 5000.4, reason: "order" },
    { round: 4, date: "1987-10-19", slot: 3, side: "sell", quantity: 100, price: 31, notional: 3100, reason: "margin_call" },
  ],
  class: [
    row({ name: "Ann", player_id: "a", nlv: 120_000, return: 0.2, turnover: 0.5, sharpe: 1.2, trades: 3 }),
    row({ name: "=cmd", player_id: "b", nlv: 120_000, return: 0.2, turnover: 4 }),
    row({ name: "Cy", player_id: "c", nlv: 90_000.123, return: -0.1, turnover: 1, max_drawdown: 0.2, trades: 9 }),
  ],
};

describe("dates and spans", () => {
  it("writes real dates and months", () => {
    expect(realDateText("1987-10-19")).toBe("Oct 19, 1987");
    expect(monthText("1987-10")).toBe("Oct 1987");
  });

  it("names each period's span by its length", () => {
    expect(periodSpanText("1990-01-02", "1990-12-31", "year")).toBe("1990");
    expect(periodSpanText("1990-01-02", "1990-03-30", "quarter")).toBe("Jan–Mar 1990");
    expect(periodSpanText("1990-11-01", "1991-01-31", "quarter")).toBe("Nov 1990 – Jan 1991");
    expect(periodSpanText("1990-03-01", "1990-03-30", "month")).toBe("Mar 1990");
    expect(periodSpanText("1990-03-05", "1990-03-09", "week")).toBe("Mar 5–9, 1990");
    expect(periodSpanText("1990-02-26", "1990-03-02", "week")).toBe("Feb 26 – Mar 2, 1990");
    expect(periodSpanText("1990-12-31", "1991-01-04", "week")).toBe("Dec 31, 1990 – Jan 4, 1991");
  });

  it("names the era by the years actually played", () => {
    expect(eraText(REVEAL)).toBe("1987");
    expect(eraText({ ...REVEAL, played_last_date: "1990-06-29" })).toBe("1987–1990");
    expect(eraText({ ...REVEAL, played_last_date: null })).toBe("1987–1993");
  });
});

describe("the timeline", () => {
  it("writes fills by dollar amount under their real names", () => {
    const apple = REVEAL.instruments[0];
    expect(fillText(REVEAL.my_fills[0], apple)).toBe("Bought $5,000 of Apple Computer (AAPL)");
    expect(fillText(REVEAL.my_fills[1], apple)).toBe("Margin call: sold $3,100 of Apple Computer (AAPL)");
    expect(fillText({ ...REVEAL.my_fills[1], reason: "delisting" }, apple)).toBe(
      "Delisted: $3,100 of Apple Computer (AAPL) settled",
    );
  });

  it("uses the traded names for a simulated market", () => {
    const sim = { ...REVEAL.instruments[0], name: "Northwind Systems", ticker: "NWS" };
    expect(fillText(REVEAL.my_fills[0], sim, true)).toBe("Bought $5,000 of Northwind Systems (NWS)");
    expect(fillText(REVEAL.my_fills[0], sim)).toBe("Bought $5,000 of Apple Computer (AAPL)");
  });

  it("names a simulated market's dates in game time", () => {
    const cal = gameCalendar(2107);
    expect(cal.date("2107-03-14")).toBe("Year 1 · Mar 14");
    expect(cal.date("2109-10-19")).toBe("Year 3 · Oct 19");
    expect(cal.date("2106-06-03")).toBe("Year −1 · Jun 3");
    expect(cal.month("2108-11")).toBe("Year 2 · Nov");
    expect(gameSpanText("2107-01-04", "2107-12-31", "year", 2107)).toBe("Year 1");
    expect(gameSpanText("2108-04-01", "2108-06-30", "quarter", 2107)).toBe("Year 2 · Apr–Jun");
    expect(gameSpanText("2108-11-01", "2109-01-31", "quarter", 2107)).toBe("Year 2 · Nov – Year 3 · Jan");
    expect(gameSpanText("2108-03-01", "2108-03-30", "month", 2107)).toBe("Year 2 · Mar");
    expect(gameSpanText("2108-03-05", "2108-03-09", "week", 2107)).toBe("Year 2 · Mar 5–9");
    expect(gameSpanText("2108-02-26", "2108-03-02", "week", 2107)).toBe("Year 2 · Feb 26 – Mar 2");
    const t = revealTimeline({ ...REVEAL, start_year: 1987 }, "quarter", false, gameCalendar(1987));
    expect(t[1].span).toBe("Year 1 · Oct–Dec");
  });

  it("keeps periods with a trade or a headline", () => {
    const t = revealTimeline(REVEAL, "quarter");
    expect(t.map((p) => p.round)).toEqual([2, 4]);
    expect(t[1]).toMatchObject({ span: "Oct–Dec 1987", indexReturn: -0.23 });
    expect(t[1].fills).toHaveLength(1);
    expect(t[1].headlines.map((h) => h.text)).toEqual(["Black Monday", "November"]);
    expect(revealTimeline(REVEAL, "quarter", true)).toHaveLength(3);
  });

  it("compares the result with buying and holding the index", () => {
    expect(vsIndexText(0.092, 0.05)).toBe("You beat buying and holding the index fund by 4.2 points.");
    expect(vsIndexText(-0.1, 0.05)).toBe("You trailed buying and holding the index fund by 15.0 points.");
    expect(vsIndexText(0.0502, 0.05)).toBe("You matched buying and holding the index fund.");
    expect(vsIndexText(0.1, null)).toBeNull();
  });
});

const pts = (pairs: [number, number][]): ClassPoint[] =>
  pairs.map(([turnover, ret]) => ({ turnover, ret, me: false, name: null, id: null }));

describe("the Barber & Odean takeaway", () => {
  it("compares the busiest fifth with the quietest fifth from ten students", () => {
    const t = turnoverTakeaway(
      pts([
        [10, -0.1],
        [9, -0.2],
        [5, 0],
        [4, 0],
        [3, 0],
        [2, 0],
        [1, 0],
        [0.5, 0],
        [0.2, 0.1],
        [0.1, 0.3],
      ]),
      0.08,
    );
    expect(t.group).toBe("fifth");
    expect(t.busiest).toBeCloseTo(-0.15);
    expect(t.quietest).toBeCloseTo(0.2);
    expect(t.verdict).toMatch(/^Like Barber and Odean/);
    expect(t.detail).toBe("Busiest fifth: −15.0% · quietest fifth: +20.0% · index fund: +8.0%");
  });

  it("uses halves for a small class and says when trading paid", () => {
    const t = turnoverTakeaway(
      pts([
        [3, 0.3],
        [2, 0.1],
        [1, 0],
        [0, 0],
      ]),
      null,
    );
    expect(t.group).toBe("half");
    expect(t.busiest).toBeCloseTo(0.2);
    expect(t.verdict).toMatch(/^Unlike/);
    expect(t.detail).toBe("Busiest half: +20.0% · quietest half: 0.0%");
  });

  it("declines when there is nothing to compare", () => {
    expect(turnoverTakeaway(pts([[1, 0]]), 0).verdict).toMatch(/^Too few/);
    expect(
      turnoverTakeaway(
        pts([
          [0, 0.1],
          [0, 0],
          [0, -0.1],
          [0, 0],
        ]),
        0,
      ).verdict,
    ).toMatch(/^Everyone traded the same/);
  });

  it("reads the class rows as points", () => {
    expect(classPoints([row({ turnover: -0.1, return: 0.05, is_me: true })])[0]).toEqual({
      turnover: 0,
      ret: 0.05,
      me: true,
      name: null,
      id: null,
    });
  });
});

describe("the host's CSV", () => {
  it("ranks by final value with shared ranks, defusing formula names", () => {
    const lines = revealCsv(REVEAL).split("\r\n");
    expect(lines[0]).toBe("rank,name,final_value,return,turnover,sharpe,max_drawdown,trades");
    expect(lines[1]).toBe("1,Ann,120000,0.2,0.5,1.2,0,3");
    expect(lines[2]).toBe("1,'=cmd,120000,0.2,4,,0,0");
    expect(lines[3]).toBe("3,Cy,90000.12,-0.1,1,,0.2,9");
    expect(revealFileName("AB12CD")).toBe("sharpesim-trading-AB12CD.csv");
  });
});
