import type { SessionConfig, SessionStatus } from "./types";
import { isManager } from "./types";

/**
 * Hidden market odds (supabase/migrations/0029_hidden_odds.sql).
 *
 * While a host hides the odds and the game is running, good_prob — game-level
 * and per portfolio asset — is kept OUT of sessions.config, because every
 * student can read that row. The host's screens get them back through the
 * get_hidden_odds RPC and this merge. Once the game finishes the server puts
 * them back into config for everyone.
 */

/** Stashed odds, as get_hidden_odds returns them. */
export interface HiddenOdds {
  good_prob?: number;
  assets?: (number | null)[];
}

/**
 * Are the odds hidden from students right now? The same rule as the SQL
 * `_odds_hidden`, and the same reading of the flag every student screen uses:
 * only a literal `true` shows them.
 */
export function oddsHidden(config: SessionConfig, status: SessionStatus): boolean {
  return !isManager(config) && status !== "finished" && config.show_odds_to_students !== true;
}

/**
 * The config with stashed odds filled back in wherever it has none.
 * MIRRORS `_apply_odds` in 0029_hidden_odds.sql.
 */
export function applyHiddenOdds(config: SessionConfig, odds: HiddenOdds | null | undefined): SessionConfig {
  if (!odds || typeof odds !== "object") return config;
  let out: SessionConfig = config;
  if (odds.good_prob != null && config.good_prob == null) {
    out = { ...out, good_prob: odds.good_prob };
  }
  if (Array.isArray(odds.assets) && Array.isArray(out.assets)) {
    out = {
      ...out,
      assets: out.assets.map((asset, i) => {
        const p = odds.assets?.[i];
        if (!asset || typeof asset !== "object" || asset.good_prob != null || p == null) return asset;
        return { ...asset, good_prob: p };
      }),
    };
  }
  return out;
}
