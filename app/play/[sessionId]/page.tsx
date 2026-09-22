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

  // Which row is mine? The list carries no auth_uid (0028), so ask the server
  // once. undefined = still asking; null = not a player here.
  const [myId, setMyId] = useState<string | null | undefined>(undefined);
  const uid = user?.id ?? null;
  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      setMyId(null);
      return;
    }
    let active = true;
    supabase.rpc("get_my_player_id", { p_session_id: params.sessionId }).then(({ data }) => {
      if (active) setMyId((data as string | null) ?? null);
    });
    return () => {
      active = false;
    };
  }, [supabase, uid, authLoading, params.sessionId]);

  const me = myId ? players.find((p) => p.id === myId) ?? null : null;
  useDocumentTitle(session && me ? sessionTabTitle(session, "student") : null);

  // Once my row has been on screen, losing it means the host removed me.
  const [seenMe, setSeenMe] = useState(false);
  useEffect(() => {
    if (me) setSeenMe(true);
  }, [me]);

  // My id usually lands before my row does, and for that moment a student who
  // HAS joined looks like one who hasn't. So a known id with no row yet is
  // "still loading" — for a couple of seconds, after which it really does mean
  // the row is not there.
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (
    authLoading ||
    loading ||
    myId === undefined ||
    (session && myId && !me && !seenMe && grace)
  ) {
    return <PageSkeleton label="Loading your game" width="max-w-lg" />;
  }

  if (session && seenMe && !me) {
    return (
      <StatusPage
        eyebrow="Student"
        title="You were removed from this game"
        body="The host took you off the roster. If that's a mistake, ask them."
        primary={{ label: "Home", href: "/" }}
      />
    );
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
