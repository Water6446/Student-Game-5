import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { AUDIENCES } from "@/lib/marketing/content";

export function WhoItsFor() {
  return (
    <section aria-labelledby="audiences-heading" className="w-full">
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead
            id="audiences-heading"
            eyebrow={AUDIENCES.eyebrow}
            heading={AUDIENCES.heading}
            divider={false}
          />

          <div className="grid gap-x-10 sm:grid-cols-3">
            {AUDIENCES.columns.map((column, i) => (
              <Reveal
                key={column.title}
                delay={i * 100}
                className="border-t border-ink/15 pb-8 pt-7"
              >
                <span aria-hidden="true" className="font-mono text-xs text-ink/30">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 font-display text-lg font-extrabold leading-snug text-ink">
                  {column.title}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-muted">{column.body}</p>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
