import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasAuthCookie } from "@/lib/auth/auth-hint";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request and writes the rotated
 * cookies back onto the response. Required so server components see a valid
 * session and tokens don't expire mid-game.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No Supabase auth cookie means no session to refresh — getUser() below would
  // find nothing and write nothing. Skip building a client for every signed-out
  // visitor and crawler.
  if (!hasAuthCookie(request.headers.get("cookie") ?? "")) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) revalidates the token with the
  // auth server, which is what triggers the cookie refresh.
  await supabase.auth.getUser();

  return response;
}
