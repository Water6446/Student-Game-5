"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { usePlayers } from "@/components/use-players";
import { useRound } from "@/components/use-round";
import { useDocumentTitle } from "@/components/use-document-title";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { TradingPlay } from "@/components/markets/student/TradingPlay";
import { sessionTabTitle } from "@/lib/game/session-format";
import { isTrading } from "@/lib/game/types";

/**
 * The student's paper trading screen. Dispatches like /play/<id>: who am I,
 * am I still on the roster, then the live app for every session status.
 */
export default function TradePlayPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const { supabase, user, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  const players = usePlayers(supabase, params.sessionId);
  const round = useRound(supabase, params.sessionId, session?.current_round ?? 0);

  // Any other game type has its own screen.
  const other = session ? !isTrading(session.config) : false;
  useEffect(() => {
    if (other) router.replace(`/play/${params.sessionId}`);
  }, [other, router, params.sessionId]);

  // Which row is mine? The roster carries no auth_uid (0028), so ask once.
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

  const [seenMe, setSeenMe] = useState(false);
  useEffect(() => {
    if (me) setSeenMe(true);
  }, [me]);
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (other || authLoading || loading || myId === undefined || (session && myId && !me && !seenMe && grace)) {
    return <PageSkeleton label="Loading your game" width="max-w-md" />;
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
        primary={{ label: "Go to the join screen", href: session ? `/join?code=${session.join_code}` : "/join" }}
        secondary={[{ label: "Home", href: "/" }]}
      />
    );
  }

  return (
    <>
      <ConnectionBanner />
      <TradingPlay supabase={supabase} session={session} me={me} round={round} />
    </>
  );
}
