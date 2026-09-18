"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/marketing/primitives";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { LiveSessionStrip } from "@/components/host/LiveSessionStrip";
import { liveSession } from "@/lib/game/session-format";
import { Instructions } from "@/components/Instructions";
import { canHost } from "@/lib/auth/can-host";
import { Banner } from "@/components/ui";
import { clsx } from "@/components/clsx";
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
  const { profile, loading: profileLoading } = useProfile(supabase, user?.id ?? null);

  const [rows, setRows] = useState<SessionOverviewRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  // A failed load must not read as "you have no sessions". It did: with
  // migration 0023 missing from the project, every host saw an empty list.
  const [rowsError, setRowsError] = useState<string | null>(null);

  // Signing in happens at /login, so there is one login URL. canHost() documents
  // why these two pages cannot bounce each other forever.
  const allowed = canHost(user);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/login?next=%2Fhost");
  }, [loading, allowed, router]);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_sessions_overview");
    setRows((data as SessionOverviewRow[]) ?? []);
    setRowsError(error ? error.message : null);
    setRowsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setRowsLoading(true);
    void supabase.rpc("get_my_sessions_overview").then(({ data, error }) => {
      if (!active) return;
      setRows((data as SessionOverviewRow[]) ?? []);
      setRowsError(error ? error.message : null);
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
            {/* Held invisible (same height, no reflow) until the profile is
                known, so it never reads one name and then another. */}
            <h1
              className={clsx(
                "mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-tight text-ink",
                profileLoading && "invisible",
              )}
            >
              {greeting(profile?.username)}
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
            {/* Instead of the list, not above it: the list's empty state would
                otherwise sit under the error still saying there is nothing. */}
            {rowsError ? (
              <Banner kind="error">Couldn&apos;t load your sessions: {rowsError}</Banner>
            ) : (
              <SessionsList
                supabase={supabase}
                rows={rows}
                loading={rowsLoading}
                onChanged={reload}
              />
            )}
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
 * The account's username, which is the name the person actually chose.
 *
 * Deliberately never the email: its local part is not what anyone calls
 * themselves (for a Google sign-up it is whatever sat in front of the @), and
 * using it as a stand-in while the profile loaded made the heading flash the
 * email before settling on the username. No username (a guest host) gets
 * something neutral rather than a guess at a person's name.
 */
function greeting(username: string | undefined): string {
  const name = username?.trim();
  return name ? `Welcome back, ${name}` : "Your sessions";
}
