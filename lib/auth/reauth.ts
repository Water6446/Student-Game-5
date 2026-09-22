/**
 * "Did this person prove who they are recently?" — the gate in front of the
 * account changes that would let someone at an unlocked browser take the
 * account over for good: a new password, a new email, a linked Google account,
 * deleting the account.
 *
 * The evidence is the access token's `amr` claim (authentication methods
 * reference). GoTrue records one entry per way the session was proven —
 * password, oauth, otp, recovery … — each with the time it happened. Refreshing
 * a token does not add an entry; signing in again does. So "an entry in the
 * last few minutes" means "they typed a password, or went through Google or an
 * emailed link, just now", which is exactly what an unattended laptop lacks.
 *
 * `anonymous` never counts: a guest sign-in proves nothing about a person.
 *
 * This is a UI gate. It stops the person at the keyboard; someone who lifts
 * the tokens out of the browser can call GoTrue directly. Supabase's "Secure
 * password change" setting is the server-side half (docs/DEPLOYMENT.md).
 */

/** How long a fresh sign-in unlocks the sensitive account actions. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

export interface AmrEntry {
  method: string;
  /** seconds since the epoch */
  timestamp: number;
}

/** The token's amr entries; [] for anything that is not a readable JWT. */
export function amrEntries(accessToken: string | null | undefined): AmrEntry[] {
  const payload = accessToken?.split(".")[1];
  if (!payload) return [];
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { amr?: unknown };
    if (!Array.isArray(claims.amr)) return [];
    return claims.amr.filter(
      (e): e is AmrEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as AmrEntry).method === "string" &&
        typeof (e as AmrEntry).timestamp === "number",
    );
  } catch {
    return [];
  }
}

/** When the session was last proven by a real sign-in, in epoch seconds, or null. */
export function lastSignInAt(accessToken: string | null | undefined): number | null {
  const times = amrEntries(accessToken)
    .filter((e) => e.method !== "anonymous")
    .map((e) => e.timestamp);
  return times.length > 0 ? Math.max(...times) : null;
}

/** Was the session proven within the window? `nowSeconds` is injected for tests. */
export function signedInRecently(
  accessToken: string | null | undefined,
  nowSeconds: number,
  windowSeconds: number = REAUTH_WINDOW_SECONDS,
): boolean {
  const at = lastSignInAt(accessToken);
  // A small allowance for the browser clock running behind the auth server's.
  return at !== null && nowSeconds - at <= windowSeconds && at - nowSeconds <= 300;
}
