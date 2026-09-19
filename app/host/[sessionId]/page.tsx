"use client";

import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { useDocumentTitle } from "@/components/use-document-title";
import { HostLobby } from "@/components/host/HostLobby";
import { HostRoundControl } from "@/components/host/HostRoundControl";
import { HostSummary } from "@/components/host/HostSummary";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { sessionTabTitle } from "@/lib/game/session-format";

export default function HostSessionPage({ params }: { params: { sessionId: string } }) {
  const { supabase, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  useDocumentTitle(session ? sessionTabTitle(session, "host") : null);

  if (authLoading || loading) {
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
      ) : session.status === "active" ? (
        <HostRoundControl supabase={supabase} session={session} />
      ) : (
        // Finished — end summary + counterfactual + CSV export.
        <HostSummary supabase={supabase} session={session} />
      )}
    </>
  );
}
