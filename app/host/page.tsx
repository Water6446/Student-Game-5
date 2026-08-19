"use client";

import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { HostSignIn } from "@/components/host/HostSignIn";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { Instructions } from "@/components/Instructions";
import { Button, Card } from "@/components/ui";
import { ArrowLeft } from "@/components/icons";

export default function HostPage() {
  const { supabase, user, loading } = useSupabaseUser();

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>
    );
  }

  // A real (verified, non-anonymous) account is normally required to host.
  // TEMP (testing): anonymous "skip email" hosts are allowed through too. To
  // restore production behavior, change this back to `!user || isAnonymous(user)`.
  if (!user) {
    return <HostSignIn supabase={supabase} />;
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
            {user.email ?? "Signed in for testing (no email)"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </header>

      <div className="space-y-8">
        <NewSessionPanel supabase={supabase} />

        <Card>
          <h2 className="mb-4 text-xl font-bold text-ink">Your sessions</h2>
          <SessionsList supabase={supabase} hostId={user.id} />
        </Card>

        <Instructions role="professor" />
      </div>
    </main>
  );
}
