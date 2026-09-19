"use client";

import { useEffect, useState } from "react";
import type { SessionOverviewRow } from "@/lib/game/db";
import { liveSession } from "@/lib/game/session-format";
import { canHost } from "@/lib/auth/can-host";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { LiveSessionStrip } from "@/components/host/LiveSessionStrip";
import { StudentResumeStrip } from "@/components/StudentResumeStrip";

/**
 * The homepage, for someone who is already mid-class. A host with a session
 * running gets the same "Resume" strip as the dashboard; a student in a live
 * game gets "Rejoin". Everyone else — nearly every visitor — gets nothing, so
 * the landing page is unchanged for them.
 *
 * Loaded as an async chunk by HomeResumeSlot, like the header's account menu,
 * so the marketing page's first load still carries no Supabase client.
 */
export function HomeResume() {
  const { supabase, user, loading } = useSupabaseUser();
  const [hostLive, setHostLive] = useState<SessionOverviewRow | null>(null);

  useEffect(() => {
    if (loading || !canHost(user)) return;
    let active = true;
    supabase.rpc("get_my_sessions_overview").then(({ data }) => {
      if (active) setHostLive(liveSession((data as SessionOverviewRow[] | null) ?? []));
    });
    return () => {
      active = false;
    };
  }, [supabase, user, loading]);

  if (loading || !user) return null;

  return (
    <div className="space-y-3 px-3 pt-3 sm:px-4 sm:pt-4">
      {hostLive ? <LiveSessionStrip session={hostLive} /> : null}
      <StudentResumeStrip supabase={supabase} />
    </div>
  );
}
