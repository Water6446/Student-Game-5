import { describe, expect, it } from "vitest";
import {
  generatedHeadline,
  headlinesForMonths,
  validateHeadlineFile,
  validateHeadlineText,
  type HeadlineEntry,
} from "./headlines";

describe("validateHeadlineText", () => {
  it("passes plain wording", () => {
    expect(validateHeadlineText("The central bank raises rates sharply to fight inflation")).toEqual([]);
  });

  it("catches years, decades, names, places and dated terms", () => {
    expect(validateHeadlineText("Stocks crash in 1987")).toContain("contains a year or decade");
    expect(validateHeadlineText("A boom unlike the 60s")).toContain("contains a year or decade");
    expect(validateHeadlineText("Volcker shock hits markets")[0]).toMatch(/volcker/i);
    expect(validateHeadlineText("War breaks out in the Middle East")[0]).toMatch(/middle east/i);
    expect(validateHeadlineText("Dot-com shares collapse")[0]).toMatch(/dot-com/i);
  });

  it("matches whole words only", () => {
    expect(validateHeadlineText("Investors apply caution")).toEqual([]);
    expect(validateHeadlineText("Webs of debt unwind")).toEqual([]);
  });
});

describe("validateHeadlineFile", () => {
  const ok: HeadlineEntry = { month: "1973-10", rank: 1, text: "Oil prices jump as exporters cut supply", reviewed: false };

  it("accepts a clean file", () => {
    expect(validateHeadlineFile({ note: "", entries: [ok] })).toEqual([]);
  });

  it("reports bad months, ranks, duplicates and wording", () => {
    const problems = validateHeadlineFile({
      note: "",
      entries: [
        ok,
        { ...ok },
        { ...ok, month: "1973-13" },
        { ...ok, month: "1950-01" },
        { ...ok, month: "1974-01", rank: 0 },
        { ...ok, month: "1974-02", text: "Nixon resigns" },
      ],
    });
    expect(problems.join("\n")).toMatch(/1973-10 #1: duplicate/);
    expect(problems.join("\n")).toMatch(/1973-13 #1: bad month/);
    expect(problems.join("\n")).toMatch(/1950-01 #1: outside/);
    expect(problems.join("\n")).toMatch(/1974-01 #0: bad rank/);
    expect(problems.join("\n")).toMatch(/1974-02 #1: contains "Nixon"/);
  });
});

describe("generatedHeadline", () => {
  it("matches the size and direction of the move", () => {
    expect(generatedHeadline("1990-01", -0.15)).toMatch(/plunge|sell-off/i);
    expect(generatedHeadline("1990-01", -0.07)).toMatch(/fall|dump/i);
    expect(generatedHeadline("1990-01", 0.0)).toMatch(/quiet|calm/i);
    expect(generatedHeadline("1990-01", 0.07)).toMatch(/rally|strong/i);
    expect(generatedHeadline("1990-01", 0.12)).toMatch(/surge|soaring/i);
  });

  it("never fails its own validation", () => {
    for (const r of [-0.2, -0.08, -0.03, 0, 0.03, 0.08, 0.2]) {
      for (const m of ["1965-03", "1999-11", "2008-10"]) {
        expect(validateHeadlineText(generatedHeadline(m, r))).toEqual([]);
      }
    }
  });

  it("is deterministic per month", () => {
    expect(generatedHeadline("1977-05", 0.01)).toBe(generatedHeadline("1977-05", 0.01));
  });
});

describe("headlinesForMonths", () => {
  it("uses the curated lead and generates the rest", () => {
    const entries: HeadlineEntry[] = [
      { month: "1980-02", rank: 2, text: "Second story", reviewed: false },
      { month: "1980-02", rank: 1, text: "Lead story", reviewed: false },
    ];
    const out = headlinesForMonths(entries, ["1980-01", "1980-02"], () => 0.001);
    expect(out[0].generated).toBe(true);
    expect(out[1]).toEqual({ month: "1980-02", text: "Lead story", generated: false });
  });
});
