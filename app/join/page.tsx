import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/marketing/primitives";
import { JoinForm } from "@/components/JoinForm";
import { Instructions } from "@/components/Instructions";
import { JOIN } from "@/lib/marketing/content";

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
      <SiteHeader />
      <main className="min-h-dvh">
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

          <div className="mt-8">
            <Suspense
              fallback={
                <div className="flex min-h-[18rem] items-center justify-center rounded-2xl border-2 border-dashed border-ink/30 text-ink-subtle">
                  Loading…
                </div>
              }
            >
              <JoinForm />
            </Suspense>
          </div>

          <section className="mt-14">
            <div className="border-t border-ink/15 pt-5">
              <Eyebrow className="text-ink-muted">{JOIN.howEyebrow}</Eyebrow>
            </div>
            <div className="mt-5">
              <Instructions role="student" />
            </div>
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
