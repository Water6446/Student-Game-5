import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/next-path";

/**
 * Auth callback. Supabase redirects here with a PKCE `code` — for magic links,
 * email confirmation, OAuth and password resets alike. We exchange it for a
 * session (stored in cookies) and forward to `next`.
 *
 * `next` arrives in a URL anyone can craft, so it goes through safeNext(): a
 * link like /auth/callback?next=https://evil.example must not be able to hand a
 * freshly signed-in user to someone else's site.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/error`);
}
