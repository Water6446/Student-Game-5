// Row shapes that mirror the Postgres tables (see supabase/migrations). These
// are hand-written rather than generated to keep the project dependency-free.

import type { SessionConfig, SessionStatus, RoundStatus, MarketOutcome } from "./types";

export interface SessionRow {
  id: string;
  join_code: string;
  host_id: string;
  status: SessionStatus;
  current_round: number;
  config: SessionConfig;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  session_id: string;
  auth_uid: string | null; // null for benchmark bots
  display_name: string;
  current_wealth: number;
  is_active: boolean;
  is_bot: boolean;
  // 'all_safe' | 'edge' | 'fifty_fifty' | 'all_risky' | portfolio keys, or
  // 'index' — the manager game's lone benchmark
  strategy: string | null;
  joined_at: string;
}

export interface RoundRow {
  id: string;
  session_id: string;
  round_number: number;
  status: RoundStatus;
  market_outcome: MarketOutcome | null;
  /** portfolio, shared scope: one outcome per asset (written at reveal) */
  market_outcomes?: MarketOutcome[] | null;
  /** manager game: the year's index return (written at reveal) */
  market_return?: number | null;
  /** manager game: [r0..rn-1] GROSS manager returns (written at reveal) */
  manager_returns?: number[] | null;
  revealed_at: string | null;
}

export interface AllocationRow {
  id: string;
  round_id: string;
  player_id: string;
  /** portfolio: the SUM of risky_breakdown (aggregate UI keeps working) */
  risky_amount: number;
  safe_amount: number;
  market_outcome: MarketOutcome | null;
  /** portfolio: per-asset dollar amounts, length = num_assets */
  risky_breakdown?: number[] | null;
  /** portfolio, independent scope: this player's per-asset outcomes */
  asset_outcomes?: MarketOutcome[] | null;
  /** manager game: total fees charged this year, in dollars */
  fees_paid?: number | null;
  /** manager game: [{mgmt, perf}, ...] dollars per manager */
  fee_breakdown?: { mgmt: number; perf: number }[] | null;
  resulting_wealth: number | null;
  submitted_at: string;
}

export interface LeaderboardRow {
  player_id: string;
  display_name: string;
  current_wealth: number;
  rank: number;
  is_me: boolean;
}

/** Base site URL for building join links / QR codes / magic-link redirects. */
export function siteUrl(): string {
  // In the browser, ALWAYS use the real current origin so links and the
  // magic-link redirect match wherever the app is actually served (production,
  // a preview deployment, or localhost). This makes a stale NEXT_PUBLIC_SITE_URL
  // (e.g. left as http://localhost:3000) harmless instead of breaking auth.
  if (typeof window !== "undefined") return window.location.origin;
  // Server-side / build-time only (no window): prefer the explicit env var,
  // then Vercel's deployment URL, then localhost for dev.
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function joinUrl(code: string): string {
  return `${siteUrl()}/join?code=${encodeURIComponent(code)}`;
}
