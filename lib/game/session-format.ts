import type { SessionConfig } from "./types";
import type { SessionOverviewRow } from "./db";

/** "Basic" / "Portfolio" / "Manager" from a stored config. */
export function gameLabel(config: SessionConfig): string {
  switch (config.game_type) {
    case "portfolio":
      return "Portfolio";
    case "manager":
      return "Manager";
    default:
      return "Basic";
  }
}

/**
 * What to call a session in a list. The host's own name if they gave one,
 * otherwise the game type — never a bare join code, which is already shown
 * beside it and means nothing a week later.
 */
export function sessionTitle(s: { config: SessionConfig; join_code: string }): string {
  const label = s.config.label?.trim();
  return label && label.length > 0 ? label : `${gameLabel(s.config)} game`;
}

/**
 * A date a person can place. Today and yesterday are named; anything older gets
 * a short date, with the year only once it is not the current one.
 */
export function whenText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, now)) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`;

  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The session a host would want to jump straight back into, if any. */
export function liveSession(rows: SessionOverviewRow[]): SessionOverviewRow | null {
  // An in-progress class outranks a lobby that is still filling up; among
  // equals, the most recently created one is the one they just opened.
  return (
    rows.find((r) => r.status === "active") ?? rows.find((r) => r.status === "lobby") ?? null
  );
}

/**
 * A browser-tab title for a session's live screens, so a host's control and
 * projector tabs — and a student's game — say where things stand at a glance.
 * The join code goes on host tabs (they may run two sections at once); a
 * student only ever has the one game.
 */
export function sessionTabTitle(
  s: { status: string; current_round: number; join_code: string; config: SessionConfig },
  audience: "host" | "student",
): string {
  const unit = s.config.game_type === "manager" ? "Year" : "Round";
  const total = s.config.num_rounds ?? 0;
  const phase =
    s.status === "lobby"
      ? "Lobby"
      : s.status === "finished"
        ? audience === "host"
          ? "Results"
          : "Game over"
        : `${unit} ${Math.min(s.current_round, total || s.current_round)}/${total}`;
  return audience === "host" ? `${phase} · ${s.join_code}` : phase;
}

export type SessionStatusFilter = "all" | "live" | "finished";

/**
 * The dashboard list's search and status filter. Search matches what the row
 * shows — the name, the join code, the game type — case-insensitively.
 */
export function filterSessions(
  rows: SessionOverviewRow[],
  query: string,
  status: SessionStatusFilter,
): SessionOverviewRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (status === "live" && r.status === "finished") return false;
    if (status === "finished" && r.status !== "finished") return false;
    if (!q) return true;
    return [sessionTitle(r), r.join_code, gameLabel(r.config)].some((f) =>
      f.toLowerCase().includes(q),
    );
  });
}
