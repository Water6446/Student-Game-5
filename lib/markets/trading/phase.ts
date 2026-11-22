// What a trading screen is showing, from the session, the round's DISPLAY
// phase (lib/game/round-phase.ts) and the round clock. Pure.

import type { RoundPhase } from "../../game/round-phase";
import type { SessionStatus } from "../../game/types";

export type TradingPhase =
  /** waiting for the host to start; the market can be browsed */
  | "lobby"
  /** the next round's row is still on its way */
  | "loading"
  /** orders are accepted */
  | "open"
  /** the timer ran out or the host locked the round: waiting for the reveal */
  | "closed"
  /** the period has been played out; waiting for the next round */
  | "revealed"
  | "finished";

export function tradingPhase(
  status: SessionStatus,
  roundPhase: RoundPhase,
  secondsLeft: number | null,
): TradingPhase {
  if (status === "lobby") return "lobby";
  if (status === "finished") return "finished";
  if (roundPhase === "loading") return "loading";
  if (roundPhase === "revealed") return "revealed";
  if (roundPhase === "locked") return "closed";
  return secondsLeft === 0 ? "closed" : "open";
}
