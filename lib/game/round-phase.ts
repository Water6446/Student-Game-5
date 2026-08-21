// Which phase a screen should DISPLAY for a round, as opposed to the raw row
// status. Pure so it can be tested without a DOM; components/use-round-phase.ts
// is the React wrapper that tracks the one piece of state it needs.

import type { RoundStatus } from "./types";

export type RoundPhase = "loading" | "open" | "locked" | "revealed";

export interface PhaseDecision {
  phase: RoundPhase;
  /**
   * True while the row says `locked` but we are still showing `open`. Nothing
   * is wrong — but the round is closed, so any control that would write to it
   * must be disabled or the click lands on a locked round and errors.
   */
  settling: boolean;
}

export function decideRoundPhase({
  status,
  isCurrentRound,
  holdLocked,
  sawOpen,
}: {
  /** the loaded round's status, or null when no round is loaded */
  status: RoundStatus | null;
  /** the loaded round IS the session's current round */
  isCurrentRound: boolean;
  /**
   * Auto market mode. The host's single "Lock & reveal" click fires lock_round
   * and then resolve_round, so `locked` is a transient nobody asked to see and
   * there is no review step to show. Held until `revealed` arrives — NOT for a
   * fixed delay: a slow resolve (a big class) would leak the locked screen for
   * whatever time the delay did not cover.
   */
  holdLocked: boolean;
  /** this screen has already displayed THIS round as open */
  sawOpen: boolean;
}): PhaseDecision {
  // After next_round the session row updates first, so use-round serves round
  // N-1 for one fetch round-trip. Never render that under a round N header.
  if (!isCurrentRound || status == null) return { phase: "loading", settling: false };

  if (status === "revealed") return { phase: "revealed", settling: false };

  if (status === "locked") {
    // A screen that loaded straight into a locked round never saw the
    // transition: there is no transient to swallow, and showing `locked` is the
    // only way back if resolve_round failed and left the round closed.
    if (holdLocked && sawOpen) return { phase: "open", settling: true };
    return { phase: "locked", settling: false };
  }

  return { phase: "open", settling: false };
}
