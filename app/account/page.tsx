"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { useProfile } from "@/components/use-profile";
import { ProfilePanel } from "@/components/account/ProfilePanel";
import { IdentitiesPanel } from "@/components/account/IdentitiesPanel";
import { HistoryPanel } from "@/components/account/HistoryPanel";
import { DangerZone } from "@/components/account/DangerZone";
import { ClaimAccount } from "@/components/account/ClaimAccount";
import { Button, Card, SkeletonCards } from "@/components/ui";
import { ArrowLeft, LogOut } from "@/components/icons";
import { useToast } from "@/components/Toast";

/**
 * Account settings.
 *
 * Four states, because "signed in" is not one thing here: a guest has an auth
 * user but no account, and a guest who has just linked an identity has an
 * account but no profile row yet.
 */
export default function AccountPage() {
  const { supabase, user, loading } = useSupabaseUser();
  const { profile, loading: profileLoading, reload } = useProfile(supabase, user?.id ?? null);
  const toast = useToast();

  if (loading || (user && profileLoading)) {
    return (
      <Shell>
        <SkeletonCards label="Loading your account" />
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
            Not signed in
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Sign in to see your account, or join a game with a code — no account needed for that.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {/* Straight to /login with a way back here. Via /host it landed on
                the dashboard instead of the page they were trying to reach. */}
            <Link href="/login?next=%2Faccount">
              <Button>Sign in</Button>
            </Link>
            <Link href="/join">
              <Button variant="secondary">Join a game</Button>
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  // A guest, or a guest mid-conversion: both land in the claim flow.
  if (!profile) {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
            {user.is_anonymous ? "Save your results" : "Finish your account"}
          </h1>
          <p className="mt-1 font-editorial text-sm italic text-ink-muted">
            {user.is_anonymous
              ? "You are playing as a guest. Add a sign-in method and your past sessions stay with you."
              : "One step left."}
          </p>
          <div className="mt-6">
            <ClaimAccount supabase={supabase} user={user} onClaimed={reload} />
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/host"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft /> Host dashboard
          </Link>
          <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-ink">
            Your account
          </h1>
          <p className="font-mono text-sm text-ink-subtle">
            {profile.username}
            {user.email ? ` · ${user.email}` : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await supabase.auth.signOut();
            toast("Signed out");
          }}
        >
          <LogOut /> Sign out
        </Button>
      </header>

      <div className="space-y-6">
        <ProfilePanel supabase={supabase} profile={profile} onSaved={reload} />
        <IdentitiesPanel supabase={supabase} user={user} onChanged={reload} />
        <HistoryPanel supabase={supabase} />
        <DangerZone supabase={supabase} />
      </div>
    </Shell>
  );
}

/** Same chrome as the dashboard and the homepage — one frame across the site. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh">
        <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
