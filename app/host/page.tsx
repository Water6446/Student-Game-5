"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { Instructions } from "@/components/Instructions";
import { Button, Card } from "@/components/ui";
import { ArrowLeft, LogOut, User as UserIcon } from "@/components/icons";
import { canHost } from "@/lib/auth/can-host";

export default function HostPage() {
  const router = useRouter();
  const { supabase, user, loading } = useSupabaseUser();

  // Hosting requires a real, verified account — except that anonymous "skip
  // email" sessions are let through while the testing flag is on (the default).
  // Signing in happens at /login now, so there is one login URL rather than a
  // card that appears in two places. canHost() documents why these two pages
  // cannot bounce each other forever.
  const allowed = canHost(user);
  useEffect(() => {
    if (!loading && !allowed) router.replace("/login?next=%2Fhost");
  }, [loading, allowed, router]);

  if (loading || !allowed) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">
        {loading ? "Loading…" : "Taking you to sign-in…"}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <ArrowLeft /> Home
          </Link>
          <h1 className="mt-1 text-3xl font-black text-ink">Host dashboard</h1>
          <p className="text-sm text-ink-subtle">
            {user!.email ?? "Signed in for testing (no email)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/account">
            <Button variant="secondary">
              <UserIcon /> Account
            </Button>
          </Link>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>

      <div className="space-y-8">
        <NewSessionPanel supabase={supabase} />

        <Card>
          <h2 className="mb-4 text-xl font-bold text-ink">Your sessions</h2>
          <SessionsList supabase={supabase} hostId={user!.id} />
        </Card>

        <Instructions role="professor" />
      </div>
    </main>
  );
}
