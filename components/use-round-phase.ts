"use client";

import { useEffect, useRef, useState } from "react";
import type { RoundRow } from "@/lib/game/db";

export type RoundPhase = "loading" | "open" | "locked" | "revealed";

/** How long a `locked` row is held back before any screen is allowed to show it. */
export const DEFAULT_SETTLE_MS = 450;

/**
 * The round phase a screen should DISPLAY, as opposed to the raw row status.
 *
 *  - "loading" whenever the loaded round is not the session's current round
 *    (use-round needs a fetch round-trip after next_round; without this gate
 *    every surface renders round N-1's content under a round N header).
 *  - the "locked" phase is held back by `settleMs`: in auto market mode the
 *    host's single "Lock & reveal" click fires two sequential RPCs, so `locked`
 *    is a transient the class should never see. A genuine manual lock outlives
 *    the delay and shows normally.
 *
 * The hold only applies to a round this screen has already displayed as "open".
 * A client that loads straight into a locked round never saw the transition, so
 * there is nothing to swallow and `locked` renders immediately.
 */
export function useRoundPhase(
  round: RoundRow | null,
  currentRoundNumber: number,
  opts?: { settleMs?: number },
): { phase: RoundPhase; round: RoundRow | null } {
  const settleMs = opts?.settleMs ?? DEFAULT_SETTLE_MS;

  // The loaded row only describes this screen while it IS the session's current
  // round. After next_round the session row updates first, so `round` still
  // holds round N-1 for one fetch round-trip.
  const fresh = round != null && round.round_number === currentRoundNumber;
  const roundId = fresh ? round.id : null;
  const status = fresh ? round.status : null;

  // The last round id we actually displayed as "open".
  const sawOpenRef = useRef<string | null>(null);
  // The round whose `locked` status is currently held back, and when it expires.
  const holdRef = useRef<{ roundId: string; endsAt: number } | null>(null);
  // Re-render trigger for the moment a hold expires.
  const [, bump] = useState(0);

  // Decided during render on purpose: doing this in an effect would let the
  // `locked` frame paint first, which is exactly the flash being removed.
  let phase: RoundPhase;
  if (!fresh || roundId == null) {
    phase = "loading";
  } else if (status === "revealed") {
    phase = "revealed";
  } else if (status === "locked") {
    if (sawOpenRef.current !== roundId) {
      phase = "locked";
    } else {
      if (holdRef.current?.roundId !== roundId) {
        holdRef.current = { roundId, endsAt: Date.now() + settleMs };
      }
      // Held back → keep reporting the phase we were already showing.
      phase = Date.now() < holdRef.current.endsAt ? "open" : "locked";
    }
  } else {
    phase = "open";
  }

  useEffect(() => {
    if (roundId && status === "open") sawOpenRef.current = roundId;
  }, [roundId, status]);

  // Release the hold. Deps include roundId so a round change resets the timer,
  // and the cleanup clears it on unmount.
  useEffect(() => {
    if (status !== "locked" || phase !== "open") return;
    const remaining = (holdRef.current?.endsAt ?? 0) - Date.now();
    const t = setTimeout(() => bump((n) => n + 1), Math.max(remaining, 0));
    return () => clearTimeout(t);
  }, [roundId, status, phase]);

  return { phase, round: fresh ? round : null };
}
