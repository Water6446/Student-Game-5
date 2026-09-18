import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui";
import { AUTH_FAILURE_COPY, parseAuthFailure } from "@/lib/auth/errors";

/**
 * Where /auth/callback sends a redirect that did not end in a session.
 *
 * The copy comes from a fixed table keyed by `reason` — nothing from the URL is
 * printed, because this page is reachable through a link anyone can craft.
 */
export default function AuthError({
  searchParams,
}: {
  searchParams: { reason?: string | string[] };
}) {
  const copy = AUTH_FAILURE_COPY[parseAuthFailure(searchParams.reason)];

  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh bg-paper-2">
        <div className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
          <Card className="animate-pop-in">
            <h1 className="font-display text-2xl font-black uppercase tracking-tight text-ink">
              {copy.title}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">{copy.body}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl border-2 border-ink bg-brand px-5 py-3 font-display font-extrabold text-ink shadow-card transition hover:bg-brand-strong active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Back to sign-in
            </Link>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
