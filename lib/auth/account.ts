/** Row shapes for the account layer (see supabase/migrations/0016–0021). */

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  institution: string | null;
  role: "user" | "admin";
  plan: "free" | "pilot" | "dept";
  created_at: string;
  updated_at: string;
}

/** One row of get_my_history() — a session this account played. */
export interface HistoryRow {
  session_id: string;
  played_at: string;
  status: "lobby" | "active" | "finished";
  display_name: string;
  final_wealth: number;
  rank: number;
  total: number;
}

/** my_deletion_preview() — what "delete my account" would destroy. */
export interface DeletionPreview {
  sessions_hosted: number;
  live_sessions_hosted: number;
  sessions_played: number;
}
