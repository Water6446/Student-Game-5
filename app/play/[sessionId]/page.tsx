"use client";

import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { StudentWaiting } from "@/components/student/StudentWaiting";
import { StudentRound } from "@/components/student/StudentRound";
import { StudentFinished } from "@/components/student/StudentFinished";

export default function PlayPage({ params }: { params: { sessionId: string } }) {
  const { supabase, user, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  const players = usePlayers(supabase, params.sessionId);
  const round = useRound(supabase, params.sessionId, session?.current_round ?? 0);

  const me = user ? players.find((p) => p.auth_uid === user.id) ?? null : null;

  if (authLoading || loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>
    );
  }

  if (!session || !me) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-ink">You haven&apos;t joined this game</h1>
        <Link
          href={session ? `/join?code=${session.join_code}` : "/join"}
          className="rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-card transition hover:bg-brand-strong active:scale-[0.98]"
        >
          Go to join screen
        </Link>
      </main>
    );
  }

  if (session.status === "lobby") {
    return <StudentWaiting supabase={supabase} session={session} me={me} />;
  }

  if (session.status === "finished") {
    return <StudentFinished supabase={supabase} session={session} me={me} />;
  }

  // active — wait for the current round row to load
  if (!round) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">
        Getting the round ready…
      </main>
    );
  }
  return <StudentRound supabase={supabase} session={session} me={me} round={round} />;
}
