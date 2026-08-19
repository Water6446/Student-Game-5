# Design System — "Academy Arcade"

The shared design language for this family of **live, in-class student games**
(Kahoot-style: a host runs a session on a projector, students join from phones).
Any new game in this style should follow this document so the whole suite feels
like one product. It is self-contained and copy-pasteable into a fresh
Next.js + Tailwind project.

> **North star:** academic and trustworthy (it's used in a classroom and shown on
> a projector), but warm and a little playful (it's a game). Warm paper, **ink-black
> borders, hard offset shadows, saturated color blocks, big bold grotesk headlines** —
> game-show energy that still reads as a finance classroom tool and stays legible
> from the back of a lit room and on a student's phone.

---

## 1. Principles

1. **Light & legible first.** Warm paper background, dark ink text. Light themes
   read better on classroom projectors in lit rooms. No dark mode.
2. **Hard edges, solid fills.** Every surface gets a 2–2.5px **ink border** and a
   **hard offset shadow** (solid ink, no blur). Always put text on a solid fill,
   never directly on the dot texture.
3. **Semantic, not decorative, color.** Green = gain / GOOD / safe-ish upside;
   rose/red = loss / BAD / risk. These map to game meaning and must always be
   paired with an icon or text (never color alone).
4. **One primary action per screen.** The headline CTA is gold (amber fill, ink
   text), full-width, and pinned to a stable position so repeated actions can be
   clicked in place.
5. **Show consequences, teach by playing.** Prefer tangible, visual encodings
   (risk meters, outcome previews, sparklines) over bare numbers.
6. **A "moment" on the projector.** Reveals are events — big, animated,
   full-screen. See the **Present mode** pattern.
7. **Motion is meaning, and optional.** 150–320ms, ease-out; celebratory only at
   real beats (a win, a reveal). Always respect `prefers-reduced-motion`.
8. **SVG icons only — no emoji or decorative glyphs.** One inline line-icon set
   (`components/icons.tsx`, 1.75 stroke, `currentColor`). Emoji and pictographic
   Unicode accents are not used anywhere — not in UI copy, not as flourish.
   Directional meaning always uses `ArrowUp`/`ArrowDown`, never color alone.

---

## 2. Color tokens

Defined as **RGB channel triplets** in `:root` so Tailwind opacity modifiers
(`bg-brand/20`) work, then referenced via `rgb(var(--x) / <alpha-value>)`.

```css
/* app/globals.css */
:root {
  color-scheme: light;

  --paper: 235 227 208;       /* #EBE3D0 warm paper page */
  --paper-2: 251 239 210;     /* #FBEFD2 gold-tint inset panel */
  --surface: 255 253 246;     /* #FFFDF6 cards */

  --ink: 33 26 18;            /* #211A12 text AND borders */
  --ink-muted: 107 92 64;     /* #6B5C40 secondary text (darkened for projector) */
  --ink-subtle: 124 107 72;   /* #7C6B48 hints */

  --line: 33 26 18;           /* #211A12 borders → ink */
  --line-strong: 33 26 18;    /* #211A12 strong borders → ink */

  --brand: 240 169 43;        /* #F0A92B amber FILL — buttons/blocks (ink text on top) */
  --brand-strong: 224 150 26; /* #E0961A amber hover */
  --brand-soft: 251 239 210;  /* #FBEFD2 amber/gold tint */

  --gain: 31 138 76;          /* #1F8A4C GOOD market / profit / safe upside */
  --gain-soft: 228 251 234;   /* #E4FBEA */
  --loss: 219 59 43;          /* #DB3B2B BAD market / loss / risk */
  --loss-soft: 255 227 221;   /* #FFE3DD */

  --play: 37 87 232;          /* #2557E8 electric blue — "you" / primary nav accent / toggles */
  --play-soft: 228 236 255;   /* #E4ECFF */
}
```

**Roles**
- `brand` (amber): a **fill** behind ink text — buttons, blocks, the slider thumb.
  **Never amber text on white** (fails contrast); anywhere you'd want "gold text,"
  use `ink`. Amber buttons get `text-ink`, not white.
- `gain` / `loss`: outcomes & directional data. Solid fills get white text; use
  the `-soft` tints for quiet backgrounds, the solid for text/icons/bars.
- `play` (electric blue): the "you" highlight on leaderboards, stateful toggles,
  navigational primary CTAs (join / next round), info banners.
- `ink` scale: text **and borders**. `paper`/`surface`: structure.

Tailwind maps them (see `tailwind.config.ts`):

```ts
const token = (n: string) => `rgb(var(${n}) / <alpha-value>)`;
colors: {
  paper: { DEFAULT: token("--paper"), 2: token("--paper-2") },
  surface: token("--surface"),
  ink: { DEFAULT: token("--ink"), muted: token("--ink-muted"), subtle: token("--ink-subtle") },
  line: { DEFAULT: token("--line"), strong: token("--line-strong") },
  brand: { DEFAULT: token("--brand"), strong: token("--brand-strong"), soft: token("--brand-soft") },
  gain: { DEFAULT: token("--gain"), soft: token("--gain-soft") },
  loss: { DEFAULT: token("--loss"), soft: token("--loss-soft") },
  play: { DEFAULT: token("--play"), soft: token("--play-soft") },
}
```

**Always use the semantic classes** (`bg-surface`, `text-ink`, `border-ink`,
`text-gain`, `bg-play-soft`) — never raw `slate-*` / `indigo-*` / `emerald-N`.
For Recharts/canvas that need hex, use the values above (series palette:
`#1F8A4C #2557E8 #F0A92B #DB3B2B …`, ink axes/grid `#211A12`, muted ticks
`#6B5C40`, tooltip bg `#FFFDF6`). Extra tint fills for chips/accents:
gold `#FBEFD2`, blue `#E4ECFF`, green `#E4FBEA`, red `#FFE3DD`.

---

## 3. Typography

Four Google fonts via `next/font` (self-hosted, `display: swap`), exposed as CSS
variables and mapped in Tailwind.

| Role | Font | Tailwind | Use |
|------|------|----------|-----|
| Display / headings | **Archivo** (700–900 grotesk) | `font-display` | h1–h3, hero numbers, button labels, leaderboard names. Punchy, game-show. |
| UI / body | **Hanken Grotesk** | `font-sans` (default) | Everything else. Friendly, geometric, legible. |
| Editorial accents | **Fraunces italic** (400–600) | `font-editorial` | The "professor's voice": instructional captions, subtitles, helper text. Italic only. |
| Numbers / data | **JetBrains Mono** (400–800) | `font-mono` | Money, leaderboards, codes, timers, round counters. Always tabular. |

```ts
// app/layout.tsx
import { Archivo, Hanken_Grotesk, Fraunces, JetBrains_Mono } from "next/font/google";
const display = Archivo({ subsets:["latin"], weight:["600","700","800","900"], variable:"--font-display", display:"swap" });
const sans = Hanken_Grotesk({ subsets:["latin"], weight:["400","500","600","700"], variable:"--font-sans", display:"swap" });
const editorial = Fraunces({ subsets:["latin"], weight:["400","500","600"], style:["italic"], variable:"--font-editorial", display:"swap" });
const mono = JetBrains_Mono({ subsets:["latin"], weight:["400","500","700","800"], variable:"--font-mono", display:"swap" });
// <html className={`${display.variable} ${sans.variable} ${editorial.variable} ${mono.variable}`}><body className="min-h-dvh font-sans">
// viewport.themeColor = "#EBE3D0"
```

```ts
// tailwind.config.ts
fontFamily: {
  display:   ["var(--font-display)", "system-ui", "sans-serif"],          // Archivo
  sans:      ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"], // Hanken Grotesk
  editorial: ["var(--font-editorial)", "Georgia", "serif"],               // Fraunces italic
  mono:      ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],   // JetBrains Mono
}
```

- Headings default to `font-display` (Archivo) via a base rule; weight `800–900`
  for big titles, tight tracking (`leading-[.92]` on heroes).
- Use `font-editorial italic` in `text-ink-muted` for instructional/helper copy.
- `.font-mono { font-variant-numeric: tabular-nums; }` globally so money columns
  never jitter. Apply `tabular-nums` to any numeric input too.
- Body min 16px on mobile. Line-height 1.5 for prose.

---

## 4. Structure, spacing, elevation

- **Containers:** center with `mx-auto` + a max width per surface — student/phone
  views `max-w-md`, forms `max-w-md`/`max-w-3xl`, host dashboards `max-w-5xl`,
  projector/present uses viewport units (`px-[3vw]`). Page padding `px-6 py-…`.
- **Full height:** use `min-h-dvh` (not `100vh`) so mobile browser chrome doesn't
  clip content.
- **Radius:** cards `rounded-2xl` (16px), controls/inputs/cells `rounded-xl`
  (12px), chips/pills `rounded-full`. Present-mode panels `rounded-3xl`.
- **Borders:** **ink**, `border-2` on cards/buttons/inputs, `border-[2.5px]`/`border-[3px]`
  on hero elements, the phone shell, and the projector stage. Prefer explicit
  `border-2 border-ink` per surface (clearer than a global default).
- **Spacing:** 4/8px rhythm; cards use `p-6`, vertical stacks `space-y-4/5`,
  section gaps 22–32px.
- **Elevation (hard ink offset shadows, no blur):**
  ```ts
  boxShadow: {
    card: "3px 3px 0 rgb(var(--ink))",   // standard card / button
    lift: "6px 6px 0 rgb(var(--ink))",   // hero card, modal, big CTA
    pop:  "5px 5px 0 rgb(var(--ink))",   // primary CTA emphasis
  }
  ```
  Cards: `rounded-2xl border-2 border-ink bg-surface p-6 shadow-card`.
- **Press affordance:** interactive elements shift down-right and drop their
  shadow on `:active` — `active:translate-x-[2px] active:translate-y-[2px]
  active:shadow-none`. Apply per interactive element.
- **Texture:** the page body carries a faint **ink** tiled-dot grid (no gold glow):
  ```css
  body {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='1' cy='1' r='1.3' fill='%23211a12' fill-opacity='0.07'/%3E%3C/svg%3E");
    background-size: 22px 22px;
    background-attachment: fixed;
  }
  ```

---

## 5. Motion

Tailwind keyframes/animations; everything below is gated by a global
`prefers-reduced-motion` reset that near-zeroes durations and hides confetti.

| Name | Use |
|------|-----|
| `animate-pop-in` | Card / panel / reveal-banner entrance (scale+fade, ~0.32s). |
| `animate-rise` | Hero / section entrance (translateY+fade). |
| `animate-count-pop` | A result number landing. |
| `animate-confetti` | Celebratory burst (`Confetti.tsx`, retinted amber/blue/white) — wins, reveals. |
| `animate-shake` | A negative result (BAD outcome card). |
| `animate-pulse-soft` | "Waiting…" idle states (medallion, lock dots). |
| `active:scale-[0.98]` / press shift | Press feedback on buttons/cards. |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:.001ms!important; animation-iteration-count:1!important;
    transition-duration:.001ms!important; scroll-behavior:auto!important;
  }
  .confetti-piece { display:none; }
}
```

---

## 6. Iconography

One inline SVG set in `components/icons.tsx`: 24×24 viewBox, `fill="none"`,
`stroke="currentColor"`, `strokeWidth={1.75}`, round caps/joins, `width/height
="1em"` (size with text/`w-`, color with `text-*`), `aria-hidden` by default.
Add new icons in the same style; never reach for an icon library, and never use
emoji or pictographic Unicode glyphs as accents. Directional meaning
(GOOD/BAD, up/down) always pairs an arrow icon with text, never color alone.

---

## 7. Core components (`components/ui.tsx`)

Build screens from these; they encode the tokens so restyles cascade. Everything
gets `border-2 border-ink` + `shadow-card` + the press shift.

- **`Card`** — `rounded-2xl border-2 border-ink bg-surface p-6 shadow-card`.
- **`Button`** — `variant`: `primary` (electric blue, navigational CTAs),
  `gold` (amber fill, **ink** text — the headline "lock in / start" CTA),
  `secondary` (`bg-surface` outline → `hover:bg-paper-2`), `success` (`bg-gain`),
  `danger` (`bg-loss`). Base: `border-2 border-ink ... shadow-card font-display
  font-extrabold active:translate-x-[2px] active:translate-y-[2px]
  active:shadow-none`. Full-width in panels (`className="w-full text-lg"`), shows
  a busy label while async.
- **`Field` / `TextInput` / `Select`** — visible bold label, optional hint,
  `border-2 border-ink bg-surface shadow-card font-semibold`, focus → brand/ink
  ring. Use semantic input `type`/`inputMode`.
- **`Toggle`** — switch with `role="switch"`; ink `border-2`, track on = `bg-play`
  (blue), knob white with a thin ink border.
- **`Banner`** — `kind`: `error` (loss), `info` (play/blue), `success` (gain);
  `rounded-xl border-2 border-ink shadow-card`, soft-tint fill + matching text,
  `role="alert"`.

**Focus:** every interactive element gets a visible ring —
`focus-visible:ring-2 ring-brand ring-offset-2 ring-offset-paper` (set globally
in `globals.css`).

---

## 8. Reusable patterns

**Primary-action placement.** Keep the main CTA pinned to the same spot across a
state machine so sequential actions are clickable in place (e.g. host control
panel: `Lock & reveal` while open and `Next round` after reveal occupy the same
top position). Put the button first; supporting context flows below it.

**Money & data.** Format via a single `money()` helper (`$1,234.56`,
`maximumFractionDigits: 2`) and a `signedMoney()` with ± and `−`. Render in
`font-mono` (tabular). For "X vs Y" splits (safe/risky), prefer a **risk-meter
bar** — an ink-bordered pill, green (safe) base with a **red (risky) fill that
grows from the right** as the risky share increases — with the % as the hero
number and exact dollars quiet beneath. Big SAFE/RISKY stat blocks use solid
`bg-gain`/`bg-loss` with white text, ink border, Archivo label + mono amount.

**GOOD / BAD outcomes.** Soft-tint pill with an arrow icon inline; the dramatic
version (present mode) is a full-bleed `bg-gain`/`bg-loss` banner with an ink
bottom border + huge arrow + Archivo headline + confetti on good / shake on bad.

**Collapse the rarely-used.** Tuck infrequent controls behind a styled native
`<details>` disclosure (chevron rotates with `group-open:rotate-180`) to keep
panels compact.

**Long lists stay usable.** Any roster/list that can grow (lobbies, ticks) gets a
bounded `max-h-[…] overflow-y-auto` so primary actions never get pushed off-screen
— assume 100+ students.

**Cross-tab host preferences.** Host UI prefs that must sync between the control
tab and the projector tab use `localStorage` + a `storage` event listener (see
`useShowBots`), not React state.

**Active nav/step.** Active tab = solid ink fill + cream text + pressed offset;
inactive = `bg-surface` + ink border + shadow. Drive via conditional classes.

**Loading / empty states.** Never ship a bare spinner only; use a short, on-brand
line (`text-ink-subtle`) and, for data, a helpful empty state ("appears after the
first round"). Prefer skeletons for >300ms loads.

---

## 9. Present / projector mode

Every game gets a dedicated **read-only big-screen view** for the projector while
the host drives from their laptop. Pattern (see `components/host/HostPresent.tsx`,
route `app/host/[sessionId]/present/page.tsx`): the stage is an ink-bordered
`rounded-3xl` panel with `shadow-lift` and the ink dot-grid inside.

- A **"Present"** link (Monitor icon, `target="_blank"`) on the lobby, the live
  control screen, and the summary.
- Read-only; auto-updates via the same realtime hooks as the control screen.
  Header = wordmark + a join-code chip (latecomers) + fullscreen toggle + exit.
- Covers all states: **lobby** (giant mono join code/URL + QR + live count, often
  a dark ink panel `bg-ink` with cream text), **in-progress open** ("Place your
  bets" + huge mono submitted/total), **locked** ("Revealing…"), **revealed**
  (full-bleed GOOD/BAD `RevealTakeover` with confetti on good; a neutral "Results
  are in" when outcomes are per-player), **finished** (final standings). Big type
  throughout (`clamp()` sizes), medal podium for top 3.
- **Projector legibility rules:** minimum on-screen text ~24px; use `ink-muted`
  (#6B5C40), never lighter, for secondary text; keep solid fills behind all text;
  maintain ink borders for hard edges that survive projector blur.

---

## 10. Accessibility checklist (ship gate)

- [ ] Text contrast ≥ 4.5:1. Solid fills carry white or ink text (amber/gold gets
      **ink**, never white or gold-on-white). Verify any new pairing.
- [ ] Color never the sole signal — pair with icon/text (GOOD/BAD use arrows).
- [ ] Visible focus ring on every interactive element; logical tab order.
- [ ] Icon-only buttons have `aria-label`; toggles use `role="switch"` /
      `aria-pressed`.
- [ ] Touch targets ≥ 44px; inputs ≥ 44px tall on mobile.
- [ ] `prefers-reduced-motion` respected; no info conveyed by motion alone.
- [ ] Mobile-first: works at 375px, no horizontal scroll, `min-h-dvh`.

---

## 11. File map (where the system lives)

```
app/globals.css          tokens, base type, focus rings, body dot texture, motion reset, slider/confetti CSS
tailwind.config.ts       color tokens, font families, hard-offset shadows, keyframes/animations
app/layout.tsx           next/font wiring (Archivo / Hanken Grotesk / Fraunces italic / JetBrains Mono)
components/ui.tsx         Card, Button, Field, TextInput, Select, Toggle, Banner
components/icons.tsx      inline SVG icon set
components/Confetti.tsx   reduced-motion-aware celebratory confetti
components/host/HostPresent.tsx   projector/present-mode reference implementation
components/CondensedList.tsx      top-N + "+N more" + bottom-M collapse for every player list
components/use-show-bots.ts       cross-tab preference pattern (localStorage + storage event)
components/use-round-phase.ts     the round phase a screen should DISPLAY (gates stale rounds, swallows transient locks)
```

**Starting a new game:** copy `globals.css`, `tailwind.config.ts`, the
`next/font` block in `layout.tsx`, `components/ui.tsx`, `components/icons.tsx`,
and `components/Confetti.tsx`. Build screens from `ui.tsx` primitives using the
semantic tokens, follow the patterns in §8–§9, and run the §10 checklist before
shipping.
