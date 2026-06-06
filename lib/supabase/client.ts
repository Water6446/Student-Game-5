"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Uses ONLY the public anon/publishable key — never the
 * service_role key. All security is enforced by RLS + host-only RPCs server
 * side, so shipping the publishable key to the browser is safe by design.
 *
 * The URL/key are trimmed and any trailing slash is stripped. A trailing slash
 * on NEXT_PUBLIC_SUPABASE_URL is a common deploy footgun: REST still works
 * (the gateway tolerates `//rest/v1/...`) but the realtime socket URL becomes
 * `wss://…//realtime/v1/websocket` and fails to connect — which looks exactly
 * like "live updates work locally but not on Vercel".
 */
function cleanEnv(value: string | undefined, name: string): string {
  const v = (value ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error(`Missing/empty environment variable: ${name}`);
  return v;
}

export function createClient() {
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
