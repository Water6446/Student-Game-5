"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/marketing/primitives";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { LiveSessionStrip } from "@/components/host/LiveSessionStrip";
import { liveSession } from "@/lib/game/session-format";
import { Instructions } from "@/components/Instructions";
import { canHost } from "@/lib/auth/can-host";
import type { SessionOverviewRow } from "@/lib/game/db";

/**
 * The host dashboard.
 *
 * It wears the site header and footer, because signing in should not feel like
 * leaving the product. Inside that chrome it keeps the app's own chassis —
 * bordered cards for things you click — and borrows only the marketing page's
 * structural devices (eyebrow, hairline rule) to separate sections. DESIGN.md is
 * explicit that a page built entirely from cards "reads as a pile of boxes", and
 * that is exactly what this page was.
 */
export default function HostPage() {
  const router = useRouter();
  const { supabase, user, loading } = useSupabaseUser();

  const [rows, setRows] = useState<SessionOverviewRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);

  // Signing in happens at /login, so there is one login URL. canHost() documents
  // why these two pages cannot bounce each other forever.
  const allowed = canHost(user);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/login?next=%2Fhost");
  }, [loading, allowed, router]);

  const reload = useCallback(async () => {
    const { data } = await supabase.rpc("get_my_sessions_overview");
    setRows((data as SessionOverviewRow[]) ?? []);
    setRowsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setRowsLoading(true);
    void supabase.rpc("get_my_sessions_overview").then(({ data }) => {
      if (!active) return;
      setRows((data as SessionOverviewRow[]) ?? []);
      setRowsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase, allowed]);

  if (loading || !allowed) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">
        {loading ? "Loading…" : "Taking you to sign-in…"}
      </main>
    );
  }

  const live = liveSession(rows);

  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh">
        <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <header>
            <Eyebrow className="text-ink-muted">Host dashboard</Eyebrow>
            <h1 className="mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-tight text-ink">
              {greeting(user!.email)}
            </h1>
          </header>

          {live ? (
            <div className="mt-8">
              <LiveSessionStrip session={live} />
            </div>
          ) : null}

          <Section eyebrow="01 / Start a game" className="mt-12">
            <NewSessionPanel supabase={supabase} />
          </Section>

          <Section eyebrow="02 / Your sessions" className="mt-14">
            <SessionsList
              supabase={supabase}
              rows={rows}
              loading={rowsLoading}
              onChanged={reload}
            />
          </Section>

          <Section eyebrow="03 / Running a game" className="mt-14">
            <Instructions role="professor" />
          </Section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** A hairline rule + eyebrow above the section's own content. */
function Section({
  eyebrow,
  className,
  children,
}: {
  eyebrow: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="border-t border-ink/15 pt-5">
        <Eyebrow className="text-ink-muted">{eyebrow}</Eyebrow>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The email is the only name we are sure of before the profile loads, and a bare
 * address as a page headline is ugly. Fall back to something neutral rather than
 * guessing at a person's name.
 */
function greeting(email: string | undefined): string {
  const handle = email?.split("@")[0]?.trim();
  if (!handle) return "Your sessions";
  return `Welcome back, ${handle}`;
}
