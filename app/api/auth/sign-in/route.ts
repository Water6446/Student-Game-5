import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { USERNAME_RE } from "@/lib/auth/validation";

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
 * username and a hash of the caller's IP.
 *
 * The response is deliberately uninformative: unknown username and wrong
 * password return exactly the same body and status, so this cannot be used to
 * discover which handles have password accounts. The resolved email address is
 * never returned.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC = { error: "Wrong username or password" } as const;

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
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
    `ip:${createHash("sha256").update(`${clientIp(request)}${secret}`).digest("hex")}`,
  ];

  const { data: allowed } = await supabase.rpc("login_gate", {
    p_buckets: buckets,
    p_secret: secret,
  });
  if (allowed !== true) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in about 15 minutes." },
      { status: 429 },
    );
  }

  const { data: email } = await supabase.rpc("email_for_username", {
    p_username: username,
    p_secret: secret,
  });

  let ok = false;
  if (typeof email === "string" && email.length > 0) {
    // GoTrue still does the password check. We only resolved the identifier.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    ok = !error;
  }

  await supabase.rpc("login_record", { p_buckets: buckets, p_ok: ok, p_secret: secret });

  if (!ok) return NextResponse.json(GENERIC, { status: 401 });

  // On success the cookie-bound server client has already written the session
  // cookies onto this response. @supabase/ssr sets them without httpOnly, so the
  // browser client picks the session up after a full navigation.
  return NextResponse.json({ ok: true });
}
