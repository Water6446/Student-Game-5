import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("lib/game/manager.ts", [
(
'''import type { ManagerPublic, ManagerTruth, SessionConfig } from "./types";
import { roundCents } from "./math";''',
'''import type { FeeType, ManagerPreset, ManagerPublic, ManagerTruth, SessionConfig } from "./types";
import { roundCents } from "./math";

/**
 * A manager as the HOST authors it: public terms and true parameters together.
 * This is the only place the two live side by side, and it exists solely to
 * seed and edit the setup form — the host authors alpha, so of course they see
 * it. Students never receive this shape; create_session splits it and keeps the
 * truth in session_secrets.
 */
export interface ManagerDraft extends ManagerTruth {
  strategy_line: string;
  fee_type: FeeType;
  mgmt_fee: number;
  perf_fee: number;
}

const LONG_ONLY: ManagerDraft[] = [
  {
    name: "Meridian Alpha",
    strategy_line: "Concentrated bottom-up equity research.",
    beta: 1.0,
    alpha: 0.02,
    tracking_error: 0.05,
    fee_type: "flat",
    mgmt_fee: 0.01,
    perf_fee: 0,
  },
  {
    // Parameter-identical to Meridian apart from the SIGN OF ALPHA. That is what
    // makes the two unidentifiable year to year, which is the whole module.
    name: "Apex Capital",
    strategy_line: "High-conviction global opportunities.",
    beta: 1.0,
    alpha: -0.02,
    tracking_error: 0.05,
    fee_type: "flat",
    mgmt_fee: 0.01,
    perf_fee: 0,
  },
  {
    name: "Momentum Partners",
    strategy_line: "Systematic trend and momentum signals.",
    beta: 1.0,
    alpha: 0,
    tracking_error: 0.08,
    fee_type: "flat",
    mgmt_fee: 0.01,
    perf_fee: 0,
  },
  {
    name: "Steady Harbor",
    strategy_line: "Large-cap core, benchmark aware.",
    beta: 1.0,
    alpha: 0,
    tracking_error: 0.03,
    fee_type: "flat",
    mgmt_fee: 0.01,
    perf_fee: 0,
  },
  {
    name: "Titan Leveraged Growth",
    strategy_line: "Amplified exposure to secular growth.",
    beta: 1.5,
    alpha: 0,
    tracking_error: 0.1,
    fee_type: "flat",
    mgmt_fee: 0.01,
    perf_fee: 0,
  },
];

const TWO_AND_TWENTY = { fee_type: "performance" as const, mgmt_fee: 0.02, perf_fee: 0.2 };

/**
 * Market-neutral: near-zero beta, so its line looks plainly uncorrelated with
 * the index and holds up when the index falls. Gross, it is the best
 * risk-adjusted product here. Net of 2-and-20 the manager keeps most of the
 * value — a player who correctly identifies the best strategy still loses to
 * its fee structure.
 */
const PARITY: ManagerDraft = {
  name: "Parity Absolute Return",
  strategy_line: "Market-neutral long/short; returns uncorrelated with the index.",
  beta: 0.1,
  alpha: 0.03,
  tracking_error: 0.06,
  ...TWO_AND_TWENTY,
};

/**
 * Seeds for the host's setup form. They MIRROR `_manager_preset` in
 * supabase/migrations/0014 — but only the advanced path sends an explicit
 * line-up; the standard path sends just the preset name and lets the server
 * build it, so there is one source of truth whenever the host does not edit.
 */
export const MANAGER_PRESETS: Record<ManagerPreset, ManagerDraft[]> = {
  default: LONG_ONLY,
  hedge_fund: LONG_ONLY.map((m) => ({ ...m, ...TWO_AND_TWENTY })),
  market_neutral: [PARITY, ...LONG_ONLY],
};'''
),
])
