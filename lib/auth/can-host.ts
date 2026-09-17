import type { User } from "@supabase/supabase-js";

/**
 * ON unless explicitly disabled. Still in testing — set
 * NEXT_PUBLIC_ALLOW_ANON_HOST=false to turn the bypass off. See .env.example.
 */
export const ALLOW_ANON_HOST = process.env.NEXT_PUBLIC_ALLOW_ANON_HOST !== "false";

/**
 * May this user reach the host dashboard?
 *
 * Hosting needs a real identity — except that anonymous "skip email" sessions
 * are let through while the testing flag is on (the default).
 *
 * This lives in one place because /host and /login redirect to each other: /host
 * bounces a user who cannot host, and /login bounces one who already has an
 * account. If those two conditions were written separately they could drift into
 * overlapping, and the pages would ping-pong forever. Here they are exact
 * complements by construction:
 *
 *   no user            -> /host sends them to /login; /login shows the form
 *   real account       -> /host admits them;          /login sends them on
 *   guest, bypass ON   -> /host admits them;          /login shows the form
 *                         (a guest may still want a real account, so /login
 *                          must NOT bounce them — hasAccount is false)
 *   guest, bypass OFF  -> /host sends them to /login; /login shows the form
 *
 * No state redirects in both directions.
 */
export function canHost(user: User | null): boolean {
  if (!user) return false;
  return !user.is_anonymous || ALLOW_ANON_HOST;
}

/** A real, non-anonymous identity — the thing /login exists to produce. */
export function hasAccount(user: User | null): boolean {
  return Boolean(user) && !user!.is_anonymous;
}
