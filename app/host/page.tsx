"use client";

import Link from "next/link";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { HostSignIn } from "@/components/host/HostSignIn";
import { CreateSessionForm } from "@/components/host/CreateSessionForm";
import { SessionsList } from "@/components/host/SessionsList";
import { Button, Card } from "@/components/ui";

export default function HostPage() {
  const { supabase, user, loading } = useSupabaseUser();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-500">Loading…</main>
    );
  }

  // A real (verified, non-anonymous) account is normally required to host.
  // TEMP (testing): anonymous "skip email" hosts are allowed through too. To
  // restore production behavior, change this back to `!user || isAnonymous(user)`.
  if (!user) {
    return <HostSignIn supabase={supabase} />;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Home
          </Link>
          <h1 className="mt-1 text-3xl font-bold">Host dashboard</h1>
          <p className="text-sm text-slate-500">
            {user.email ?? "Signed in for testing (no email)"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </header>

      <div className="space-y-8">
        <CreateSessionForm supabase={supabase} />

        <Card>
          <h2 className="mb-4 text-xl font-semibold">Your sessions</h2>
          <SessionsList supabase={supabase} hostId={user.id} />
        </Card>
      </div>
    </main>
  );
}
