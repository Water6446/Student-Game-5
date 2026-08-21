"use client";

import { useEffect, useRef } from "react";
import type { RoundRow } from "@/lib/game/db";
import { decideRoundPhase, type RoundPhase } from "@/lib/game/round-phase";

export type { RoundPhase };

/**
 * The round phase a screen should DISPLAY, as opposed to the raw row status.
 * See lib/game/round-phase.ts for the rules; this hook only supplies the one
 * piece of state they need — whether this screen already showed the round open.
 *
 * `holdLocked` should be true in auto market mode, where "Lock & reveal" is one
 * click and the locked state is a transient the class must never see.
 */
export function useRoundPhase(
  round: RoundRow | null,
  currentRoundNumber: number,
  opts?: { holdLocked?: boolean },
): { phase: RoundPhase; round: RoundRow | null; settling: boolean } {
  const isCurrentRound = round != null && round.round_number === currentRoundNumber;
  const roundId = isCurrentRound ? round.id : null;
  const status = isCurrentRound ? round.status : null;

  // The last round id this screen actually displayed as "open".
  const sawOpenRef = useRef<string | null>(null);

  const { phase, settling } = decideRoundPhase({
    status,
    isCurrentRound,
    holdLocked: opts?.holdLocked ?? false,
    sawOpen: roundId != null && sawOpenRef.current === roundId,
  });

  useEffect(() => {
    if (roundId && status === "open") sawOpenRef.current = roundId;
  }, [roundId, status]);

  return { phase, round: isCurrentRound ? round : null, settling };
}
