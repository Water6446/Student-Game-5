import { ArrowUp, Lock, Users } from "@/components/icons";
import { Reveal } from "@/components/marketing/Reveal";
import { Eyebrow, SectionHead, Shell } from "@/components/marketing/primitives";
import { BOTH_SIDES } from "@/lib/marketing/content";

/**
 * The two screens, side by side on a tinted field. Both halves are static props
 * built from the real present-mode and host-control classes, so nothing here
 * claims a screen the app does not have. TODO(max) screenshot: swap either half
 * for a real capture (ink-bordered, never floated on a gradient).
 */
export function BothSides() {
  return (
    <section aria-labelledby="both-sides-heading" className="w-full bg-paper-2">
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead
            id="both-sides-heading"
            eyebrow={BOTH_SIDES.eyebrow}
            heading={BOTH_SIDES.heading}
          />

          <div className="grid lg:grid-cols-2">
            <Reveal className="py-10 lg:pr-12">
              <Eyebrow className="text-ink-muted">{BOTH_SIDES.class.title}</Eyebrow>
              <p className="mt-3 font-editorial text-lg italic text-ink-muted">
                {BOTH_SIDES.class.caption}
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border-2 border-ink bg-ink px-4 py-8 text-center text-paper-inverse">
                  <p className="font-display text-xs font-extrabold uppercase tracking-[0.28em] text-paper-inverse/70">
                    {BOTH_SIDES.class.codeLabel}
                  </p>
                  <p className="mt-2 font-mono text-5xl font-black tracking-[0.3em] text-paper-inverse sm:text-6xl">
                    {BOTH_SIDES.class.code}
                  </p>
                  <p className="mt-4 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-paper-inverse/70">
                    <Users className="text-sm" />
                    {BOTH_SIDES.class.joined}
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-ink bg-gain px-4 py-6 text-center text-white">
                  <p className="font-display text-xs font-extrabold uppercase tracking-[0.3em] text-white">
                    {BOTH_SIDES.class.bannerRound}
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-3 font-display text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl">
                    <ArrowUp />
                    {BOTH_SIDES.class.bannerHeadline}
                  </p>
                  <p className="mt-2 font-editorial text-lg italic text-white">
                    {BOTH_SIDES.class.bannerNote}
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal
              delay={140}
              className="border-t border-ink/15 py-10 lg:border-l lg:border-t-0 lg:pl-12"
            >
              <Eyebrow className="text-ink-muted">{BOTH_SIDES.host.title}</Eyebrow>
              <p className="mt-3 font-editorial text-lg italic text-ink-muted">
                {BOTH_SIDES.host.caption}
              </p>

              <div className="mt-6 space-y-5 rounded-2xl border-2 border-ink bg-surface p-5 sm:p-6">
                <p className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-play px-5 py-3 font-display text-lg font-extrabold text-white shadow-card">
                  <Lock />
                  {BOTH_SIDES.host.action}
                </p>
                <p className="text-center">
                  <span className="font-mono text-5xl font-black text-gain sm:text-6xl">
                    {BOTH_SIDES.host.submitted}
                    <span className="text-line-strong"> / {BOTH_SIDES.host.total}</span>
                  </span>
                  <span className="mt-1 block text-sm font-medium text-ink-muted">
                    {BOTH_SIDES.host.submittedLabel}
                  </span>
                </p>
                <div>
                  <h3 className="mb-2 font-display text-lg font-bold text-ink">
                    {BOTH_SIDES.host.standingsLabel}
                  </h3>
                  <ul className="space-y-1">
                    {BOTH_SIDES.host.rows.map((row) => (
                      <li
                        key={row.rank}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-paper-2 px-4 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-ink">
                          <span className="mr-2 font-mono text-ink-subtle">{row.rank}</span>
                          {row.name}
                        </span>
                        <span className="font-mono text-xl font-bold text-gain">{row.wealth}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
