import Link from "next/link";
import type { ReactNode } from "react";
import { clsx } from "@/components/clsx";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * The marketing chassis. The app itself is built from bordered, shadowed cards;
 * a landing page made of the same cards reads as a pile of boxes. So this page
 * is built on an editorial grid instead: hairline rules, wide margins, big type,
 * and the heavy ink treatment reserved for two things only — the CTAs and the
 * product props, where the arcade look is the actual product.
 */

/** Aligns to the same measure everywhere: 72rem with a 20/32px gutter. */
export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>
  );
}

/** Mono label with a leading rule. Sets the editorial register for a section. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.28em]",
        className,
      )}
    >
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-40" />
      {children}
    </span>
  );
}

/**
 * Section opener: eyebrow, headline, optional editorial line, closing hairline.
 * `tone="inverse"` for the ink band.
 */
export function SectionHead({
  id,
  eyebrow,
  heading,
  sub,
  tone = "default",
  /** Set false when the section's own content supplies the closing rule. */
  divider = true,
  className,
}: {
  id: string;
  eyebrow: string;
  heading: string;
  sub?: string;
  tone?: "default" | "inverse";
  divider?: boolean;
  className?: string;
}) {
  const inverse = tone === "inverse";
  return (
    <div
      className={clsx(
        "pb-8",
        divider && (inverse ? "border-b border-paper-inverse/20" : "border-b border-ink/15"),
        className,
      )}
    >
      <Eyebrow className={inverse ? "text-paper-inverse/70" : "text-ink-muted"}>{eyebrow}</Eyebrow>
      <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-end">
        {/* Every section heading arrives the way the hero does: clipped, then
            slid up from behind its own edge. */}
        <Reveal variant="mask" className="lg:col-span-7">
          <h2
            id={id}
            className={clsx(
              "font-display text-[clamp(2rem,4.4vw,3.4rem)] font-black uppercase leading-[0.95] tracking-tight",
              inverse ? "text-paper-inverse" : "text-ink",
            )}
          >
            {heading}
          </h2>
        </Reveal>
        {sub ? (
          <p
            className={clsx(
              "font-editorial text-lg italic leading-relaxed lg:col-span-5",
              inverse ? "text-paper-inverse/80" : "text-ink-muted",
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const PILL_BASE =
  "group inline-flex items-center gap-3 rounded-full border-2 py-2 pl-2 pr-6 font-display font-extrabold transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const PILL_TONE = {
  ink: "border-ink bg-ink text-paper shadow-pop hover:bg-ink/90",
  brand: "border-ink bg-brand text-ink shadow-pop hover:bg-brand-strong",
  outline: "border-ink bg-surface text-ink shadow-card hover:bg-paper-2",
  // On a dark stage: cream fill, ink badge. The border matches the fill so the
  // pill reads as one solid object against the image.
  cream: "border-paper-inverse bg-paper-inverse text-ink hover:bg-paper-inverse/90",
} as const;

const BADGE_TONE = {
  ink: "bg-brand text-ink",
  brand: "bg-ink text-paper",
  outline: "bg-brand text-ink",
  cream: "bg-ink text-paper",
} as const;

/**
 * The page's signature control: a pill with a filled circular icon badge on the
 * left. One shape for every call to action, so the CTA is recognisable before
 * it is read.
 */
export function PillLink({
  href,
  label,
  icon,
  tone = "ink",
  className,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  tone?: keyof typeof PILL_TONE;
  className?: string;
}) {
  return (
    <Link href={href} className={clsx(PILL_BASE, PILL_TONE[tone], className)}>
      <span
        aria-hidden="true"
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-full text-lg",
          BADGE_TONE[tone],
        )}
      >
        {icon}
      </span>
      <span className="text-base">{label}</span>
    </Link>
  );
}

/** Quiet secondary action: underlined label with a nudging arrow. */
export function TextLink({
  href,
  label,
  icon,
  className,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "group inline-flex min-h-[44px] items-center gap-2 font-display text-base font-extrabold underline decoration-2 underline-offset-[6px] transition hover:opacity-70",
        className,
      )}
    >
      {label}
      {icon ? (
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
          {icon}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Dotted corner texture. Same SVG-tile technique as the body grid in
 * `globals.css`, at a tighter pitch, so the accent belongs to the page it sits
 * on. `ink` for paper sections, `cream` for the ink panels.
 */
const DOT_TILE = {
  ink: "%23211a12",
  cream: "%23f6efdd",
} as const;

export function DotField({
  tone = "ink",
  className,
}: {
  tone?: keyof typeof DOT_TILE;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx("pointer-events-none block", className)}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Ccircle cx='2' cy='2' r='1.5' fill='${DOT_TILE[tone]}'/%3E%3C/svg%3E")`,
        backgroundSize: "14px 14px",
      }}
    />
  );
}
