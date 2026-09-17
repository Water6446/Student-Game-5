"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SignInCard } from "@/components/auth/SignInCard";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { hasAccount } from "@/lib/auth/can-host";
import { safeNext } from "@/lib/auth/next-path";
import { LOGIN } from "@/lib/marketing/content";

/**
 * The one place you sign in. /host sends anyone who cannot host here, and the
 * header's "Log in" points here too.
 *
 * It wears the site's header and footer so arriving from the homepage does not
 * feel like leaving the site — but nothing more. Someone on this page has
 * already decided to sign in; selling them the product again, or explaining how
 * to run a game before they have an account, is just noise in the way. The
 * how-to lives on the host dashboard, where it is actually needed.
 */
export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh bg-paper-2">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center text-ink-subtle">
              Loading…
            </div>
          }
        >
          <LoginBody />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function LoginBody() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { supabase, user, loading } = useSupabaseUser();

  // Already signed in with a real account? There is nothing to do here.
  //
  // A guest (anonymous) is deliberately NOT redirected: they may well have come
  // here precisely to turn that guest session into an account. canHost() in
  // lib/auth/can-host.ts spells out why this and /host's gate cannot loop.
  const signedIn = hasAccount(user);
  useEffect(() => {
    if (!loading && signedIn) router.replace(next);
  }, [loading, signedIn, next, router]);

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
      {loading || signedIn ? (
        <div className="flex min-h-[18rem] items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 text-ink-subtle">
          {signedIn ? "Signing you in…" : "Loading…"}
        </div>
      ) : (
        <SignInCard supabase={supabase} next={next} />
      )}

      {/* Navigation, not a pitch: a student who landed here needs a way out. */}
      {signedIn ? null : (
        <p className="mt-6 text-center text-sm text-ink-muted">
          {LOGIN.joinPrompt}{" "}
          <Link href="/join" className="font-semibold text-ink underline underline-offset-4">
            {LOGIN.joinCta}
          </Link>
        </p>
      )}
    </div>
  );
}
