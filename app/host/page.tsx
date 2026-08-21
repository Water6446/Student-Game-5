"use client";

import Link from "next/link";
import { isAnonymous, useSupabaseUser } from "@/components/use-supabase-user";
import { HostSignIn } from "@/components/host/HostSignIn";
import { NewSessionPanel } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { Instructions } from "@/components/Instructions";
import { Button, Card } from "@/components/ui";
import { ArrowLeft } from "@/components/icons";

// ON unless explicitly disabled. Still in testing — set
// NEXT_PUBLIC_ALLOW_ANON_HOST=false to turn the bypass off. See .env.example.
const ALLOW_ANON_HOST = process.env.NEXT_PUBLIC_ALLOW_ANON_HOST !== "false";

export default function HostPage() {
  const { supabase, user, loading } = useSupabaseUser();

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-subtle">Loading…</main>
    );
  }

  // Hosting requires a real, verified account — except that anonymous "skip
  // email" sessions are let through while the testing flag is on (the default).
  if (!user || (isAnonymous(user) && !ALLOW_ANON_HOST)) {
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
