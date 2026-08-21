import { describe, expect, it } from "vitest";
import { decideRoundPhase } from "./round-phase";

const base = { status: "open" as const, isCurrentRound: true, holdLocked: true, sawOpen: true };

describe("decideRoundPhase", () => {
  it("is loading while the loaded round is not the session's current round", () => {
    // After next_round the session updates first and use-round still serves
    // round N-1 — never render that under a round N header.
    expect(decideRoundPhase({ ...base, isCurrentRound: false, status: "revealed" })).toEqual({
      phase: "loading",
      settling: false,
    });
    expect(decideRoundPhase({ ...base, status: null })).toEqual({
      phase: "loading",
      settling: false,
    });
  });

  it("auto mode never shows the locked screen once the round was open", () => {
    // The whole point: no time limit on the hold, so a slow resolve_round
    // cannot leak "Bets locked in — review, then reveal".
    expect(decideRoundPhase({ ...base, status: "locked" })).toEqual({
      phase: "open",
      settling: true,
    });
  });

  it("manual mode shows the locked screen immediately — the host asked for it", () => {
    expect(decideRoundPhase({ ...base, status: "locked", holdLocked: false })).toEqual({
      phase: "locked",
      settling: false,
    });
  });

  it("a screen that loaded straight into a locked round shows it", () => {
    // No transition to swallow, and it is the only way back if resolve_round
    // failed and left the round closed.
    expect(decideRoundPhase({ ...base, status: "locked", sawOpen: false })).toEqual({
      phase: "locked",
      settling: false,
    });
  });

  it("open and revealed pass straight through", () => {
    expect(decideRoundPhase({ ...base, status: "open" })).toEqual({
      phase: "open",
      settling: false,
    });
    expect(decideRoundPhase({ ...base, status: "revealed" })).toEqual({
      phase: "revealed",
      settling: false,
    });
  });

  it("goes open -> revealed in auto mode, never emitting locked", () => {
    const seen = (["open", "locked", "revealed"] as const).map(
      (status) => decideRoundPhase({ ...base, status }).phase,
    );
    expect(seen).toEqual(["open", "open", "revealed"]);
    expect(seen).not.toContain("locked");
  });

  it("settling is only true where a write would hit a locked round", () => {
    const statuses = ["open", "locked", "revealed"] as const;
    const settling = statuses.map((status) => decideRoundPhase({ ...base, status }).settling);
    expect(settling).toEqual([false, true, false]);
  });
});
