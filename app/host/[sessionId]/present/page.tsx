"use client";

import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { useDocumentTitle } from "@/components/use-document-title";
import { HostPresent } from "@/components/host/HostPresent";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";

export default function HostPresentPage({ params }: { params: { sessionId: string } }) {
  const { supabase, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  // "Projector" first: it is the word that tells this tab from the control tab.
  useDocumentTitle(session ? `Projector · ${session.join_code}` : null);

  if (authLoading || loading) {
    return <PageSkeleton label="Loading projector view" width="max-w-6xl" />;
  }

  if (!session) {
    return (
      <StatusPage
        eyebrow="Projector"
        title="Session not found"
        body="It may have been deleted, or you're not signed in as its host."
        primary={{ label: "Back to host dashboard", href: "/host" }}
      />
    );
  }

  return (
    <>
      <ConnectionBanner />
      <HostPresent supabase={supabase} session={session} />
    </>
  );
}
