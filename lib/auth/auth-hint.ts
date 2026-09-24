/**
 * "Is anyone signed in on this browser?" — answered from the cookie name alone,
 * before any JavaScript bundle has loaded.
 *
 * The site header draws a signed-out and a signed-in variant of its right-hand
 * side, and CSS shows one based on `html[data-auth]` (globals.css). A tiny
 * inline script in the root layout sets `data-auth="in"` from this test before
 * the first paint, so a signed-in visitor never sees the signed-out buttons
 * flash and then jump. The account island (header-account.tsx) confirms it with
 * a real session check a moment later and corrects the attribute if the cookie
 * was stale.
 *
 * It is a HINT for layout, never an authorization decision: it reads only
 * whether a Supabase auth cookie exists (@supabase/ssr sets it without
 * httpOnly), not what is in it. Guests have one too, and count as signed in —
 * the header shows them an avatar menu.
 */

/** `sb-<project-ref>-auth-token`, or one of its chunks (`.0`, `.1`, …). */
export const AUTH_COOKIE_RE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

export function hasAuthCookie(cookieHeader: string): boolean {
  return AUTH_COOKIE_RE.test(cookieHeader);
}

/** Inlined into <head>. A constant: nothing from the request goes in it. */
export const AUTH_HINT_SCRIPT = `try{if(${AUTH_COOKIE_RE.toString()}.test(document.cookie))document.documentElement.dataset.auth="in"}catch(e){}`;
