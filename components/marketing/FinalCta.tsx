import { Coins } from "@/components/icons";
import { Reveal } from "@/components/marketing/Reveal";
import { DotField, Eyebrow, PillLink, Shell, TextLink } from "@/components/marketing/primitives";
import { FINAL_CTA } from "@/lib/marketing/content";

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="relative w-full overflow-hidden bg-brand text-ink"
    >
      <DotField tone="ink" className="absolute right-0 top-0 h-40 w-1/2 opacity-25" />
      <Shell className="relative py-20 sm:py-28">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              {/* Full ink: at 11px on amber, a 70% tint drops under 4.5:1. */}
              <Eyebrow className="text-ink">{FINAL_CTA.eyebrow}</Eyebrow>
              <h2
                id="final-cta-heading"
                className="mt-6 font-display text-[clamp(2.25rem,5.5vw,4.25rem)] font-black uppercase leading-[0.92] tracking-tight"
              >
                {FINAL_CTA.headline}
              </h2>
              <p className="mt-5 max-w-[48ch] font-editorial text-lg italic leading-relaxed text-ink/85 sm:text-xl">
                {FINAL_CTA.sub}
              </p>
            </div>

            <div className="flex flex-col items-start gap-5 lg:col-span-5 lg:items-end">
              <PillLink
                href={FINAL_CTA.primary.href}
                label={FINAL_CTA.primary.label}
                icon={<Coins />}
                tone="ink"
              />
              <TextLink
                href={FINAL_CTA.secondary.href}
                label={FINAL_CTA.secondary.label}
                className="text-ink"
              />
            </div>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
