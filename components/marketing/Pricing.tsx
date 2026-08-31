import Link from "next/link";
import { Check } from "@/components/icons";
import { clsx } from "@/components/clsx";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHead, Shell } from "@/components/marketing/primitives";
import { PRICING, PRICING_INTRO, isTodo, type PricingTier } from "@/lib/marketing/content";

/**
 * PARKED — not mounted on the page. The prices are unsettled, so the section is
 * held back rather than shipped with placeholders in it. Nothing imports this
 * today; it stays here, working, until the numbers exist.
 *
 * To restore: render `<Pricing />` in `app/page.tsx` after `<WhoItsFor />`,
 * uncomment the Pricing entry in `NAV_LINKS`, and renumber the FAQ eyebrow from
 * "06 / Questions" back to "07 / Questions".
 *
 * The design: one bordered block split into three columns, rather than three
 * floating cards. The recommended tier is the dark column, so it reads as the
 * centre of the block instead of a sticker on top of it.
 */
export function Pricing() {
  return (
    <section
      id={PRICING_INTRO.id}
      aria-labelledby="pricing-heading"
      className="w-full scroll-mt-20 bg-paper-2"
    >
      <Shell className="py-20 sm:py-28">
        <Reveal>
          <SectionHead
            id="pricing-heading"
            eyebrow={PRICING_INTRO.eyebrow}
            heading={PRICING_INTRO.heading}
            sub={PRICING_INTRO.sub}
          />

          <div className="mt-10 grid overflow-hidden rounded-[1.75rem] border-2 border-ink lg:grid-cols-3">
            {PRICING.map((tier, i) => (
              <TierColumn key={tier.name} tier={tier} index={i} />
            ))}
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

function TierColumn({ tier, index }: { tier: PricingTier; index: number }) {
  const dark = tier.featured;
  return (
    // The column is the reveal wrapper, so the whole tier arrives as one object.
    <Reveal
      delay={index * 110}
      className={clsx(
        "flex flex-col border-ink p-7 sm:p-8",
        "border-b-2 last:border-b-0 lg:border-b-0 lg:border-r-2 lg:last:border-r-0",
        dark ? "order-first bg-ink text-paper-inverse lg:order-none" : "bg-surface text-ink",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          className={clsx(
            "font-display text-sm font-extrabold uppercase tracking-[0.22em]",
            dark ? "text-paper-inverse/80" : "text-ink-muted",
          )}
        >
          {tier.name}
        </h3>
        {tier.chip ? (
          <span className="rounded-full bg-brand px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
            {tier.chip}
          </span>
        ) : null}
      </div>

      <p
        className={clsx(
          "mt-6 font-mono font-black",
          // A placeholder is a sentence, not a number: it must not be set at
          // display size or it wraps into a wall.
          isTodo(tier.price)
            ? clsx("text-base leading-snug", dark ? "text-paper-inverse/70" : "text-ink-muted")
            : clsx("text-5xl", dark ? "text-paper-inverse" : "text-ink"),
        )}
      >
        {tier.price}
      </p>
      {tier.cadence ? (
        <p
          className={clsx(
            "mt-2 font-mono text-xs",
            dark ? "text-paper-inverse/60" : "text-ink-muted",
          )}
        >
          {tier.cadence}
        </p>
      ) : null}

      <p
        className={clsx(
          "mt-6 border-t pt-6 leading-relaxed",
          dark ? "border-paper-inverse/20 text-paper-inverse/80" : "border-ink/15 text-ink-muted",
        )}
      >
        {tier.audience}
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[15px]">
            <Check className={clsx("mt-1 shrink-0", dark ? "text-brand" : "text-ink")} />
            <span className={dark ? "text-paper-inverse" : "text-ink"}>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <TierCta tier={tier} />
      </div>
    </Reveal>
  );
}

const CTA_BASE =
  "flex min-h-[48px] w-full items-center justify-center rounded-full border-2 px-5 font-display text-base font-extrabold transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

function TierCta({ tier }: { tier: PricingTier }) {
  // No destination yet: show the token, do not ship a dead link.
  if (isTodo(tier.cta.href)) {
    return (
      <p
        className={clsx(
          CTA_BASE,
          "border-dashed font-mono text-sm font-semibold",
          tier.featured
            ? "border-paper-inverse/40 text-paper-inverse/70"
            : "border-ink/40 text-ink-muted",
        )}
      >
        {tier.cta.label}
      </p>
    );
  }

  if (tier.cta.href.startsWith("mailto:")) {
    return (
      <a
        href={tier.cta.href}
        className={clsx(CTA_BASE, "border-ink bg-surface text-ink hover:bg-paper-2")}
      >
        {tier.cta.label}
      </a>
    );
  }

  return (
    <Link
      href={tier.cta.href}
      className={clsx(CTA_BASE, "border-ink bg-brand text-ink shadow-card hover:bg-brand-strong")}
    >
      {tier.cta.label}
    </Link>
  );
}
