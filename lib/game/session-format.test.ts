import { describe, expect, it } from "vitest";
import { gameLabel, liveSession, sessionTitle, whenText } from "./session-format";
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
