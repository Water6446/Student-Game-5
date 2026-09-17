/**
 * Account input rules, shared by the client forms and the server route handler.
 *
 * The database enforces all of this again (0016's CHECK constraint and
 * set_my_username/claim_my_account). These functions exist to give a person a
 * useful message before a round trip — never as the security boundary.
 */

/** Same shape as the CHECK constraint on profiles.username. */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

/** Supabase's own minimum is 6; 10 is this project's policy (docs/ACCOUNTS.md §3.3). */
export const MIN_PASSWORD_LENGTH = 10;

export function usernameError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Pick a username";
  if (v.length < 3) return "At least 3 characters";
  if (v.length > 24) return "At most 24 characters";
  if (!USERNAME_RE.test(v)) return "Letters, numbers and underscore only";
  return null;
}

export function passwordError(raw: string): string | null {
  if (!raw) return "Pick a password";
  if (raw.length < MIN_PASSWORD_LENGTH) {
    return `At least ${MIN_PASSWORD_LENGTH} characters`;
  }
  // Deliberately not a character-class maze: length is what actually helps, and
  // Supabase's leaked-password check (Pro) catches the common ones.
  if (/^(.)\1+$/.test(raw)) return "That is a single repeated character";
  return null;
}

/**
 * Good enough to decide "did they type an email or a username" — not an
 * RFC-complete validator, and it does not need to be. Anything with an @ is
 * routed to Supabase as an email and judged there.
 */
export function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function emailError(raw: string): string | null {
  if (!raw.trim()) return "Enter your email";
  if (!looksLikeEmail(raw)) return "That does not look like an email address";
  return null;
}
