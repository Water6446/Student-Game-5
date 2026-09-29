import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    {
      // Everything except static assets (icons included) and the metadata
      // files (robots, sitemap, the share card), none of which read a session.
      source:
        "/((?!_next/static|_next/image|manifest.webmanifest|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
      // Link prefetches too. Every <Link> in view prefetches its page, and each
      // one cost a round trip to the Supabase auth server here. A prefetch
      // carries no session anywhere, and the browser client keeps its own
      // session fresh.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
