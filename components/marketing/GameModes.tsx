import { clsx } from "@/components/clsx";
import { ICONS } from "@/components/marketing/icon-map";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { GAMES } from "@/lib/marketing/content";

/**
 * The dark moment of the page. Three games as full-width rows rather than three
 * equal cards, so the Manager row can be filled amber and carry the sentence
 * that actually sells the thing to a finance professor.
 */
export function GameModes() {
  return (
    <section
      id={GAMES.id}
      aria-labelledby="games-heading"
      className="w-full scroll-mt-20 bg-ink text-paper-inverse"
    >
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead
            id="games-heading"
            eyebrow={GAMES.eyebrow}
            heading={GAMES.heading}
            sub={GAMES.sub}
            tone="inverse"
          />

          <ul>
            {GAMES.cards.map((game, i) => {
              const Icon = ICONS[game.icon];
              return (
                <li
                  key={game.name}
                  className={clsx(
                    "-mx-5 border-b px-5 py-8 sm:-mx-8 sm:px-8 sm:py-10",
                    game.featured
                      ? "border-brand bg-brand text-ink"
                      : "border-paper-inverse/15 text-paper-inverse",
                  )}
                >
                  <Reveal delay={i * 90}>
                  <div className="grid gap-x-8 gap-y-5 lg:grid-cols-12 lg:items-start">
                    <div className="flex items-center gap-4 lg:col-span-4">
                      <span
                        className={clsx(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl",
                          game.featured
                            ? "bg-ink text-brand"
                            : "bg-paper-inverse/10 text-paper-inverse",
                        )}
                      >
                        <Icon />
                      </span>
                      <div>
                        <h3 className="font-display text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl">
                          {game.name}
                        </h3>
                        <p
                          className={clsx(
                            "mt-1.5 font-editorial text-base italic",
                            game.featured ? "text-ink/80" : "text-paper-inverse/70",
                          )}
                        >
                          {game.hook}
                        </p>
                      </div>
                    </div>

                    <ul
                      className={clsx(
                        "grid gap-x-8 gap-y-2 sm:grid-cols-3 lg:col-span-8",
                        game.featured ? "text-ink" : "text-paper-inverse/85",
                      )}
                    >
                      {game.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className={clsx(
                            "border-t pt-3 text-sm leading-snug",
                            game.featured ? "border-ink/25" : "border-paper-inverse/20",
                          )}
                        >
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {game.featured ? (
                    <p className="mt-7 max-w-[62ch] font-editorial text-lg italic leading-relaxed text-ink sm:text-xl">
                      {GAMES.featuredNote}
                    </p>
                  ) : null}
                  </Reveal>

                  <span className="sr-only">{`Game ${i + 1} of ${GAMES.cards.length}`}</span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </Shell>
    </section>
  );
}
