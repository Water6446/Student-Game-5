import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatGameDate,
  formatGameMonth,
  gameLabel,
  periodRange,
  periodSpan,
  roundLabel,
  secondsLeft,
  windowLength,
} from "./clock";
import { toDayKey } from "./data/normalize";

describe("periodRange (mirrors _trading_period_range)", () => {
  it("counts months from Jan 1 of the start year", () => {
    expect(periodRange(1990, "month", 1)).toMatchObject({ from: "1990-01-01", to: "1990-01-31" });
    expect(periodRange(1990, "month", 2)).toMatchObject({ from: "1990-02-01", to: "1990-02-28" });
    expect(periodRange(1992, "month", 2)).toMatchObject({ from: "1992-02-01", to: "1992-02-29" });
    expect(periodRange(1990, "month", 3)).toMatchObject({ from: "1990-03-01", to: "1990-03-31" });
    expect(periodRange(1990, "month", 13)).toMatchObject({ from: "1991-01-01", to: "1991-01-31" });
  });

  it("handles quarters, halves and years", () => {
    expect(periodRange(1975, "quarter", 7)).toMatchObject({ from: "1976-07-01", to: "1976-09-30" });
    expect(periodRange(1975, "quarter", 25)).toMatchObject({ from: "1981-01-01", to: "1981-03-31" });
    expect(periodRange(2000, "half", 2)).toMatchObject({ from: "2000-07-01", to: "2000-12-31" });
    expect(periodRange(1980, "year", 3)).toMatchObject({ from: "1982-01-01", to: "1982-12-31" });
  });

  it("makes weeks seven days from Jan 1, whatever the weekday", () => {
    expect(periodRange(1990, "week", 1)).toMatchObject({ from: "1990-01-01", to: "1990-01-07" });
    expect(periodRange(1990, "week", 53)).toMatchObject({ from: "1990-12-31", to: "1991-01-06" });
  });

  it("returns day keys that match the dates", () => {
    const r = periodRange(1990, "quarter", 1);
    expect(r.fromDay).toBe(toDayKey("1990-01-01"));
    expect(r.toDay).toBe(toDayKey("1990-03-31"));
  });
});

describe("gameLabel (mirrors _trading_label)", () => {
  it("counts game days from Jan 1 of Year 1, with no Year 0", () => {
    expect(gameLabel(1990, toDayKey("1990-01-31"))).toEqual([30, 1, 1, 31]);
    expect(gameLabel(1990, toDayKey("1990-01-01"))).toEqual([0, 1, 1, 1]);
    expect(gameLabel(1990, toDayKey("1989-12-29"))).toEqual([-3, -1, 12, 29]);
    expect(gameLabel(1990, toDayKey("1985-01-02"))[1]).toBe(-5);
    expect(gameLabel(1990, toDayKey("1992-03-14"))).toEqual([toDayKey("1992-03-14") - toDayKey("1990-01-01"), 3, 3, 14]);
  });
});

describe("formatting", () => {
  it("reads like the spec", () => {
    expect(formatGameDate([800, 3, 3, 14])).toBe("Year 3 · Mar 14");
    expect(formatGameDate([-900, -2, 6, 3])).toBe("Year −2 · Jun 3");
    expect(formatGameMonth(1, 10)).toBe("Year 1 · Oct");
    expect(roundLabel("quarter", 7, 25)).toBe("Quarter 7 of 25");
    expect(roundLabel("year", 3, 25)).toBe("Year 3 of 25");
  });

  it("states the window length", () => {
    expect(windowLength("quarter", 25)).toBe("6.25 years");
    expect(windowLength("year", 25)).toBe("25 years");
    expect(windowLength("half", 3)).toBe("1.5 years");
    expect(windowLength("month", 6)).toBe("6 months");
    expect(windowLength("week", 25)).toBe("25 weeks");
    expect(windowLength("year", 1)).toBe("1 year");
  });

  it("counts down", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(secondsLeft("2026-01-01T10:01:05Z", now)).toBe(65);
    expect(secondsLeft("2026-01-01T09:59:00Z", now)).toBe(0);
    expect(secondsLeft(null, now)).toBeNull();
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(9)).toBe("0:09");
  });
});

describe("periodSpan", () => {
  it("names a round's months in game time", () => {
    expect(periodSpan("quarter", 1)).toBe("Year 1 · Jan–Mar");
    expect(periodSpan("quarter", 6)).toBe("Year 2 · Apr–Jun");
    expect(periodSpan("half", 4)).toBe("Year 2 · Jul–Dec");
    expect(periodSpan("month", 14)).toBe("Year 2 · Feb");
  });

  it("says nothing the round label already says, or that needs the real calendar", () => {
    expect(periodSpan("year", 3)).toBeNull();
    expect(periodSpan("week", 7)).toBeNull();
    expect(periodSpan("quarter", 0)).toBeNull();
  });
});
