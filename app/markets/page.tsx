import type { Metadata } from "next";
import { ArrowRight } from "@/components/icons";
import { ICONS } from "@/components/marketing/icon-map";
import { Reveal } from "@/components/marketing/Reveal";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow, PillLink, Shell, TextLink } from "@/components/marketing/primitives";
import { MarketsPreview } from "@/components/marketing/MarketsPreview";
import { MARKETS_PAGE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Markets",
  description: MARKETS_PAGE.sub,
};

/**
 * The Markets hub: the section's landing page, listing its games (one today).
 * Built like the homepage, on the editorial grid with the arcade weight kept
 * for the game card and its illustration; no italics, as on every marketing
 * page. The whole section 404s unless it is switched on (app/markets/layout.tsx).
 */
export default function MarketsHub() {
  return (
    <>
      <main className="min-h-dvh">
        <Shell className="py-12 sm:py-16">
          <header className="border-b border-ink/15 pb-8">
            <Eyebrow className="text-ink-muted">{MARKETS_PAGE.eyebrow}</Eyebrow>
            <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-end">
              <h1 className="font-display text-[clamp(2.1rem,5vw,3.8rem)] font-black uppercase leading-[0.95] tracking-tight text-ink lg:col-span-7">
                {MARKETS_PAGE.heading}
              </h1>
              <p className="text-lg leading-relaxed text-ink-muted lg:col-span-5">{MARKETS_PAGE.sub}</p>
            </div>
          </header>

          <ul className="mt-10 space-y-8">
            {MARKETS_PAGE.games.map((game) => {
              const Icon = ICONS[game.icon];
              return (
                <li key={game.name}>
                  <Reveal>
                    <article
                      aria-labelledby={`game-${game.icon}`}
                      className="grid gap-8 rounded-2xl border-2 border-ink bg-surface p-5 shadow-lift sm:p-8 lg:grid-cols-12 lg:items-center"
                    >
                      <div className="min-w-0 lg:col-span-7">
                        <div className="flex items-center gap-4">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-brand text-xl text-ink">
                            <Icon aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <h2
                              id={`game-${game.icon}`}
                              className="font-display text-2xl font-black uppercase leading-none tracking-tight text-ink sm:text-3xl"
                            >
                              {game.name}
                            </h2>
                            <p className="mt-1.5 text-base text-ink-muted">{game.hook}</p>
                          </div>
                        </div>

                        <ul className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                          {game.bullets.map((b) => (
                            <li key={b} className="border-t border-ink/20 pt-3 text-sm leading-snug text-ink">
                              {b}
                            </li>
                          ))}
                        </ul>

                        <p className="mt-6 max-w-[60ch] text-base leading-relaxed text-ink-muted">{game.body}</p>

                        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                          <PillLink
                            href={game.hostCta.href}
                            label={game.hostCta.label}
                            icon={<ArrowRight />}
                            tone="brand"
                          />
                          <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                            {MARKETS_PAGE.joinPrompt}
                            <TextLink
                              href={MARKETS_PAGE.joinCta.href}
                              label={MARKETS_PAGE.joinCta.label}
                              className="text-sm text-ink"
                            />
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0 lg:col-span-5">
                        <MarketsPreview />
                      </div>
                    </article>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </Shell>
      </main>
      <SiteFooter />
    </>
  );
}
