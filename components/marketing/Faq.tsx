import { ChevronDown } from "@/components/icons";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { FAQ } from "@/lib/marketing/content";

/**
 * A ruled list, not a stack of cards. Native `<details>` so it works with JS
 * off; the chevron follows the DESIGN.md collapse pattern.
 */
export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="w-full">
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead id="faq-heading" eyebrow={FAQ.eyebrow} heading={FAQ.heading} />

          <div className="grid lg:grid-cols-12">
            <div className="lg:col-span-10 lg:col-start-2">
              {FAQ.items.map((item, i) => (
                <Reveal key={item.q} delay={Math.min(i, 5) * 70}>
                <details className="group border-b border-ink/15">
                  <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-extrabold text-ink transition hover:opacity-70 sm:text-xl">
                    {item.q}
                    <ChevronDown className="shrink-0 text-xl text-ink-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="max-w-[68ch] pb-6 leading-relaxed text-ink-muted">{item.a}</p>
                </details>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
