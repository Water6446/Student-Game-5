"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useSession } from "@/components/use-session";
import { useDocumentTitle } from "@/components/use-document-title";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { StatusPage } from "@/components/StatusPage";
import { PageSkeleton } from "@/components/ui";
import { sessionTabTitle } from "@/lib/game/session-format";
import { isTrading } from "@/lib/game/types";
import { tradeHostPath } from "@/lib/markets/routes";
import { useTradingHost } from "@/components/markets/host/use-trading-host";
import { TradingHostScreen } from "@/components/markets/host/TradingHostScreen";

export default function TradingHostPage({ params }: { params: { sessionId: string } }) {
  const { supabase, user, loading: authLoading } = useSupabaseUser();
  const { session, loading } = useSession(supabase, params.sessionId);
  useDocumentTitle(session ? sessionTabTitle(session, "host") : null);

  if (authLoading || loading) return <PageSkeleton label="Loading session" width="max-w-5xl" />;
  // RLS shows a session to its players too; the host screens are for its host
  // (whose RPCs would refuse anyone else anyway).
  if (!session || !isTrading(session.config) || session.host_id !== user?.id) {
    return (
      <StatusPage
        eyebrow="Session"
        title="Session not found"
        body="It may have been deleted, or you're not signed in as its host."
        primary={{ label: "Back to host dashboard", href: "/host" }}
        secondary={[{ label: "Log in", href: `/login?next=${encodeURIComponent(tradeHostPath(params.sessionId))}` }]}
      />
    );
  }
  return (
    <>
      <ConnectionBanner />
      <LiveHost supabase={supabase} session={session} />
    </>
  );
}

function LiveHost({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  const { model, actions } = useTradingHost(supabase, session);
  return <TradingHostScreen model={model} actions={actions} />;
}
