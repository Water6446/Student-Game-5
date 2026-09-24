"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SignInCard } from "@/components/auth/SignInCard";
import { Banner, Skeleton } from "@/components/ui";
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
      <main className="min-h-dvh bg-paper-2">
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
              <LoginCardSkeleton />
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

  // Every method on this card creates or enters a DIFFERENT user and drops the
  // guest session, stranding whatever it played or hosted. The claim flow on
  // /account is the one that keeps the same user id, so point at it.
  const guest = !loading && Boolean(user?.is_anonymous);

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
      {guest ? (
        <div className="mb-5">
          <Banner kind="info">
            You&apos;re a guest. Signing in here starts fresh —{" "}
            <Link href="/account" className="underline underline-offset-4">
              save your guest games to an account
            </Link>{" "}
            instead.
          </Banner>
        </div>
      ) : null}

      {loading || signedIn ? (
        <LoginCardSkeleton label={signedIn ? "Signing you in" : "Loading"} />
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

/** The sign-in card's shape while the session resolves. */
function LoginCardSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="rounded-2xl border-2 border-ink/15 p-6">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-5 h-11 w-full" />
      <Skeleton className="mt-5 h-12 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-4 h-12 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
    </div>
  );
}
