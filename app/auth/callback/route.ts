import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/next-path";
import { authFailure } from "@/lib/auth/errors";

/**
 * Auth callback. Supabase redirects here with a PKCE `code` — for magic links,
 * email confirmation, OAuth, identity linking and password resets alike. We
 * exchange it for a session (stored in cookies) and forward to `next`.
 *
 * `next` arrives in a URL anyone can craft, so it goes through safeNext(): a
 * link like /auth/callback?next=https://evil.example must not be able to hand a
 * freshly signed-in user to someone else's site.
 *
 * When something goes wrong, Supabase sends `error` / `error_code` instead of a
 * code (a cancelled Google consent, a Google account already linked elsewhere,
 * an expired link). Those are reduced to a fixed reason for /auth/error, so the
 * person is told what actually happened rather than "your link expired".
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  let failureCode = searchParams.get("error_code") ?? searchParams.get("error");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    failureCode = error.code ?? failureCode;
  }

  const reason = authFailure(failureCode);
  return NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);
}
