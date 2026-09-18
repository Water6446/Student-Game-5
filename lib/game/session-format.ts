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
