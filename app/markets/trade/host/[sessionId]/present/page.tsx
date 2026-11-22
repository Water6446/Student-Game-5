"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { useDocumentTitle } from "@/components/use-document-title";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { isTrading } from "@/lib/game/types";
import { useTradingHost } from "@/components/markets/host/use-trading-host";
import { TradingPresent } from "@/components/markets/host/TradingPresent";

export default function TradingPresentPage({ params }: { params: { sessionId: string } }) {
  const { supabase, user, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  // "Projector" first: it is the word that tells this tab from the control tab.
  useDocumentTitle(session ? `Projector · ${session.join_code}` : null);

  if (authLoading || loading) return <PageSkeleton label="Loading projector view" width="max-w-6xl" />;
  if (!session || !isTrading(session.config) || session.host_id !== user?.id) {
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
      <LivePresent supabase={supabase} session={session} />
    </>
  );
}

function LivePresent({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const { model, actions } = useTradingHost(supabase, session);
  return <TradingPresent model={model} actions={actions} />;
}
