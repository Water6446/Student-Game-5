import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/marketing/primitives";
import { JoinForm, JoinResume } from "@/components/JoinForm";
import { Instructions } from "@/components/Instructions";
import { Skeleton } from "@/components/ui";
import { JOIN } from "@/lib/marketing/content";

export const metadata: Metadata = { title: "Join a game" };

/**
 * The student entry point, in the same frame as the rest of the site.
 *
 * No sign-in: joining stays a code and a name, and the anonymous auth that backs
 * it happens invisibly inside JoinForm. The chrome is here so a student who
 * arrived from the homepage — or who scanned a QR and wonders what this site is
 * — sees the same product, not a stray form on a blank page.
 *
 * Narrower than the host dashboard on purpose: this is the one surface that is
 * overwhelmingly used on a phone, held at arm's length in a lecture theatre.
 */
export default function JoinPage() {
  return (
    <>
      <main className="min-h-dvh bg-surface">
        <div className="mx-auto w-full max-w-xl px-5 py-10 sm:px-8 sm:py-14">
          <header>
            <Eyebrow className="text-ink-muted">{JOIN.eyebrow}</Eyebrow>
            <h1 className="mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-tight text-ink">
              {JOIN.heading}
            </h1>
            <p className="mt-3 font-editorial text-lg italic leading-relaxed text-ink-muted">
              {JOIN.sub}
            </p>
          </header>

          {/* Back in the same browser mid-class? Straight back to the game. */}
          <JoinResume className="mt-8" />

          <div className="mt-8">
            <Suspense
              fallback={
                <div role="status" className="border-t-[3px] border-ink/15 pt-4">
                  <span className="sr-only">Loading…</span>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="mt-6 h-16 w-full" />
                  <Skeleton className="mt-4 h-12 w-full" />
                  <Skeleton className="mt-6 h-14 w-full" />
                </div>
              }
            >
              <JoinForm />
            </Suspense>
          </div>

          {/* The card carries its own "How to play" heading; an eyebrow saying
              the same thing above it read as a stutter. */}
          <section className="mt-12">
            <Instructions role="student" />
          </section>

          <p className="mt-10 border-t border-ink/15 pt-6 text-center text-sm text-ink-muted">
            {JOIN.hostPrompt}{" "}
            <Link href="/host" className="font-semibold text-ink underline underline-offset-4">
              {JOIN.hostCta}
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
