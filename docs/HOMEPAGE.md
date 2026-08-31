# Homepage brief — the public landing page for The Risk Game

**Status:** spec, not built. **Owner:** Max Jansen. **Target route:** `/`

> **Read `DESIGN.md` end to end before writing a line of JSX.** This document
> only says *what the page contains*. `DESIGN.md` says *how everything looks*,
> and it wins every conflict. Nothing here authorises a new visual language.

---

## 1. Why this page exists

Today `/` is a two-button splash. It works for a class that already knows what
the game is, and for nobody else. This page has to do the job the splash can't:
explain the product to a professor who arrived from a link, a conference talk,
or a search, and convert them into a hosted session.

**Primary reader:** a university instructor teaching an intro finance,
economics, or personal-finance course, deciding in about 90 seconds whether this
is worth 20 minutes of class time.

**Secondary readers:** a student who typed the bare domain instead of scanning
the QR; a department head evaluating cost; a recruiter or collaborator following
a link from Max.

**The page succeeds if** an instructor who has never heard of it can say what
the game teaches, what a session looks like, what it costs, and who built it —
and reaches `/host` without asking a question first.

**Non-goals.** No blog. No docs site. No login wall. No dashboard, no live data,
no Supabase call on this route. It stays a static Server Component.

---

## 2. The design tension, resolved

Two instructions have to be held at once:

- The page should feel **unique**, not another AI-generated SaaS landing page.
- Nobody should feel a jolt crossing from `/` into `/join` or `/host`.

These are only in tension if you think uniqueness comes from the layout. It
doesn't. **Structure is conventional; execution is not.**

Use the section order every instructor already knows how to read — hero, how it
works, what it does, who it's for, pricing, maker, FAQ, footer. Then render it
in Academy Arcade: warm paper, ink borders, hard offset shadows, Archivo caps,
Fraunces italic asides, mono numbers. Nothing else on the internet looks like
that, and the visual language is identical to the app the CTA leads into.

**The continuity test — run it before you call the page done.** Screenshot `/`
and `/host` at 1440px and put them side by side. If a stranger can't tell they
are the same product, the page is wrong. Same paper, same dot grid, same ink
borders, same amber CTA, same fonts.

---

## 3. Design law

### Use only what exists

- **Colors:** `paper`, `paper-2`, `surface`, `paper-inverse`, `ink`,
  `ink-muted`, `ink-subtle`, `line`, `brand`, `brand-strong`, `brand-soft`,
  `gain`, `gain-soft`, `loss`, `loss-soft`, `play`, `play-soft`. Never a raw
  Tailwind palette class (`slate-*`, `indigo-*`, `emerald-500`). If you reach
  for a color the tokens don't have, you have the wrong idea, not a missing
  token.
- **Amber is a fill behind ink text.** Never gold text on white. Never white
  text on amber.
- **Fonts:** `font-display` (Archivo) for headlines and labels, `font-sans`
  (Hanken Grotesk) for body, `font-editorial` (Fraunces italic) for the
  professor's-voice asides only, `font-mono` (JetBrains Mono) for numbers,
  prices, and the join code. Do not add a font.
- **Shadows:** `shadow-card` (3px), `shadow-pop` (5px), `shadow-lift` (6px).
  Hard ink offsets, no blur, ever.
- **Radius:** `rounded-2xl` cards, `rounded-xl` controls, `rounded-full` chips.
- **Borders:** `border-2 border-ink` on every surface; `border-[3px]` on the
  hero card and the highlighted pricing tier only.
- **Press affordance** on every interactive element:
  `active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`.
- **Icons:** `components/icons.tsx` only. Add new ones in the same style
  (24×24, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.75}`,
  `width/height="1em"`). No icon library. **No emoji anywhere** — not in copy,
  not as decoration.

### Marketing-only patterns you may add

The app is a tool; a landing page is allowed a louder voice. These are new but
still in-system:

- **Oversized display type.** The hero headline may run to `clamp(2.75rem, 8vw,
  6rem)` — bigger than anything in the app. Same Archivo black, same uppercase,
  same tight tracking.
- **Full-bleed color bands.** A section may sit on a solid `bg-ink` (cream text
  via `text-paper-inverse`), `bg-brand`, or `bg-play` band running edge to edge,
  with an ink border top and bottom. The app already does this in present mode's
  reveal takeover, so it is native to the system.
- **Wider container.** `max-w-6xl` for marketing sections. The app caps at
  `max-w-5xl`; a landing page is allowed the extra room.
- **Scroll-reveal.** Sections fade and rise once on entry — see §8.
- **Static game props.** Non-interactive replicas of real app pieces (a risk
  meter, a GOOD/BAD banner, a leaderboard row) used as illustration. Build these
  from the same classes the app uses so they are honest.

### Banned

No gradients. No glassmorphism or backdrop blur. No blurred/soft drop shadows.
No dark hero. No purple, teal, or any off-token color. No stock photography. No
3D blobs, mesh backgrounds, or floating orbs. No Inter, Geist, or any font
outside the four. No emoji. No animated gradient text. No marquee logo scroller.
No generic "Trusted by 10,000+ teams" strip. No carousel.

### Honesty rules — hard requirements

The game has not run in a live class yet. Therefore:

- **No testimonials.** Not real-sounding invented ones, not "quotes coming
  soon" placeholders styled as quotes.
- **No university logos**, real or fictional, in a trust strip.
- **No usage numbers** — no student counts, session counts, or school counts.
- **No fabricated ratings or press mentions.**

Substitute honest, verifiable claims: what the game does, the math it
implements, that it is open source, that students need no account. If a section
needs social proof to work, cut the section. A "Currently in pilot — first
classroom sessions this term" line is fine and true.

---

## 4. Routing and structure

```
/                → NEW marketing homepage (this brief)
/join            → unchanged
/host            → unchanged
/host/[id]/*     → unchanged
/play/[id]       → unchanged
```

The existing role split ("I'm a student" / "I'm the professor") does not
disappear — it moves into the hero as the two CTAs, and into the header nav.
A student who lands on `/` still reaches `/join` in one click.

**Do not touch:** anything under `lib/`, `supabase/`, `app/host`, `app/play`,
`app/join`, `app/auth`, `middleware.ts`, or the `NEXT_PUBLIC_ALLOW_ANON_HOST`
bypass. This is a `/` change plus new files.

**File plan:**

```
app/page.tsx                     rewritten — composes the sections, nothing else
components/marketing/SiteHeader.tsx
components/marketing/Hero.tsx
components/marketing/HowItWorks.tsx
components/marketing/GameModes.tsx
components/marketing/FeatureGrid.tsx
components/marketing/BothSides.tsx
components/marketing/WhoItsFor.tsx
components/marketing/Pricing.tsx
components/marketing/MadeBy.tsx
components/marketing/Faq.tsx
components/marketing/FinalCta.tsx
components/marketing/SiteFooter.tsx
lib/marketing/content.ts         all copy, pricing tiers, FAQ, links — one file
```

Everything is a Server Component except the FAQ disclosure and any scroll-reveal
wrapper. **All strings live in `lib/marketing/content.ts`**, not inline in JSX,
so Max can edit copy and prices without touching layout.

Reuse `Card` and `Button` from `components/ui.tsx` wherever they fit. If a
marketing surface genuinely needs something they can't express, write it with
the raw token classes in the marketing component — do not modify `ui.tsx`.

---

## 5. Section-by-section spec

Copy below is the real draft, not lorem. Use it. Anything marked `TODO(max)` is
a value only Max can supply — leave the token visible in the file, do not
invent a replacement.

### 5.1 Sticky header

Height 64px, `bg-paper/95` with `backdrop-saturate` off, a `border-b-2
border-ink`, full width, sticky top. Left: wordmark **THE RISK GAME** in Archivo
black uppercase, with the `Coins` icon in an amber ink-bordered square. Right,
desktop: text links `How it works`, `The games`, `Pricing`, `Who made it`, then
a `Join a game` ghost button and a `Host a session` amber button. Mobile: the
wordmark plus one amber `Host` button; the nav links collapse into nothing (do
not build a hamburger drawer for four anchors — put them in the footer instead).

Anchor links scroll to `#how`, `#games`, `#pricing`, `#maker`. Add
`scroll-margin-top: 5rem` to those section ids so the sticky header doesn't
cover the heading.

### 5.2 Hero

Left column (7 of 12 at `lg`), right column a static game prop.

- Eyebrow chip: `Live in-class simulation` with the `Coins` icon — reuse the
  exact chip already in `app/page.tsx`.
- H1, Archivo black uppercase, `leading-[0.9]`:
  **`Teach risk by making them feel it.`**
- Sub, `font-editorial` italic, `text-ink-muted`, max ~60ch:
  *"A Kahoot-style simulation for finance and economics classes. Students split
  their wealth between a safe and a risky asset, the market turns, and the
  leaderboard does the lecturing."*
- Two CTAs side by side: primary amber `Host a session` → `/host`; secondary
  `surface` fill `Join with a code` → `/join`. Both `shadow-pop`, both with the
  press shift, both ≥44px tall.
- Under the CTAs, one quiet mono line: `No student accounts · Works on any
  phone · Free while in pilot`.

Right column: an ink-bordered `rounded-2xl` `bg-surface` card with
`shadow-lift`, containing a **static** replica of a student's allocation step —
the risk-meter bar (green safe base, red risky fill growing from the right),
`$100` in mono, a `62% risky` label, and a locked-in state. It must be built
from the same classes `components/student/AllocationInput.tsx` uses so it is a
truthful preview. No animation on load beyond `animate-rise`.

### 5.3 How it works — `#how`

Section heading: **`Three minutes to set up. One class to run.`**

Three numbered steps in a row (`sm:grid-cols-3`), each an ink-bordered card with
a big mono numeral in an amber square, an Archivo title, and two lines of body:

1. **Create the session.** Pick the game, the number of rounds, and the market
   odds. You get a join code and a QR in about thirty seconds.
2. **Students join from their phones.** They scan or type the code. No app, no
   account, no email.
3. **Run the rounds.** They allocate, you lock, the market reveals on the
   projector, the leaderboard updates. Repeat until the point lands.

Below the three, a single full-width ink-bordered strip on `bg-play-soft`:
*"Export the whole session as CSV when it's over — every round, every
allocation, every counterfactual."*

### 5.4 The three games — `#games`

Heading: **`One engine, three lessons.`** Sub in editorial italic: *"Same
lobby, same leaderboard, same projector view. Pick the one that matches the
lecture."*

Three cards, each with an icon, a name, a one-line hook, and three plain bullets
drawn from `README.md` — no marketing embellishment on the math:

| | Basic | Portfolio | Manager |
|---|---|---|---|
| Hook | One risky bet, twenty-five rounds | N risky assets and a correlation dial | Active vs. passive over a career |
| Bullets | Good/bad market · moderate or extreme payoffs · host can tune the odds mid-game | Multiple assets · correlation ρ · diversification stops being abstract | Continuous returns · fees compound · a secret alpha nobody can see |

Give the Manager card a `border-[3px]` and a `bg-brand-soft` fill to mark it as
the sharpest one, and one editorial-italic line under it: *"On the market-neutral
preset, the best strategy in the game still loses to its own fee structure."*
That sentence is the most persuasive thing on the page for a finance professor.
Do not bury it.

### 5.5 Feature grid

Heading: **`Built for a room with a projector.`** Six cards, two rows of three,
each an icon plus a bold Archivo label plus one sentence:

- **Present mode** (`Monitor`) — a full-screen projector view that mirrors the
  session live while you drive from your laptop.
- **Real-time everything** (`Sparkle`) — submissions, locks, and reveals land on
  every device at once.
- **Live market controls** (`Sliders`) — change the odds between rounds when the
  class needs a different lesson.
- **Nothing leaks early** (`Lock`) — allocations stay private until lock, and the
  market outcome is written only at reveal.
- **CSV export** (`Download`) — the whole session, including counterfactuals, for
  a follow-up assignment.
- **Scales to a lecture hall** (`Users`) — designed for rosters of 100+, with
  bounded scrolling lists so controls never get pushed off screen.

### 5.6 Both sides of the room

A two-column band on `bg-ink` with `text-paper-inverse`, full bleed, ink border
top and bottom. Left: **What the class sees** — a static present-mode prop (join
code in huge mono, a GOOD banner). Right: **What you see** — a static host
control prop (lock button, submitted count, a leaderboard row or two).

Use `TODO(max): screenshot` slots if real screenshots are preferred; if they are
used, they must be ink-bordered with `shadow-lift` and never floated on a
gradient.

### 5.7 Who it's for

Heading: **`Who this is for.`** Three short columns, no cards, separated by ink
rules:

- **Intro finance and economics.** Risk, return, and variance stop being symbols
  on a slide.
- **Personal finance and first-year seminars.** No prerequisites. The rules fit
  on one screen.
- **Anyone teaching decisions under uncertainty.** Business, statistics,
  psychology — the mechanic is general.

### 5.8 Pricing — `#pricing`

**Every number here is a placeholder.** Put the tier data in
`lib/marketing/content.ts` as an exported `PRICING` array with a comment reading
`// PLACEHOLDER — confirm before launch`, so changing prices is a one-file edit.
Render a visible pilot note above the tiers so nothing on the page is a false
promise:

> *"The game is in pilot and free to use this term. The plans below are the
> shape of what's coming — tell me what would actually work for your course."*

Three tiers, middle one highlighted (`border-[3px]`, `bg-brand-soft`,
`shadow-lift`, a `Most classes` chip). Equal-height cards, price in big mono,
feature list with `Check` icons, one CTA each.

| | **Classroom** | **Course** | **Department** |
|---|---|---|---|
| Price | `$0` | `TODO(max) $__ / semester` | `TODO(max) Custom` |
| For | A single section trying it out | An instructor running it all term | Multiple instructors, one bill |
| Included | All three games · up to 40 students per session · one live session at a time · CSV export · present mode | Everything in Classroom · up to 300 students per session · unlimited concurrent sessions · saved session history · priority email support | Everything in Course · unlimited instructors · roster/SSO integration · onboarding session · invoiced billing |
| CTA | `Start free` → `/host` | `TODO(max) link` | `Email Max` → mailto |

Under the table, one editorial-italic line: *"Students never pay and never make
an account."* That answers the objection an instructor is actually having.

### 5.9 Who made it — `#maker`

A single wide ink-bordered card on `bg-surface`, `shadow-lift`, two columns at
`md`. Left, a short first-person note in the same voice Max writes in — plain,
concrete, no pitch:

> **Built by Max Jansen.**
>
> I'm a computer science student at Worcester Polytechnic Institute. This
> started as a replacement for a spreadsheet a professor was running by hand
> every semester — allocations typed in one cell at a time while thirty students
> waited. The game math is unit-tested and documented, the security model is
> written down and self-tested. `TODO(max): keep the next clause only if the
> repo is public — "and the whole thing is open source."`
>
> If you want to run it in your class, or you want a mechanic it doesn't have
> yet, email me.

Right column: a stacked list of links, each an ink-bordered row with an icon —
`Email` (mailto: `maxalexjansen@gmail.com`), `GitHub` (`TODO(max) repo URL`),
`Personal site` (`TODO(max) — max-jansen.com?`). Add a small mono line:
`Worcester, MA`.

No photo unless Max supplies one. Do not generate an avatar.

### 5.10 FAQ

Native `<details>` disclosures styled per the `DESIGN.md` collapse pattern
(chevron rotates with `group-open:rotate-180`), ink-bordered, stacked with
`space-y-3`. Questions:

- **Do students need an account?** No. They open a link or scan a QR, type a
  name, and play. Nothing is collected beyond a display name.
- **What device do they need?** Any phone or laptop with a browser.
- **How long does a session take?** Twenty-five rounds runs about fifteen to
  twenty minutes. Both the round count and the pace are yours.
- **Can I change the market mid-game?** Yes. Odds and payoff mode are host
  controls during the session.
- **Can students see each other's bets?** Not before lock, and never another
  student's allocation. The leaderboard itself can be hidden.
- **What do I get afterward?** A CSV of every round, every allocation, and the
  counterfactual — what each student would have ended with under other
  strategies.
- **Is it open source?** `TODO(max) — yes/link, or cut this row.`

### 5.11 Final CTA

Full-bleed `bg-brand` band, ink border top and bottom, ink text. Archivo black
headline **`Run it in your next class.`**, one editorial-italic line, one large
`bg-ink text-paper` button `Host a session` → `/host`, and a quiet text link
`or join a game with a code` → `/join`.

### 5.12 Footer

`bg-ink`, `text-paper-inverse`, ink border top. Three columns: wordmark plus a
one-line description; the anchor links from the header plus `Join` and `Host`;
contact and source links. Bottom rule with `© 2026 Max Jansen` in mono and a
small honest line: `Built with Next.js and Supabase.`

---

## 6. Copy voice

Short declarative sentences. Concrete nouns. No superlatives, no "revolutionize",
no "empower", no "seamless", no "leverage" as a verb. **No em dashes.** The
Fraunces italic lines are the professor's aside and may be a touch warmer; every
other line is plain.

Numbers are always mono. Anything that could be checked (round counts, payoff
multipliers, student caps) must match `README.md` and `MECHANICS.md` exactly.

---

## 7. Responsive

Mobile-first, verified at 375 / 768 / 1024 / 1440.

- 375: everything stacks; hero prop moves below the CTAs; pricing becomes one
  column with the highlighted tier first; no horizontal scroll at any point.
- The full-bleed bands must bleed with `w-full` on a wrapper and keep their
  inner content in the `max-w-6xl` container.
- Tap targets ≥44px. Header buttons included.
- Test the hero headline at 320px — `clamp()` must not overflow.

---

## 8. Motion

Reuse the existing keyframes only: `animate-rise`, `animate-pop-in`. Do not add
new ones.

- Hero: `animate-rise` on load, staggered ~60ms across eyebrow, headline, sub,
  CTAs.
- Each section below the fold: reveal once on scroll via `IntersectionObserver`
  in one small client component wrapper (`components/marketing/Reveal.tsx`),
  translateY 10px + fade, 400ms ease-out, `once: true`.
- Hover on cards: `hover:-translate-y-0.5` only, matching `app/page.tsx` today.
- **Everything must be inert under `prefers-reduced-motion`.** The global reset
  in `globals.css` handles CSS animation; the `Reveal` wrapper must also check
  the media query and render children visible immediately when it matches.
  Content must never depend on JS to become visible — render it visible and
  animate from there, so a failed observer can't blank the page.

---

## 9. Accessibility gate

Ship blockers, all from `DESIGN.md` §10:

- [ ] Contrast ≥4.5:1 on every new pairing. Check ink text on `brand`, cream
      (`paper-inverse`) on `ink`, and `ink-muted` on `surface`.
- [ ] One `<h1>` on the page; heading levels descend without skipping.
- [ ] Every section is a `<section>` with an `aria-labelledby` pointing at its
      heading.
- [ ] Visible focus ring on every link and button; logical tab order.
- [ ] All icons `aria-hidden`; icon-only controls get `aria-label`.
- [ ] FAQ uses real `<details>/<summary>` so it works without JS.
- [ ] Reduced motion respected, including the scroll reveal.
- [ ] No information conveyed by color alone.

---

## 10. Performance and SEO

- No client JS beyond the FAQ (native anyway) and `Reveal`. No animation
  library, no scroll library, no UI library.
- Fonts are already wired in `app/layout.tsx` via `next/font`. Do not add a
  font import or a `<link>` to Google Fonts.
- Any image is `next/image` with explicit dimensions. Prefer CSS/SVG props over
  screenshots where the prop is honest.
- Update the metadata in `app/layout.tsx`: keep the title, expand the
  description, and add `openGraph` (title, description, url, siteName) plus
  `twitter: { card: "summary_large_image" }`. `TODO(max)` an OG image — do not
  generate one speculatively.
- Lighthouse: Performance and Accessibility ≥95 on desktop before this is done.

---

## 11. Values only Max can supply

| Token | Where | Needed |
|---|---|---|
| `TODO(max) $__ / semester` | §5.8 Course tier | The actual price |
| `TODO(max) Custom` | §5.8 Department tier | Price or "Contact" |
| `TODO(max) link` | §5.8 Course CTA | Where the paid CTA goes |
| `TODO(max) repo URL` | §5.9, §5.10 | Public GitHub URL, or cut the open-source claims |
| `TODO(max) personal site` | §5.9 | max-jansen.com or omit |
| `TODO(max) screenshot` | §5.6 | Real present-mode and host screenshots, or keep the static props |
| `TODO(max) OG image` | §10 | Social card |

Leave every unresolved token literally in the code as a visible string. A
half-finished page that says `TODO(max)` is fine. A page with an invented price
or a dead link is not.

---

## 12. Acceptance checklist

- [ ] `/` renders the full page; `/join`, `/host`, `/play` are untouched.
- [ ] Side-by-side screenshot of `/` and `/host` reads as one product (§2).
- [ ] Zero raw Tailwind palette classes in `app/page.tsx` and
      `components/marketing/**` — grep for `slate-`, `gray-`, `indigo-`,
      `emerald-`, `blue-`, `zinc-`.
- [ ] Zero gradients, zero `backdrop-blur`, zero blurred shadows — grep for
      `gradient`, `backdrop-`, `shadow-lg`, `shadow-xl`, `shadow-md`.
- [ ] No emoji in any new file.
- [ ] No testimonial, logo strip, or usage statistic anywhere (§3).
- [ ] All copy lives in `lib/marketing/content.ts`.
- [ ] `npm run build` clean; no new TypeScript errors; `npm run test` still
      passes.
- [ ] Verified at 375 / 768 / 1024 / 1440 with no horizontal scroll.
- [ ] Accessibility gate in §9 fully checked.
- [ ] Every game claim on the page matches `README.md` and `MECHANICS.md`.

---

## 13. Suggested build order

1. `lib/marketing/content.ts` with all copy and the placeholder pricing.
2. `SiteHeader`, `SiteFooter`, `Reveal` — the frame.
3. `Hero` with the static allocation prop. **Stop here and screenshot it next to
   `/host`.** If the continuity test fails, fix it now, not after ten sections.
4. `HowItWorks`, `GameModes`, `FeatureGrid`.
5. `BothSides`, `WhoItsFor`.
6. `Pricing`, `MadeBy`, `Faq`, `FinalCta`.
7. Compose in `app/page.tsx`, update metadata, then run §12 top to bottom.
