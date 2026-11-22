// The data the host's control screen and the projector render, and the actions
// the control screen can take. The live hook (useTradingHost) fills it from
// Supabase; the dev preview fills it from fixtures. The screens never talk to
// the database themselves.

import type { ReactNode } from "react";
import type { AllocationRow, PlayerRow, RoundRow } from "@/lib/game/db";
import type { RoundStatus, SessionStatus } from "@/lib/game/types";
import type {
  ClassActivity,
  DailyBar,
  MarketPeriodResultRow,
  SessionInstrumentRow,
  TradingStandingRow,
  TradingReveal,
  TradingTruth,
} from "@/lib/markets/db";
import type { TradingConfig } from "@/lib/markets/trading/config";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import type { FrictionKnobs } from "@/lib/research/friction";
import type { EventsPage, ResearchTables } from "@/lib/research/export";
import type { SessionConditions } from "@/components/markets/use-friction";

export interface HostModel {
  sessionId: string;
  joinCode: string;
  /** the host's label for the session, or its join code */
  title: string;
  status: SessionStatus;
  cfg: TradingConfig;
  phase: TradingPhase;
  /** the session's current round (0 in the lobby) */
  round: number;
  closesAt: string | null;
  /** whole seconds of trading left; null when the round has no deadline */
  secondsLeft: number | null;
  /** the current round row's own status: only an open row can take more time */
  roundStatus: RoundStatus | null;
  /** the round row is already locked while the open panel still shows */
  settling: boolean;
  /** active students, in join order */
  players: PlayerRow[];
  /** by account value; null until the first fetch lands */
  standings: TradingStandingRow[] | null;
  /** the session history: one allocations row per player per revealed period */
  rounds: RoundRow[];
  allocations: AllocationRow[];
  instruments: SessionInstrumentRow[];
  periods: MarketPeriodResultRow[];
  /** this round's orders, as counts (get_class_activity) */
  activity: ClassActivity | null;
  /**
   * The session-wide knobs: what the projector follows. With per-player arms
   * the projector shows nothing arm-specific (the standard preset), so no arm
   * sees another's treatment on the shared screen.
   */
  knobs: FrictionKnobs;
  /** the experiment as the host sees it: arms, students per arm, consent counts */
  conditions: SessionConditions | null;
  /** the session runs on development-only market data */
  devData: boolean;
}

export interface HostActions {
  start: () => Promise<string | null>;
  extend: (seconds: number) => Promise<string | null>;
  /** close trading now (or after time is up) and play the period out */
  lockAndReveal: () => Promise<string | null>;
  next: () => Promise<string | null>;
  finish: () => Promise<string | null>;
  deleteSession: () => Promise<string | null>;
  /** the real era and companies: host only, never on the projector */
  loadTruth: () => Promise<TradingTruth | null>;
  /** the end-of-game reveal with every name (get_trading_reveal): finished only */
  loadReveal: () => Promise<TradingReveal | null>;
  /** the index fund's daily history up to the last revealed close */
  loadIndexHistory: () => Promise<DailyBar[]>;
  /** the research export (export_research_data): an error message on failure */
  loadResearch: () => Promise<ResearchTables | string>;
  loadResearchEvents: (after: number) => Promise<EventsPage | string>;
  /** the rename / remove control beside a name (absent in the preview) */
  manage?: (player: PlayerRow) => ReactNode;
}
