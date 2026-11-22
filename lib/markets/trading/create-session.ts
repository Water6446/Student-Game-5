import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateTradingResult =
  | { ok: true; id: string; join_code: string; universe_size: number; warning?: string }
  | { ok: false; error: string };

/**
 * Create a paper trading session (create_trading_session, 0033). Shared by the
 * setup form and the dashboard's "Run again", so both report a shrunken
 * universe the same way: a host-picked era can hold fewer companies than asked
 * for, and the server then plays with the ones it has and says how many.
 *
 * `startYear` is the host's own pick of Year 1; null lets the server choose an
 * era at random. Either way the era is kept server-side, never in config.
 */
export async function createTradingSession(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  startYear: number | null = null,
): Promise<CreateTradingResult> {
  const { data, error } = await supabase.rpc("create_trading_session", {
    p_config: config,
    p_start_year: startYear,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data as { id: string; join_code: string; universe_size: number }[] | null)?.[0];
  if (!row) return { ok: false, error: "The server did not return the new session." };
  const asked = Number(config.universe_size);
  return {
    ok: true,
    id: row.id,
    join_code: row.join_code,
    universe_size: row.universe_size,
    warning: shrunkUniverseWarning(asked, row.universe_size) ?? undefined,
  };
}

/** The note for a game with fewer companies than asked for, or null. */
export function shrunkUniverseWarning(asked: number, got: number): string | null {
  if (!Number.isFinite(asked) || !Number.isFinite(got) || got >= asked) return null;
  return `Only ${got} companies have data for that era, so this game has ${got}.`;
}
