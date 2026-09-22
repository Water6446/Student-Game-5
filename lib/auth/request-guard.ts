/**
 * Checks for the one Route Handler that signs people in (app/api/auth/sign-in).
 * Pure, so they are unit-tested rather than trusted.
 */

/**
 * Is this exactly `application/json`?
 *
 * The sign-in route's login-CSRF defence rests on this: a cross-site page can
 * send only form-ish content types without a CORS preflight. A substring test
 * is not enough — `text/plain; charset=application/json` contains the words,
 * is still a "simple" content type, and so crosses origins with no preflight.
 * Only the MIME essence (before any `;`) counts.
 */
export function isJsonContentType(header: string | null | undefined): boolean {
  const essence = (header ?? "").split(";")[0]!.trim().toLowerCase();
  return essence === "application/json";
}

/**
 * Did the browser say this request came from another site?
 *
 * Every current browser sends Sec-Fetch-Site. Our own form posts from the same
 * origin ("same-origin"); anything else is refused. A missing header (curl, an
 * old browser) is allowed — the content-type check above still applies, and a
 * non-browser client carries no victim's cookies to abuse.
 */
export function isCrossSiteRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin";
}

/**
 * The caller's IP, for the per-IP sign-in throttle.
 *
 * Which header can be trusted depends on who sits in front of the app:
 *   - Vercel overwrites x-forwarded-for / x-vercel-forwarded-for itself, so the
 *     first entry is the real client and cannot be forged.
 *   - Anywhere else, a client can send its own x-forwarded-for; the proxy in
 *     front APPENDS the address it actually saw. So the LAST entry is the only
 *     one a client cannot choose (assuming exactly one proxy — the usual
 *     nginx / load-balancer setup). Taking the first entry there would let an
 *     attacker pick a fresh "IP" per request and never trip the IP bucket.
 */
export function clientIpFrom(headers: Headers, onVercel: boolean): string {
  if (onVercel) {
    const v = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
    const first = v?.split(",")[0]?.trim();
    if (first) return first;
  } else {
    const parts = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
