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
  auth_uid: string;
  display_name: string;
  current_wealth: number;
  is_active: boolean;
  joined_at: string;
}

export interface RoundRow {
  id: string;
  session_id: string;
  round_number: number;
  status: RoundStatus;
  market_outcome: MarketOutcome | null;
  revealed_at: string | null;
}

export interface AllocationRow {
  id: string;
  round_id: string;
  player_id: string;
  risky_amount: number;
  safe_amount: number;
  market_outcome: MarketOutcome | null;
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

/** Base site URL for building join links / QR codes (no trailing slash). */
export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

export function joinUrl(code: string): string {
  return `${siteUrl()}/join?code=${encodeURIComponent(code)}`;
}
