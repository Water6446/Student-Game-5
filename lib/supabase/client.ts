"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses ONLY the public anon key — never the
 * service_role key. All security is enforced by RLS + host-only RPCs server
 * side, so shipping the anon key to the browser is safe by design.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
