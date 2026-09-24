import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/marketing/primitives";

/**
 * The frame for the Privacy and Terms pages: site chrome, a narrow reading
 * column, and a "last updated" line. Sections are plain children built from
 * `LegalSection`, so the documents stay readable as JSX.
 */
export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  /** e.g. "September 19, 2026" — change it whenever the text changes */
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <main className="min-h-dvh">
        <article className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <header>
            <Eyebrow className="text-ink-muted">{eyebrow}</Eyebrow>
            <h1 className="mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-ink-muted">
              Last updated {updated}
            </p>
            <div className="mt-6 space-y-3 text-lg leading-relaxed text-ink">{intro}</div>
          </header>
          <div className="mt-10 space-y-10">{children}</div>
          <p className="mt-14 border-t border-ink/15 pt-6 text-sm text-ink-muted">
            See also the{" "}
            <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">
              Privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-semibold text-ink underline underline-offset-4">
              Terms of use
            </Link>
            .
          </p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-muted [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
