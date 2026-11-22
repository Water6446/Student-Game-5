import { describe, expect, it } from "vitest";
import {
  UNIVERSE_HEADER,
  anchorFor,
  ineligibility,
  parseCsv,
  parseUniverseCsv,
  selectUniverse,
  type Availability,
  type UniverseRow,
} from "./universe";
import { toDayKey } from "./normalize";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("drops blank lines and keeps a last line without a newline", () => {
    expect(parseCsv("x,y\n\n1,2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });
});

const header = UNIVERSE_HEADER.join(",");

describe("parseUniverseCsv", () => {
  it("parses a valid file", () => {
    const rows = parseUniverseCsv(
      `${header}\n1970,1,"Example Corp",EXC,Technology,EXC,listed,false,high,"a note"\n`,
    );
    expect(rows).toEqual([
      {
        anchorYear: 1970,
        rank: 1,
        name: "Example Corp",
        ticker: "EXC",
        sector: "Technology",
        yahooSymbol: "EXC",
        status: "listed",
        verified: false,
        confidence: "high",
        note: "a note",
      },
    ]);
  });

  it("lists every problem at once", () => {
    expect(() =>
      parseUniverseCsv(
        `${header}\n1971,1,X,X,Technology,,listed,false,high,\n1970,1,Y,Y,Tech,,gone,maybe,sure,\n1970,1,Z,Z,Energy,,listed,false,low,\n`,
      ),
    ).toThrow(/bad anchor year 1971[\s\S]*unknown sector Tech[\s\S]*unknown status gone[\s\S]*duplicate rank 1 in 1970/);
  });

  it("rejects a wrong header", () => {
    expect(() => parseUniverseCsv("year,rank\n")).toThrow(/header/);
  });
});

describe("anchorFor", () => {
  it("is the latest anchor at or before the start year", () => {
    const anchors = [1965, 1970, 1975];
    expect(anchorFor(1967, anchors)).toBe(1965);
    expect(anchorFor(1970, anchors)).toBe(1970);
    expect(anchorFor(1999, anchors)).toBe(1975);
    expect(anchorFor(1960, anchors)).toBeNull();
  });
});

const day = toDayKey;
const W = { startYear: 1975, historyYears: 5, windowEndDay: day("1981-12-31") };

describe("ineligibility", () => {
  it("needs history from Jan 1 of the first pre-window year (with a holiday tolerance)", () => {
    expect(ineligibility({ first: day("1970-01-02"), last: day("2026-01-01"), delistDay: null }, W)).toBeNull();
    expect(ineligibility({ first: day("1970-03-01"), last: day("2026-01-01"), delistDay: null }, W)).toBe(
      "starts_too_late",
    );
    expect(ineligibility(undefined, W)).toBe("no_history");
  });

  it("needs data through the window, unless it delists inside it", () => {
    expect(ineligibility({ first: day("1960-01-04"), last: day("1979-06-01"), delistDay: null }, W)).toBe(
      "ends_too_early",
    );
    expect(
      ineligibility({ first: day("1960-01-04"), last: day("1979-06-01"), delistDay: day("1979-06-01") }, W),
    ).toBeNull();
    // delisted BEFORE the window starts: not tradable at all
    expect(
      ineligibility({ first: day("1960-01-04"), last: day("1973-06-01"), delistDay: day("1973-06-01") }, W),
    ).toBe("ends_too_early");
  });
});

describe("selectUniverse", () => {
  const row = (anchorYear: number, rank: number, sym: string | null): UniverseRow => ({
    anchorYear,
    rank,
    name: `Co ${rank}`,
    ticker: `C${rank}`,
    sector: "Industrials",
    yahooSymbol: sym,
    status: "listed",
    verified: false,
    confidence: "medium",
    note: "",
  });
  const full: Availability = { first: day("1962-01-02"), last: day("2026-11-01"), delistDay: null };
  const late: Availability = { first: day("1980-01-02"), last: day("2026-11-01"), delistDay: null };

  it("walks down the ranks of the right anchor, skipping the ineligible", () => {
    const rows = [
      row(1970, 1, "A"),
      row(1970, 2, null),
      row(1970, 3, "LATE"),
      row(1970, 4, "B"),
      row(1970, 5, "C"),
      row(1975, 1, "D"),
    ];
    const avail: Record<string, Availability> = { A: full, LATE: late, B: full, C: full, D: full };
    const pick = selectUniverse(rows, (r) => (r.yahooSymbol ? avail[r.yahooSymbol] : undefined), {
      ...W,
      startYear: 1972,
    }, 3);
    expect(pick.anchor).toBe(1970);
    expect(pick.picked.map((r) => r.yahooSymbol)).toEqual(["A", "B", "C"]);
    expect(pick.skipped.map((s) => [s.row.rank, s.reason])).toEqual([
      [2, "no_history"],
      [3, "starts_too_late"],
    ]);
  });

  it("returns fewer than n when the anchor runs out", () => {
    const pick = selectUniverse([row(1970, 1, "A")], () => full, { ...W, startYear: 1972 }, 25);
    expect(pick.picked).toHaveLength(1);
  });
});
