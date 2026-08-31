import { Download } from "@/components/icons";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { HOW_IT_WORKS } from "@/lib/marketing/content";

/**
 * A process line, not three cards: numbered nodes sitting on a single rule that
 * runs the width of the section, the way the reference sets out its services.
 */
export function HowItWorks() {
  return (
    <section id={HOW_IT_WORKS.id} aria-labelledby="how-heading" className="w-full scroll-mt-20">
      <Shell className="py-20 sm:py-28">
        <SectionHead
          id="how-heading"
          eyebrow={HOW_IT_WORKS.eyebrow}
          heading={HOW_IT_WORKS.heading}
          divider={false}
        />

        <Reveal>
          <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
            {/* The rule the nodes sit on. Hidden on phones, where the steps
                stack and the line would run through empty space. */}
            <span
              aria-hidden="true"
              className="absolute left-0 right-0 top-6 hidden h-px bg-ink/20 sm:block"
            />

            {HOW_IT_WORKS.steps.map((step, i) => (
              <li key={step.n} className="relative sm:pr-8">
                <Reveal delay={i * 110}>
                <span
                  aria-hidden="true"
                  className="relative flex h-12 w-12 items-center justify-center rounded-full border border-ink bg-paper font-mono text-sm font-black text-ink"
                >
                  {step.n.padStart(2, "0")}
                </span>
                <h3 className="mt-6 font-display text-xl font-extrabold leading-tight text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[38ch] leading-relaxed text-ink-muted">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>

          {/* Dashed frame, borrowed from the reference's coupon block: clearly
              secondary to the three steps above it. */}
          <p className="mt-14 flex items-start gap-4 rounded-2xl border border-dashed border-ink/40 p-6">
            <Download className="mt-0.5 shrink-0 text-xl text-ink" />
            <span className="font-editorial text-lg italic leading-relaxed text-ink">
              {HOW_IT_WORKS.strip}
            </span>
          </p>
        </Reveal>
      </Shell>
    </section>
  );
}
