/**
 * Turning Supabase auth failures into something a person can act on.
 *
 * Two rules pull against each other here. A form must not become an oracle for
 * which email addresses have accounts — so "no such user" and "wrong password"
 * read the same. But collapsing EVERY failure into "wrong password" tells someone
 * who is rate-limited, or whose email is unconfirmed, to keep retyping a password
 * that was right all along. The codes below are the ones safe to name: each is
 * either about our own quota, or only reachable after the password was correct.
 */

/** The fields of an AuthError these helpers read. Loose so tests can pass literals. */
export type AuthErrorLike = { message: string; code?: string | null; status?: number | null };

/** Our sending/request quota, never a statement about any account. Always safe to show. */
export function isRateLimited(error: AuthErrorLike): boolean {
  if (error.status === 429) return true;
  if (error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return true;
  }
  return /rate limit/i.test(error.message);
}

const RATE_LIMITED = "Too many attempts. Wait a few minutes and try again.";
const UNAVAILABLE = "Sign-in is not responding right now. Try again in a moment.";

/** The service itself failed (network down, 5xx) — not the person's credentials. */
function isOutage(error: AuthErrorLike): boolean {
  return error.status === 0 || (typeof error.status === "number" && error.status >= 500);
}

/** Password sign-in, by email or by username. */
export function signInErrorMessage(error: AuthErrorLike, wrong: string): string {
  // GoTrue checks the password BEFORE it checks confirmation, so this code is
  // only ever returned to someone who typed the right password. Not an oracle.
  if (error.code === "email_not_confirmed") {
    return "Confirm your email first. Open the link we sent when you signed up.";
  }
  if (isRateLimited(error)) return RATE_LIMITED;
  if (isOutage(error)) return UNAVAILABLE;
  return wrong;
}

/**
 * Anything that emails an address the person typed (magic link, password reset).
 * Returns null when the failure must hide behind the same "if it has an account,
 * a link is on its way" as a success — e.g. "no such user" — and a message only
 * for failures that say nothing about the address.
 */
export function emailSendErrorMessage(error: AuthErrorLike): string | null {
  if (isRateLimited(error)) return RATE_LIMITED;
  if (isOutage(error)) return "Could not send email right now. Try again in a moment.";
  return null;
}

/**
 * Starting a Google link from an account that is already signed in (the
 * /account page, or a guest saving their results). Supabase refuses before
 * Google is ever shown when "Allow manual linking" is off in the dashboard.
 */
export function linkErrorMessage(error: AuthErrorLike): string {
  if (error.code === "manual_linking_disabled" || /manual linking is disabled/i.test(error.message)) {
    return "Linking Google isn't switched on for this site yet. Try again later.";
  }
  if (isRateLimited(error)) return RATE_LIMITED;
  return error.message;
}

/** Registration. */
export function signUpErrorMessage(error: AuthErrorLike): string {
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "That email already has an account. Sign in instead.";
  }
  if (isRateLimited(error)) return RATE_LIMITED;
  // The profile trigger (0016) raises when a username is taken between the
  // availability check and the insert. GoTrue does not pass the reason through,
  // only this generic 500, so name the one cause a person can fix.
  if (/database error saving new user/i.test(error.message)) {
    return "Could not create the account. If that username was just taken, pick another.";
  }
  if (isOutage(error)) return UNAVAILABLE;
  return error.message;
}

// ---------------------------------------------------------------------------
// Failures that arrive via a redirect (OAuth, emailed links, identity linking).
// ---------------------------------------------------------------------------

/**
 * Why a redirect back to /auth/callback did not sign someone in.
 *
 * /auth/error shows copy for one of these, chosen from a fixed list. It never
 * prints text taken from the URL: that page is reachable by a link anyone can
 * craft, and echoing a query string onto our domain is a phishing aid.
 */
export type AuthFailure =
  | "expired"
  | "other-browser"
  | "cancelled"
  | "already-linked"
  | "email-taken"
  | "linking-off"
  | "unknown";

const FAILURES: readonly AuthFailure[] = [
  "expired",
  "other-browser",
  "cancelled",
  "already-linked",
  "email-taken",
  "linking-off",
  "unknown",
];

/** A GoTrue error code (or OAuth `error` value) -> the failure it means. */
export function authFailure(code: string | null | undefined): AuthFailure {
  switch (code) {
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
      return "expired";
    // PKCE keeps its verifier in the browser that asked for the link, so a link
    // opened anywhere else cannot be exchanged.
    case "pkce_code_verifier_not_found":
    case "bad_code_verifier":
      return "other-browser";
    case "access_denied":
      return "cancelled";
    case "identity_already_exists":
      return "already-linked";
    case "email_exists":
    case "user_already_exists":
      return "email-taken";
    case "manual_linking_disabled":
      return "linking-off";
    default:
      return "unknown";
  }
}

/** Read /auth/error's `reason` back, tolerating anything a hand-edited URL holds. */
export function parseAuthFailure(raw: string | string[] | null | undefined): AuthFailure {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FAILURES.includes(v as AuthFailure) ? (v as AuthFailure) : "unknown";
}

export const AUTH_FAILURE_COPY: Record<AuthFailure, { title: string; body: string }> = {
  expired: {
    title: "That link has expired",
    body: "Links work once, and only for a while. Ask for a fresh one.",
  },
  "other-browser": {
    title: "Open the link in the same browser",
    body: "A sign-in link only works in the browser you requested it from. If you were confirming a new account, it is confirmed: just sign in.",
  },
  cancelled: {
    title: "Sign-in cancelled",
    body: "Nothing was changed.",
  },
  "already-linked": {
    title: "That Google account is already in use",
    body: "It belongs to a different account here. Sign in with it instead.",
  },
  "email-taken": {
    title: "That email already has an account",
    body: "Sign in to that account instead.",
  },
  "linking-off": {
    title: "Google linking is switched off",
    body: "Adding Google to an existing account needs manual linking enabled in Supabase.",
  },
  unknown: {
    title: "That didn't sign you in",
    body: "Something went wrong on the way back. Try signing in again.",
  },
};
