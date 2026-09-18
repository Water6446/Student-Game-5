import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionConfig } from "./types";

/** What create_session accepts: the config, minus the fields the server owns. */
export type CreateSessionResult =
  | { ok: true; id: string; join_code: string; warning?: string }
  | { ok: false; error: string };

/**
 * Create a session and seed its benchmark players.
 *
 * Shared by the setup form and "run it again" so the two cannot drift. Adding
 * benchmark bots is a second call that the server does not do for us, and
 * forgetting it silently produces a game with no baselines to compare against —
 * which is exactly the kind of thing that goes wrong when the sequence is
 * duplicated in two places.
 *
 * A failed bot insert is deliberately NOT fatal: the session exists and is
 * perfectly playable, so the caller gets the id plus a warning rather than an
 * error that implies nothing happened.
 */
export async function createSession(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
): Promise<CreateSessionResult> {
  const { data, error } = await supabase
    .rpc("create_session", { p_config: config })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  const created = data as { id: string; join_code: string };

  if (config.add_benchmark_bots) {
    const { error: botErr } = await supabase.rpc("add_benchmark_bots", {
      p_session_id: created.id,
    });
    if (botErr) {
      return {
        ok: true,
        id: created.id,
        join_code: created.join_code,
        warning: `Session created, but adding benchmark students failed: ${botErr.message}`,
      };
    }
  }

  return { ok: true, id: created.id, join_code: created.join_code };
}

/**
 * The config to submit when re-running a finished session.
 *
 * *** WHY `managers` MUST BE STRIPPED ***
 * A manager session stores only the PUBLIC half of its line-up — name, track
 * record and fees. The true alpha, beta and tracking error live in
 * session_secrets and never reach the client. Feeding the stored array back to
 * create_session would therefore recreate the game with every manager at
 * alpha 0, beta 1, tracking error 0 (the server's coalesce defaults): a manager
 * game where skill does not exist and the whole lesson silently collapses.
 *
 * Dropping the key makes the server rebuild the line-up from `manager_preset`,
 * which also re-rolls the secret alpha — so two sections of the same course do
 * not share an answer key.
 */
export function configForRerun(config: SessionConfig): Record<string, unknown> {
  const { managers: _managers, ...rest } = config;
  return rest as Record<string, unknown>;
}
