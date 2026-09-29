"use client";

import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { useDocumentTitle } from "@/components/use-document-title";
import { HostLobby } from "@/components/host/HostLobby";
import { lazyModule, useLazyModule } from "@/components/use-lazy-module";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { sessionTabTitle } from "@/lib/game/session-format";

// A new session opens on its lobby, so only that screen ships with the page. The
// round controls and the summary download in the background from the moment the
// page mounts, ready before the host presses Start (or Finish).
const ROUND_SCREEN = lazyModule(() => import("@/components/host/HostRoundControl"));
const SUMMARY_SCREEN = lazyModule(() => import("@/components/host/HostSummary"));

export default function HostSessionPage({ params }: { params: { sessionId: string } }) {
  const { supabase, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  const roundScreen = useLazyModule(ROUND_SCREEN);
  const summaryScreen = useLazyModule(SUMMARY_SCREEN);
  useDocumentTitle(session ? sessionTabTitle(session, "host") : null);

  if (
    authLoading ||
    loading ||
    (session?.status === "active" && !roundScreen) ||
    (session?.status === "finished" && !summaryScreen)
  ) {
    return <PageSkeleton label="Loading session" width="max-w-5xl" />;
  }

  if (!session) {
    return (
      <StatusPage
        eyebrow="Session"
        title="Session not found"
        body="It may have been deleted, or you're not signed in as its host."
        primary={{ label: "Back to host dashboard", href: "/host" }}
        secondary={[{ label: "Log in", href: `/login?next=${encodeURIComponent(`/host/${params.sessionId}`)}` }]}
      />
    );
  }

  return (
    <>
      <ConnectionBanner />
      {session.status === "lobby" ? (
        <HostLobby supabase={supabase} session={session} />
      ) : session.status === "active" && roundScreen ? (
        <roundScreen.HostRoundControl supabase={supabase} session={session} />
      ) : summaryScreen ? (
        // Finished — end summary + counterfactual + CSV export.
        <summaryScreen.HostSummary supabase={supabase} session={session} />
      ) : null}
    </>
  );
}
