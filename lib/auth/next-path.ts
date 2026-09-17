/**
 * Sanitise a post-sign-in redirect target.
 *
 * `?next=` is attacker-controllable — it travels in a link anyone can send — so
 * it must never be able to point off-site. Without this, a phishing link like
 * `/login?next=https://evil.example` would bounce a freshly authenticated user
 * straight onto someone else's page, with our domain in the referrer and the
 * user primed to trust whatever they land on.
 *
 * Only a plain, site-relative path is allowed. Absolute URLs, protocol-relative
 * URLs (the classic open redirect), backslash variants that some parsers read as
 * a slash, and anything carrying control characters all fall back.
 */
export function safeNext(raw: string | null | undefined, fallback = "/host"): string {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(v)) return fallback;
  return v;
}
