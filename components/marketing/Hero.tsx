import Image from "next/image";
import { ArrowRight, ArrowUp, Coins, Lock } from "@/components/icons";
import { Shell, TextLink } from "@/components/marketing/primitives";
import { HostOrLoginCta } from "@/components/marketing/HostOrLoginCta";
import { HERO, isTodo } from "@/lib/marketing/content";

/**
 * The stage: a full-bleed image inside a rounded frame, with the headline set
 * over it and the product floating at its edge. Two typefaces carry the
 * headline — Archivo black for the claim, Fraunces italic for the turn — and
 * each line slides up from behind its own mask on load.
 *
 * Until a real photograph exists, the same composition runs on a designed ink
 * stage. No stock photo, no generated image: the fallback is the ink field, the
 * thirds grid, and the oversized ghost word.
 */
export function Hero() {
  const hasPhoto = !isTodo(HERO.photo.src);

  return (
    <section aria-labelledby="hero-heading" className="w-full px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-[1.5rem] bg-ink text-paper-inverse sm:rounded-[2.25rem]">
        <Stage hasPhoto={hasPhoto} />

        <div className="relative px-6 pb-8 pt-14 sm:px-10 sm:pt-20 lg:px-14 lg:pb-10 lg:pt-28">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <span className="animate-rise inline-flex items-center gap-2.5 rounded-full border border-paper-inverse/40 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-paper-inverse">
                <Coins className="text-[1.1em]" />
                {HERO.eyebrow}
              </span>

              <h1
                id="hero-heading"
                className="mt-7 text-[clamp(2.5rem,6.6vw,5.5rem)] leading-[0.95] text-paper-inverse"
              >
                <MaskedLine delay={120}>
                  <span className="block font-display font-black uppercase tracking-[-0.02em]">
                    {HERO.headlineLead}
                  </span>
                </MaskedLine>
                {/* The two lines are separate blocks, so without this space the
                    accessible name runs together as "simulationof". */}
                <span className="sr-only"> </span>
                <MaskedLine delay={240}>
                  <span className="block font-editorial text-[0.92em] italic tracking-[-0.01em] text-brand">
                    {HERO.headlineEmphasis}
                  </span>
                </MaskedLine>
              </h1>

              <p
                className="animate-rise mt-8 max-w-[54ch] text-lg leading-relaxed text-paper-inverse/80"
                style={{ animationDelay: "420ms" }}
              >
                {HERO.sub}
              </p>

              <div
                className="animate-rise mt-9 flex flex-wrap items-center gap-x-8 gap-y-4"
                style={{ animationDelay: "500ms" }}
              >
                {/* "Host a session" only once we know they can host; "Log in"
                    otherwise. See HostOrLoginCta. */}
                <HostOrLoginCta tone="cream" icon="arrow" hostLabel={HERO.primary.label} />
                <TextLink
                  href={HERO.secondary.href}
                  label={HERO.secondary.label}
                  icon={<ArrowRight />}
                  className="text-paper-inverse"
                />
              </div>

              <p
                className="animate-rise mt-8 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-paper-inverse/60"
                style={{ animationDelay: "580ms" }}
              >
                {HERO.note}
              </p>
            </div>

            {/* The product, floating at the edge of the stage. */}
            <div
              className="animate-rise relative lg:col-span-5 lg:justify-self-end"
              style={{ animationDelay: "640ms" }}
            >
              <div className="relative mx-auto max-w-sm lg:mx-0">
                <MiniAllocation />
                <MarketChip />
              </div>
              <MiniStandings />
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-end justify-end gap-6 border-t border-paper-inverse/20 pt-6 lg:mt-16">
            <p className="max-w-sm font-editorial text-sm italic leading-relaxed text-paper-inverse/75 sm:text-base">
              {HERO.aside}
            </p>
          </div>
        </div>
      </div>

      {/* Numbers row: product facts, never usage statistics. */}
      <Shell className="py-10 sm:py-12">
        <dl className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
          {HERO.stats.map((stat) => (
            <div key={stat.label} className="flex flex-col border-t border-ink/20 pb-2 pt-4">
              {/* Number first visually, label under it; the DOM keeps dt before
                  dd so the pair is announced once, in the right order. */}
              <dt className="order-2 mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                {stat.label}
              </dt>
              <dd className="order-1 font-mono text-3xl font-black leading-none text-ink sm:text-4xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </Shell>
    </section>
  );
}

/** One headline line, arriving from behind its own mask. */
function MaskedLine({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    // pb/-mb pair gives descenders room so the mask never clips a "y".
    <span className="block overflow-hidden pb-[0.12em] [margin-bottom:-0.12em]">
      <span className="animate-slide-up block" style={{ animationDelay: `${delay}ms` }}>
        {children}
      </span>
    </span>
  );
}

/**
 * The image layer. With a real photograph: the picture plus a flat ink scrim
 * heavy enough to keep cream text at contrast. Without one: an ink field, the
 * thirds grid the reference lays over its photo, and an oversized ghost word.
 */
function Stage({ hasPhoto }: { hasPhoto: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
      {hasPhoto ? (
        <>
          <Image
            src={HERO.photo.src}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Flat wash, not a gradient: one opacity the whole way across. */}
          <span className="absolute inset-0 bg-ink/75" />
        </>
      ) : (
        <>
          <span className="absolute inset-0 bg-ink" />
          <span
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14'%3E%3Ccircle cx='2' cy='2' r='1.5' fill='%23f6efdd'/%3E%3C/svg%3E\")",
              backgroundSize: "14px 14px",
            }}
          />
          <span className="absolute bottom-[-0.22em] right-[-0.04em] select-none font-display text-[26vw] font-black uppercase leading-none tracking-tighter text-paper-inverse/[0.05]">
            Risk
          </span>
        </>
      )}

      {/* Thirds grid, laid over the stage the way the reference rules its photo. */}
      <span className="absolute inset-y-0 left-1/3 hidden w-px bg-paper-inverse/10 sm:block" />
      <span className="absolute inset-y-0 left-2/3 hidden w-px bg-paper-inverse/10 sm:block" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-paper-inverse/10" />
    </div>
  );
}

/**
 * A compact copy of the student allocation step, using the same classes as
 * `components/student/AllocationInput.tsx`. Tilted a degree so it sits on the
 * stage as an object rather than a panel.
 */
function MiniAllocation() {
  const prop = HERO.prop;
  return (
    <div className="rotate-[-1.2deg] rounded-2xl border-2 border-ink bg-surface p-5 shadow-lift">
      <div className="flex items-center justify-between">
        <span className="rounded-full border-2 border-ink bg-ink px-3 py-1 font-mono text-xs font-bold uppercase text-paper-inverse">
          {prop.roundLabel}
        </span>
        <span className="text-right">
          <span className="block font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            {prop.wealthLabel}
          </span>
          <span className="font-mono text-lg font-bold text-ink">{prop.wealth}</span>
        </span>
      </div>

      <div className="mt-4 flex items-stretch gap-2.5">
        <div className="flex-1 rounded-xl border-2 border-ink bg-gain p-2.5 text-center text-white">
          <div className="font-display text-[11px] font-extrabold uppercase tracking-wide">
            {prop.safe.label}
          </div>
          <div className="font-mono text-lg font-bold leading-tight">{prop.safe.amount}</div>
        </div>
        <div className="flex-1 rounded-xl border-2 border-ink bg-loss p-2.5 text-center text-white">
          <div className="font-display text-[11px] font-extrabold uppercase tracking-wide">
            {prop.risky.label}
          </div>
          <div className="font-mono text-lg font-bold leading-tight">{prop.risky.amount}</div>
        </div>
      </div>

      {/* Same meter as the live control: red risky fill to the share, green after. */}
      <div
        className="mt-4 h-3 rounded-full border-2 border-ink"
        style={{
          background: `linear-gradient(to right, rgb(var(--loss)) ${prop.riskyShare}%, rgb(var(--gain)) ${prop.riskyShare}%)`,
        }}
      />
      <div className="mt-2 flex justify-between font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
        <span>{prop.scaleStart}</span>
        <span>{prop.scaleEnd}</span>
      </div>

      {/* The "locked in" stamp from the real waiting screen. */}
      <div className="mt-4 flex justify-center rounded-xl border-2 border-ink bg-brand-soft py-2.5">
        <span className="inline-flex -rotate-2 items-center gap-2 rounded-lg border-2 border-ink bg-brand px-3 py-1 font-display text-sm font-black uppercase tracking-tight text-ink shadow-card">
          <Lock /> {prop.lockedTitle}
        </span>
      </div>
    </div>
  );
}

/**
 * Step three, the reveal: a compact copy of the student's post-reveal screen,
 * using the same pieces as StudentRound (the "New wealth" figure, the
 * this-round pill, "You're 3rd of N", and StudentBoard's rows, with the
 * student's own row highlighted). Tilted the other way from the allocation
 * card, and set in from the right edge, so the two read as a loose stack of
 * screens rather than a column of panels.
 *
 * Desktop only. It fills the empty lower-right of the stage beside the copy;
 * on a phone the column stacks under the copy and it would only lengthen the
 * hero.
 */
function MiniStandings() {
  const s = HERO.standings;
  return (
    // Stepped down and well to the left of the allocation card (about half its
    // width past the market chip), so the column reads decide -> market ->
    // result. Less at lg: between 1024 and 1280 the copy column is wide enough
    // that the full shift would slide under the paragraph. A fixed width about
    // the allocation card's own: this column sizes to its widest child, so
    // anything wider here would silently stretch the card above.
    <div className="mt-14 hidden rotate-[1.4deg] rounded-2xl border-2 border-ink bg-surface p-5 text-ink shadow-lift lg:-ml-16 lg:block lg:w-[15.5rem] xl:-ml-40">
      <div className="font-display text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
        {s.wealthLabel}
      </div>
      <div className="font-mono text-3xl font-black leading-none">{s.wealth}</div>
      {/* Under the number, as on the real reveal screen. Soft tint + ink words,
          as on the market chip: white on solid green is under 4.5:1 here. */}
      <span className="mt-2 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-gain-soft px-2.5 py-0.5 font-mono text-xs font-bold">
        <ArrowUp className="text-gain" />
        {s.delta}
      </span>

      <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-brand-soft py-2 text-center text-sm font-semibold shadow-card">
        {s.rankLead}{" "}
        <span className="rounded-md border-2 border-ink bg-brand px-1.5 font-display font-black">
          {s.rank}
        </span>{" "}
        {s.rankTail}
      </div>

      <ol className="mt-3 space-y-1">
        {s.rows.map((r) => (
          <li
            key={r.rank}
            className={
              r.me
                ? "flex items-center justify-between gap-2 rounded-lg border-2 border-ink bg-play-soft px-3 py-1 text-sm font-bold"
                : "flex items-center justify-between gap-2 rounded-lg border-2 border-transparent bg-paper-2 px-3 py-1 text-sm text-ink-muted"
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="font-mono text-xs text-ink-subtle">{r.rank}</span>
              <span className="truncate">{r.name}</span>
              {r.me ? (
                <span className="rounded-full bg-play px-1.5 font-display text-[9px] font-extrabold uppercase tracking-wide text-white">
                  You
                </span>
              ) : null}
            </span>
            <span className="font-mono">{r.wealth}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The outcome chip, overlapping the card's lower edge. Soft-tint fill with an
 * arrow, which is the GOOD/BAD pill DESIGN.md §8 specifies — and unlike white
 * on solid green it clears 4.5:1 at this size.
 */
function MarketChip() {
  return (
    <div className="absolute -bottom-5 -left-2 rotate-[2.5deg] rounded-xl border-2 border-ink bg-gain-soft px-4 py-2.5 text-ink shadow-card sm:-left-6">
      <div className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-tight">
        {/* The arrow carries the green; the words stay ink, because green text
            on the soft tint is only 4.02:1. */}
        <ArrowUp className="text-gain" />
        {HERO.marketChip.label}
      </div>
      <div className="font-mono text-xs">{HERO.marketChip.detail}</div>
    </div>
  );
}
