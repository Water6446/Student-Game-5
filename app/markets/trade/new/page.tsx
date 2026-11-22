"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { canHost } from "@/lib/auth/can-host";
import { SkeletonCards } from "@/components/ui";
import { ArrowLeft } from "@/components/icons";
import { TradingSetupForm } from "@/components/markets/host/TradingSetupForm";
import { TRADE_NEW } from "@/lib/markets/routes";

// Hosts only, like /host: anyone else goes to log in and comes back here.
export default function NewTradingSessionPage() {
  const router = useRouter();
  const { supabase, user, loading } = useSupabaseUser();
  const allowed = canHost(user);
  useEffect(() => {
    if (!loading && !allowed) router.replace(`/login?next=${encodeURIComponent(TRADE_NEW)}`);
  }, [loading, allowed, router]);

  return (
    <main className="min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {loading || !allowed ? (
          <SkeletonCards label="Loading" />
        ) : (
          <>
            <Link
              href="/host"
              className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft /> Dashboard
            </Link>
            <p className="mt-2 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">Markets</p>
            <h1 className="mt-1 font-display text-4xl font-black uppercase leading-[.92] tracking-tight text-ink sm:text-5xl">
              Paper trading
            </h1>
            <div className="mt-6">
              <TradingSetupForm supabase={supabase} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
