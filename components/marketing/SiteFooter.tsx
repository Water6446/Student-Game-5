import Link from "next/link";
import { Coins } from "@/components/icons";
import { Eyebrow, Shell } from "@/components/marketing/primitives";
import { FOOTER, SITE, isTodo } from "@/lib/marketing/content";

const LINK_CLASS =
  "inline-flex min-h-[44px] items-center text-sm font-semibold text-paper-inverse/75 transition hover:text-paper-inverse";

export function SiteFooter() {
  return (
    <footer className="w-full bg-ink text-paper-inverse">
      <Shell className="py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-ink">
                <Coins className="text-[0.95em]" />
              </span>
              <span className="font-display text-lg font-black uppercase tracking-[-0.01em] text-paper-inverse">
                {SITE.name}
                <span className="text-brand">.</span>
              </span>
            </div>
            <p className="mt-5 max-w-sm leading-relaxed text-paper-inverse/75">{FOOTER.blurb}</p>
          </div>

          <nav aria-label="Footer" className="lg:col-span-3">
            <Eyebrow className="text-paper-inverse/60">{FOOTER.exploreTitle}</Eyebrow>
            <ul className="mt-4">
              {FOOTER.exploreLinks.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("#") ? (
                    <a href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className={LINK_CLASS}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-4">
            <Eyebrow className="text-paper-inverse/60">{FOOTER.contactTitle}</Eyebrow>
            <ul className="mt-4">
              <li>
                <a href={`mailto:${FOOTER.email}`} className={LINK_CLASS}>
                  {FOOTER.email}
                </a>
              </li>
              {/* Source stays a plain string until there is a real URL to link. */}
              <li>
                {isTodo(FOOTER.repoUrl) ? (
                  <span className="inline-flex min-h-[44px] items-center font-mono text-xs text-paper-inverse/60">
                    {FOOTER.repoUrl}
                  </span>
                ) : (
                  <a href={FOOTER.repoUrl} className={LINK_CLASS}>
                    Source
                  </a>
                )}
              </li>
              <li>
                <a href={FOOTER.personalSiteUrl} className={LINK_CLASS}>
                  max-jansen.com
                </a>
              </li>
              <li className="inline-flex min-h-[44px] items-center font-mono text-xs uppercase tracking-[0.2em] text-paper-inverse/60">
                {FOOTER.location}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-paper-inverse/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-paper-inverse/60">{FOOTER.copyright}</p>
          <p className="font-mono text-xs text-paper-inverse/60">{FOOTER.builtWith}</p>
        </div>
      </Shell>
    </footer>
  );
}
