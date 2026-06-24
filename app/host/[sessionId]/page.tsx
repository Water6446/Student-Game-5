"use client";

import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { HostLobby } from "@/components/host/HostLobby";
import { HostRoundControl } from "@/components/host/HostRoundControl";
import { HostSummary } from "@/components/host/HostSummary";

export default function HostSessionPage({ params }: { params: { sessionId: string } }) {
  const { supabase, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);

  if (authLoading || loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-black uppercase tracking-tight text-ink">Session not found</h1>
        <p className="font-editorial italic text-ink-muted">
          It may not exist, or you&apos;re not signed in as its host.
        </p>
        <Link href="/host" className="font-bold text-ink underline-offset-4 hover:underline">
          ← Back to host dashboard
        </Link>
      </main>
    );
  }

  if (session.status === "lobby") {
    return <HostLobby supabase={supabase} session={session} />;
  }

  if (session.status === "active") {
    return <HostRoundControl supabase={supabase} session={session} />;
  }

  // Finished — end summary + counterfactual + CSV export.
  return <HostSummary supabase={supabase} session={session} />;
}
