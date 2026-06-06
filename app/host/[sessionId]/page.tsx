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
      <main className="flex min-h-screen items-center justify-center text-slate-500">Loading…</main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Session not found</h1>
        <p className="text-slate-400">
          It may not exist, or you&apos;re not signed in as its host.
        </p>
        <Link href="/host" className="text-indigo-300 hover:text-indigo-200">
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
