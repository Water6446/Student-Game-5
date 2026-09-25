"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { HostDashboard } from "@/components/host/HostDashboard";
import { canHost } from "@/lib/auth/can-host";
import { SkeletonCards } from "@/components/ui";
import type { SessionOverviewRow } from "@/lib/game/db";

/**
 * The host dashboard: signs the host in, loads their sessions, and hands both
 * to HostDashboard. It wears the site header and footer, because signing in
 * should not feel like leaving the product.
 */
export default function HostPage() {
  const router = useRouter();
  const { supabase, user, loading } = useSupabaseUser();
  const { profile, loading: profileLoading } = useProfile(supabase, user?.id ?? null);

  const [rows, setRows] = useState<SessionOverviewRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  // A failed load must not read as "you have no sessions". It did: with
  // migration 0023 missing from the project, every host saw an empty list.
  const [rowsError, setRowsError] = useState<string | null>(null);

  // Signing in happens at /login, so there is one login URL. canHost() documents
  // why these two pages cannot bounce each other forever.
  const allowed = canHost(user);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/login?next=%2Fhost");
  }, [loading, allowed, router]);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_sessions_overview");
    setRows((data as SessionOverviewRow[]) ?? []);
    setRowsError(error ? error.message : null);
    setRowsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setRowsLoading(true);
    void supabase.rpc("get_my_sessions_overview").then(({ data, error }) => {
      if (!active) return;
      setRows((data as SessionOverviewRow[]) ?? []);
      setRowsError(error ? error.message : null);
      setRowsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase, allowed]);

  if (loading || !allowed) {
    return (
      <>
        <main className="min-h-dvh bg-surface">
          <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
            <SkeletonCards label={loading ? "Loading your dashboard" : "Taking you to sign-in"} />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <HostDashboard
        supabase={supabase}
        username={profile?.username}
        profileLoading={profileLoading}
        rows={rows}
        rowsLoading={rowsLoading}
        rowsError={rowsError}
        onChanged={reload}
      />
      <SiteFooter />
    </>
  );
}
