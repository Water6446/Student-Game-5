"use client";

import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { HostLobby } from "@/components/host/HostLobby";
import { HostRoundControl } from "@/components/host/HostRoundControl";
import { Card } from "@/components/ui";

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

  // Finished — the full end summary + counterfactual + CSV arrive in Stage 5.
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Card className="text-center">
        <h1 className="text-2xl font-semibold">Game finished 🏁</h1>
        <p className="mt-2 text-slate-400">
          {session.config.num_rounds} rounds complete. Final standings, the all-safe / all-risky /
          50-50 counterfactual, and CSV export arrive in Stage 5.
        </p>
        <Link href="/host" className="mt-6 inline-block text-indigo-300 hover:text-indigo-200">
          ← Host dashboard
        </Link>
      </Card>
    </main>
  );
}
