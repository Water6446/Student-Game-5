import { ArrowRight } from "@/components/icons";
import { Reveal } from "@/components/marketing/Reveal";
import { MarketsPreview } from "@/components/marketing/MarketsPreview";
import { Eyebrow, PillLink, Shell } from "@/components/marketing/primitives";
import { MARKETS_BAND } from "@/lib/marketing/content";

/**
 * The homepage's pointer to the Markets section. Its own band, after the three
 * classroom games and not folded into them: a different kind of game in a
 * different part of the site, so it sits on the blue tint the site uses for
 * navigation and closes with one way in. The page renders it only while the
 * section is switched on.
 */
export function MarketsBand() {
  return (
    <section
      id={MARKETS_BAND.id}
      aria-labelledby="markets-heading"
      className="w-full scroll-mt-20 border-b-2 border-ink bg-play-soft"
    >
      <Shell className="py-20 sm:py-24">
        <Reveal>
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="min-w-0 lg:col-span-7">
              <Eyebrow className="text-ink">{MARKETS_BAND.eyebrow}</Eyebrow>
              <Reveal variant="mask" className="mt-6">
                <h2
                  id="markets-heading"
                  className="font-display text-[clamp(2rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-tight text-ink"
                >
                  {MARKETS_BAND.heading}
                </h2>
              </Reveal>
              <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-ink-muted">{MARKETS_BAND.sub}</p>

              <ul className="mt-8 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                {MARKETS_BAND.points.map((point) => (
                  <li key={point} className="border-t border-ink/25 pt-3 text-sm leading-snug text-ink">
                    {point}
                  </li>
                ))}
              </ul>

              <PillLink
                href={MARKETS_BAND.cta.href}
                label={MARKETS_BAND.cta.label}
                icon={<ArrowRight />}
                tone="ink"
                className="mt-9"
              />
            </div>

            <div className="min-w-0 lg:col-span-5">
              <MarketsPreview />
            </div>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
