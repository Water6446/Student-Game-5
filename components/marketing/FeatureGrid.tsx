import { ICONS } from "@/components/marketing/icon-map";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { FEATURES } from "@/lib/marketing/content";

/**
 * One grid sharing hairline rules, not six floating cards. Cells are flat; the
 * only motion is the icon on hover.
 */
export function FeatureGrid() {
  return (
    <section aria-labelledby="features-heading" className="w-full">
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead
            id="features-heading"
            eyebrow={FEATURES.eyebrow}
            heading={FEATURES.heading}
            divider={false}
          />

          {/* Column rules come from each cell's own top border. With a column
              gap they read as a segmented editorial grid, and unlike nth-child
              side borders they cannot break at a breakpoint. */}
          <ul className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.items.map((item, i) => {
              const Icon = ICONS[item.icon];
              return (
                <li
                  key={item.label}
                  className="group border-t border-ink/15 pb-10 pt-7"
                >
                  <Reveal delay={(i % 3) * 90}>
                  <div className="flex items-start justify-between gap-4">
                    <Icon className="text-2xl text-ink transition-transform group-hover:-translate-y-0.5" />
                    <span aria-hidden="true" className="font-mono text-xs text-ink/25">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-extrabold text-ink">
                    {item.label}
                  </h3>
                  <p className="mt-2 max-w-[40ch] leading-relaxed text-ink-muted">{item.body}</p>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </Shell>
    </section>
  );
}
