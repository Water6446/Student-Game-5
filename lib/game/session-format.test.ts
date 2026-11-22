import { describe, expect, it } from "vitest";
import {
  filterSessions,
  gameLabel,
  liveSession,
  roundNoun,
  roundsNoun,
  sessionTabTitle,
  sessionTitle,
  whenText,
} from "./session-format";
import type { SessionOverviewRow } from "./db";
import type { SessionConfig } from "./types";

const cfg = (over: Partial<SessionConfig> = {}): SessionConfig =>
  ({ num_rounds: 25, ...over }) as SessionConfig;

const row = (over: Partial<SessionOverviewRow> = {}): SessionOverviewRow => ({
  id: "s1",
  join_code: "ABC123",
  status: "finished",
  current_round: 25,
  config: cfg(),
  created_at: "2026-01-01T10:00:00Z",
  player_count: 30,
  ...over,
});

describe("gameLabel", () => {
  it("names each game type, defaulting to basic", () => {
    expect(gameLabel(cfg({ game_type: "portfolio" }))).toBe("Portfolio");
    expect(gameLabel(cfg({ game_type: "manager" }))).toBe("Manager");
    expect(gameLabel(cfg({ game_type: "trading" }))).toBe("Paper trading");
    expect(gameLabel(cfg({ game_type: "basic" }))).toBe("Basic");
    // pre-portfolio sessions have no game_type at all
    expect(gameLabel(cfg())).toBe("Basic");
  });
});

describe("sessionTitle", () => {
  it("prefers the host's own name", () => {
    expect(sessionTitle(row({ config: cfg({ label: "ECON 101 — Section B" }) }))).toBe(
      "ECON 101 — Section B",
    );
  });

  it("falls back to the game type, never the join code", () => {
    expect(sessionTitle(row({ config: cfg({ game_type: "manager" }) }))).toBe("Manager game");
    expect(sessionTitle(row())).toBe("Basic game");
  });

  it("treats a whitespace-only label as no label", () => {
    expect(sessionTitle(row({ config: cfg({ label: "   " }) }))).toBe("Basic game");
  });
});

describe("whenText", () => {
  const now = new Date("2026-03-10T15:00:00");

  it("names today and yesterday", () => {
    expect(whenText("2026-03-10T09:30:00", now)).toMatch(/^Today, /);
    expect(whenText("2026-03-09T09:30:00", now)).toMatch(/^Yesterday, /);
  });

  it("uses a short date for older runs in the same year", () => {
    const out = whenText("2026-01-04T09:30:00", now);
    expect(out).not.toMatch(/Today|Yesterday/);
    expect(out).not.toMatch(/2026/);
  });

  it("adds the year once it is not the current one", () => {
    expect(whenText("2025-11-04T09:30:00", now)).toMatch(/2025/);
  });

  it("returns an empty string for an unparseable date rather than 'Invalid Date'", () => {
    expect(whenText("not-a-date", now)).toBe("");
  });
});

describe("liveSession", () => {
  it("prefers an active session over a lobby", () => {
    const rows = [
      row({ id: "lobby", status: "lobby" }),
      row({ id: "active", status: "active" }),
    ];
    expect(liveSession(rows)?.id).toBe("active");
  });

  it("falls back to a lobby when nothing is running", () => {
    expect(liveSession([row({ id: "f" }), row({ id: "l", status: "lobby" })])?.id).toBe("l");
  });

  it("returns null when every session is finished", () => {
    expect(liveSession([row(), row({ id: "s2" })])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(liveSession([])).toBeNull();
  });
});

describe("sessionTabTitle", () => {
  it("names the phase, with the code on host tabs", () => {
    expect(sessionTabTitle(row({ status: "lobby", current_round: 0 }), "host")).toBe("Lobby · ABC123");
    expect(sessionTabTitle(row({ status: "active", current_round: 3 }), "host")).toBe(
      "Round 3/25 · ABC123",
    );
    expect(sessionTabTitle(row({ status: "finished" }), "host")).toBe("Results · ABC123");
    expect(sessionTabTitle(row({ status: "finished" }), "student")).toBe("Game over");
  });

  it("counts years in the manager game", () => {
    expect(
      sessionTabTitle(row({ status: "active", current_round: 7, config: cfg({ game_type: "manager" }) }), "student"),
    ).toBe("Year 7/25");
  });

  it("counts the session's period in paper trading", () => {
    const trading = (period?: "quarter" | "month") =>
      row({ status: "active", current_round: 4, config: cfg({ game_type: "trading", period }) });
    expect(sessionTabTitle(trading("month"), "student")).toBe("Month 4/25");
    expect(sessionTabTitle(trading(), "host")).toBe("Quarter 4/25 · ABC123");
  });
});

describe("filterSessions", () => {
  const rows = [
    row({ id: "a", join_code: "AAA111", status: "active", config: cfg({ label: "ECON 101" }) }),
    row({ id: "b", join_code: "BBB222", status: "finished", config: cfg({ game_type: "manager" }) }),
    row({ id: "c", join_code: "CCC333", status: "lobby" }),
  ];
  const ids = (r: SessionOverviewRow[]) => r.map((x) => x.id);

  it("filters by status", () => {
    expect(ids(filterSessions(rows, "", "all"))).toEqual(["a", "b", "c"]);
    expect(ids(filterSessions(rows, "", "live"))).toEqual(["a", "c"]);
    expect(ids(filterSessions(rows, "", "finished"))).toEqual(["b"]);
  });

  it("searches name, code and game type, ignoring case", () => {
    expect(ids(filterSessions(rows, "econ", "all"))).toEqual(["a"]);
    expect(ids(filterSessions(rows, "bbb2", "all"))).toEqual(["b"]);
    expect(ids(filterSessions(rows, "MANAGER", "all"))).toEqual(["b"]);
    expect(ids(filterSessions(rows, "econ", "finished"))).toEqual([]);
  });
});

describe("roundNoun / roundsNoun", () => {
  it("names a round by game type", () => {
    expect(roundNoun(cfg())).toBe("Round");
    expect(roundNoun(cfg({ game_type: "portfolio" }))).toBe("Round");
    expect(roundNoun(cfg({ game_type: "manager" }))).toBe("Year");
    expect(roundNoun(cfg({ game_type: "trading", period: "month" }))).toBe("Month");
    expect(roundNoun(cfg({ game_type: "trading" }))).toBe("Quarter");
  });

  it("has a plural for running text, halves included", () => {
    expect(roundsNoun(cfg())).toBe("rounds");
    expect(roundsNoun(cfg({ game_type: "manager" }))).toBe("years");
    expect(roundsNoun(cfg({ game_type: "trading", period: "half" }))).toBe("halves");
    expect(roundsNoun(cfg({ game_type: "trading" }))).toBe("quarters");
  });
});
