"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { TradingSetupForm } from "@/components/markets/host/TradingSetupForm";
import { PreviewBar } from "./PreviewBar";

// Create reaches no database here: it says so where a server error would show.
// It does say both markets are loaded, so the market choice shows.
const NO_DB = {
  rpc: async (fn: string) =>
    fn === "get_market_data_options"
      ? { data: { historical: true, simulated: true }, error: null }
      : { data: null, error: { message: "Preview: nothing is created here." } },
} as unknown as SupabaseClient;

/** DEV ONLY: the setup form, without the host sign-in the real page needs. */
export function SetupPreview() {
  return (
    <>
      <PreviewBar view="setup" phase="lobby" round={1} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <TradingSetupForm supabase={NO_DB} />
      </main>
    </>
  );
}
