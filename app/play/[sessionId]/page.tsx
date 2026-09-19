"use client";

import { useEffect, useState } from "react";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useDocumentTitle } from "@/components/use-document-title";
import { StudentWaiting } from "@/components/student/StudentWaiting";
import { StudentRound } from "@/components/student/StudentRound";
import { StudentFinished } from "@/components/student/StudentFinished";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { sessionTabTitle } from "@/lib/game/session-format";

export default function PlayPage({ params }: { params: { sessionId: string } }) {
  const { supabase, user, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  const players = usePlayers(supabase, params.sessionId);
  const round = useRound(supabase, params.sessionId, session?.current_round ?? 0);

  const me = user ? players.find((p) => p.auth_uid === user.id) ?? null : null;
  useDocumentTitle(session && me ? sessionTabTitle(session, "student") : null);

  // The session row usually lands before the player list, and for that moment
  // a student who HAS joined looks like one who hasn't. A member always sees at
  // least their own row, so an empty list is "still loading" — for a couple of
  // seconds, after which it really does mean not joined (RLS shows a
  // non-member nothing).
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (authLoading || loading || (session && !me && players.length === 0 && grace)) {
    return <PageSkeleton label="Loading your game" width="max-w-lg" />;
  }

  if (!session || !me) {
    return (
      <StatusPage
        eyebrow="Student"
        title="You haven't joined this game"
        body={
          session
            ? "Join with the code on the projector — it takes a name and a second."
            : "This game may have ended and been removed, or the link is incomplete."
        }
        primary={{
          label: "Go to the join screen",
          href: session ? `/join?code=${session.join_code}` : "/join",
        }}
        secondary={[{ label: "Home", href: "/" }]}
      />
    );
  }

  let screen: React.ReactNode;
  if (session.status === "lobby") {
    screen = <StudentWaiting supabase={supabase} session={session} me={me} />;
  } else if (session.status === "finished") {
    screen = <StudentFinished supabase={supabase} session={session} me={me} user={user} />;
  } else if (!round) {
    // active — wait for the current round row to load
    screen = <PageSkeleton label="Getting the round ready" width="max-w-lg" />;
  } else {
    screen = <StudentRound supabase={supabase} session={session} me={me} round={round} />;
  }

  return (
    <>
      <ConnectionBanner />
      {screen}
    </>
  );
}
