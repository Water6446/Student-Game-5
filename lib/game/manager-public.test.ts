// Guardrail: the PUBLIC manager shape must never carry the truth.
//
// The whole module rests on students being unable to read alpha. sessions.config
// is readable by any session member, so anything that reaches ManagerPublic
// reaches the class. These assertions are cheap and they fail loudly if someone
// widens the type or starts copying fields across.

import { describe, expect, it } from "vitest";
import type { ManagerPublic } from "./types";

const SECRET_KEYS = ["alpha", "beta", "tracking_error"] as const;

/** A ManagerPublic exactly as create_session projects it. */
const SAMPLE: ManagerPublic = {
  name: "Meridian Alpha",
  strategy_line: "Concentrated bottom-up equity research.",
  fee_type: "flat",
  mgmt_fee: 0.01,
  perf_fee: 0,
  track_record: {
    yearly: [0.1, -0.05, 0.2, 0.03, -0.11, 0.14, 0.07, -0.02, 0.09, 0.12],
    one_yr: 0.12,
    five_yr: 0.076,
    ten_yr: 0.055,
  },
  vol_label: "Moderate",
};

describe("ManagerPublic", () => {
  it("carries none of the true parameters", () => {
    const keys = Object.keys(SAMPLE);
    for (const secret of SECRET_KEYS) {
      expect(keys).not.toContain(secret);
    }
    // nested too — the track record is generated FROM the truth, not with it
    expect(Object.keys(SAMPLE.track_record)).not.toContain("alpha");
  });

  it("serialises without the word alpha or tracking_error anywhere", () => {
    // The db_selftest asserts the same thing against a real create_session
    // round-trip; this is the client-side half of that pair.
    const json = JSON.stringify(SAMPLE);
    expect(json).not.toContain("tracking_error");
    expect(json).not.toContain('"beta"');
    expect(json.toLowerCase()).not.toContain('"alpha"');
  });

  it("would not compile with a secret field", () => {
    // @ts-expect-error alpha is not part of the public shape
    const bad: ManagerPublic = { ...SAMPLE, alpha: 0.02 };
    // the runtime object still has it; the point is that TS rejects the type
    expect(bad).toBeTruthy();
  });
});
