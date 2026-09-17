"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow, Shell } from "@/components/marketing/primitives";
import { SignInCard } from "@/components/auth/SignInCard";
import { Instructions } from "@/components/Instructions";
import { useSupabaseUser } from "@/components/use-supabase-user";
import { hasAccount } from "@/lib/auth/can-host";
import { safeNext } from "@/lib/auth/next-path";
import { ArrowRight } from "@/components/icons";
import { LOGIN } from "@/lib/marketing/content";

/**
 * The one place you sign in. /host sends anyone who cannot host here, and the
 * header's "Log in" points here too.
 *
 * It wears the site's header and footer rather than floating as a bare card, so
 * arriving from the homepage does not feel like leaving the site.
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
    <Shell className="py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        {/* The card comes first on a phone: it is what the visitor came for.
            Only this column waits on the session — the panel beside it says
            nothing auth-dependent, so it paints immediately rather than putting
            the whole page behind a spinner. */}
        <div className="order-1 lg:order-2 lg:col-span-5">
          {loading || signedIn ? (
            <div className="flex min-h-[18rem] items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 text-ink-subtle">
              {signedIn ? "Signing you in…" : "Loading…"}
            </div>
          ) : (
            <SignInCard supabase={supabase} next={next} />
          )}
        </div>

        <div className="order-2 lg:order-1 lg:col-span-7">
          <Eyebrow className="text-ink-muted">{LOGIN.eyebrow}</Eyebrow>
          <h1 className="mt-6 font-display text-[clamp(2rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-tight text-ink">
            {LOGIN.heading}
          </h1>
          <p className="mt-5 max-w-xl font-editorial text-lg italic leading-relaxed text-ink-muted">
            {LOGIN.sub}
          </p>

          <ul className="mt-10 max-w-xl border-t border-ink/15">
            {LOGIN.points.map((point) => (
              <li key={point.title} className="border-b border-ink/15 py-5">
                <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-ink">
                  {point.title}
                </h3>
                <p className="mt-1.5 leading-relaxed text-ink-muted">{point.body}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 flex flex-wrap items-center gap-2 text-ink-muted">
            {LOGIN.joinPrompt}
            <Link
              href="/join"
              className="group inline-flex min-h-[44px] items-center gap-2 font-display font-extrabold text-ink underline decoration-2 underline-offset-[6px] transition hover:opacity-70"
            >
              {LOGIN.joinCta}
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                <ArrowRight />
              </span>
            </Link>
          </p>
        </div>
      </div>

      {signedIn ? null : (
        <div className="mt-14 border-t border-ink/15 pt-10">
          <div className="mx-auto max-w-2xl">
            <Instructions role="professor" />
          </div>
        </div>
      )}
    </Shell>
  );
}
