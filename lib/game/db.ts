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

/**
 * No auth_uid: clients cannot select it (0028), so it is not here to be relied
 * on. A student finds their own row with the get_my_player_id RPC.
 */
export interface PlayerRow {
  id: string;
  session_id: string;
  display_name: string;
  current_wealth: number;
  is_active: boolean;
  is_bot: boolean;
  // 'all_safe' | 'edge' | 'fifty_fifty' | 'all_risky' | portfolio keys, or
  // 'index' — the manager game's lone benchmark
  strategy: string | null;
  joined_at: string;
}

/**
 * The players columns a client may select, spelled out: `select("*")` would ask
 * for auth_uid too, and Postgres refuses the whole query for it (0028).
 */
export const PLAYER_COLUMNS =
  "id,session_id,display_name,current_wealth,is_active,is_bot,strategy,joined_at";

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

/**
 * One row of get_my_sessions_overview() — a session plus the roster size the
 * dashboard needs, counted server-side so listing 40 sessions does not mean
 * pulling every player row the host has ever had. Bots are excluded.
 */
export interface SessionOverviewRow {
  id: string;
  join_code: string;
  status: SessionStatus;
  current_round: number;
  config: SessionConfig;
  created_at: string;
  player_count: number;
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
