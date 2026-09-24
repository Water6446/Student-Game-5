/**
 * Which pages wear the site header, and which link is "you are here".
 *
 * The header is mounted once, in the root layout, so it survives navigation
 * instead of being torn down and rebuilt by every page (which made the account
 * area blink on each click). The game screens opt out: they are full-screen
 * app surfaces with their own chrome.
 */

/**
 * Does this route show the site header?
 *   /play/<id>            the student's game screen — no
 *   /host/<id>[/present]  the host's control screen and the projector — no
 *   /host                 the host dashboard — yes
 *   everything else       yes
 */
export function showsSiteHeader(pathname: string | null | undefined): boolean {
  const p = pathname || "/";
  if (p === "/play" || p.startsWith("/play/")) return false;
  if (/^\/host\/[^/]+/.test(p)) return false;
  return true;
}

/** Is `href` the page on screen? Its query string and hash are ignored. */
export function isCurrentPath(pathname: string | null | undefined, href: string): boolean {
  const target = href.split(/[?#]/)[0] || "/";
  return (pathname || "/") === target;
}

/** The section id a "/#how"-style link points at, or null. */
export function sectionIdOf(href: string): string | null {
  const hash = href.split("#")[1];
  return hash ? hash : null;
}
