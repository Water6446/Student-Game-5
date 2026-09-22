import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { USERNAME_RE } from "@/lib/auth/validation";
import { isRateLimited, signInErrorMessage } from "@/lib/auth/errors";
import { clientIpFrom, isCrossSiteRequest, isJsonContentType } from "@/lib/auth/request-guard";

/**
 * Username sign-in.
 *
 * Only USERNAME logins come through here. An email login is done straight from
 * the browser against Supabase, on purpose: that keeps GoTrue seeing the real
 * client IP for its own rate limiting. A username cannot work that way — it has
 * to be resolved to an email first, and the secret that authorises that lookup
 * must never reach browser code (see supabase/migrations/0021_username_login.sql
 * for why the lookup is gated at all).
 *
 * Because this path is proxied, Supabase sees the Vercel egress IP for every
 * request, so it carries its own throttle (0022) keyed on both the targeted
 * username and a hash of the caller's IP. Each attempt is booked BEFORE the
 * password is checked (login_begin, 0027) and settled after (login_finish), so
 * a burst of simultaneous guesses cannot all slip past the count.
 *
 * The response is deliberately uninformative: unknown username and wrong
 * password return exactly the same body and status, so this cannot be used to
 * discover which handles have password accounts. The resolved email address is
 * never returned.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC = { error: "Wrong username or password" } as const;

const MISCONFIGURED = {
  error: "Username sign-in is not set up correctly. Sign in with your email address instead.",
} as const;

export async function POST(request: Request) {
  // Login CSRF: a hostile page can auto-submit an HTML form here with a
  // text/plain body shaped like JSON, and the response would sign the victim's
  // browser into the ATTACKER's account (a form post is a top-level navigation,
  // so SameSite=Lax does not stop the cookies being set). A cross-site request
  // cannot carry application/json without a CORS preflight, which this route
  // never answers — so the content type must be EXACTLY that (a substring test
  // let `text/plain; charset=application/json` through), and a browser that
  // says the request came from another site is refused outright.
  // Checked first, so it holds however the rest of the route is configured.
  if (isCrossSiteRequest(request.headers)) {
    return NextResponse.json(GENERIC, { status: 403 });
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return NextResponse.json(GENERIC, { status: 415 });
  }

  const secret = process.env.USERNAME_LOOKUP_SECRET;
  if (!secret) {
    // Fails closed and says so plainly — this is a deploy-configuration gap,
    // not a credential problem, and pretending otherwise just confuses people.
    return NextResponse.json(
      { error: "Username sign-in is not set up. Sign in with your email address instead." },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(GENERIC, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!USERNAME_RE.test(username) || !password) {
    return NextResponse.json(GENERIC, { status: 401 });
  }

  const supabase = createClient();
  const buckets = [
    `u:${username.toLowerCase()}`,
    // Hashed with the server secret so the table holds no IP addresses.
    `ip:${createHash("sha256")
      .update(`${clientIpFrom(request.headers, Boolean(process.env.VERCEL))}${secret}`)
      .digest("hex")}`,
  ];

  // Books this attempt as a failure up front and says whether it may go ahead,
  // in one step — see 0027 for why the count cannot wait for the answer.
  const { data: allowed, error: gateError } = await supabase.rpc("login_begin", {
    p_buckets: buckets,
    p_secret: secret,
  });
  // login_begin answers NULL when the secret here does not match the one
  // stored in app_secrets, and an error when the migrations are missing. Both
  // are deploy problems; reporting them as "too many attempts" sent people to
  // wait out a lockout that did not exist.
  if (gateError || allowed === null || allowed === undefined) {
    console.error(
      "username sign-in misconfigured: USERNAME_LOOKUP_SECRET does not match app_secrets.username_lookup, or migrations 0021/0022/0024/0027 are not applied",
      gateError?.message ?? "",
    );
    return NextResponse.json(MISCONFIGURED, { status: 503 });
  }
  if (allowed !== true) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in about 15 minutes." },
      { status: 429 },
    );
  }

  const finish = (outcome: "ok" | "wrong" | "refund") =>
    supabase.rpc("login_finish", { p_buckets: buckets, p_outcome: outcome, p_secret: secret });

  const { data: email, error: lookupError } = await supabase.rpc("email_for_username", {
    p_username: username,
    p_secret: secret,
  });
  if (lookupError) {
    // The database failed, not the person: hand the attempt back.
    await finish("refund");
    return NextResponse.json(
      { error: "Sign-in is not responding right now. Try again in a moment." },
      { status: 503 },
    );
  }

  // "wrong" is the only outcome that stays booked as a failed guess. An outage
  // or GoTrue's own rate limit says nothing about the password, so it must not
  // count towards locking the username out.
  let outcome: "ok" | "wrong" | { status: number; error: string; passwordWasRight: boolean } =
    "wrong";
  if (typeof email === "string" && email.length > 0) {
    // GoTrue still does the password check. We only resolved the identifier.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      outcome = "ok";
    } else {
      const shown = signInErrorMessage(error, GENERIC.error);
      if (shown !== GENERIC.error) {
        const passwordWasRight = error.code === "email_not_confirmed";
        outcome = {
          status: passwordWasRight ? 403 : isRateLimited(error) ? 429 : 503,
          error: shown,
          passwordWasRight,
        };
      }
    }
  }

  // The attempt was booked as a failure by login_begin. A right password (even
  // one whose email is unconfirmed) forgives it; an outage refunds it.
  if (outcome === "ok" || (outcome !== "wrong" && outcome.passwordWasRight)) {
    await finish("ok");
  } else if (outcome !== "wrong") {
    await finish("refund");
  }

  if (outcome === "wrong") return NextResponse.json(GENERIC, { status: 401 });
  if (outcome !== "ok") {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  // On success the cookie-bound server client has already written the session
  // cookies onto this response. @supabase/ssr sets them without httpOnly, so the
  // browser client picks the session up after a full navigation.
  return NextResponse.json({ ok: true });
}
