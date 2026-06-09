# Design System — "Parchment Pro + a little Kahoot"

The shared design language for this family of **live, in-class student games**
(Kahoot-style: a host runs a session on a projector, students join from phones).
Any new game in this style should follow this document so the whole suite feels
like one product. It is self-contained and copy-pasteable into a fresh
Next.js + Tailwind project.

> **North star:** academic and trustworthy (it's used in a classroom and shown on
> a projector), but warm and a little playful (it's a game). Light, paper-like,
> high-contrast, legible from the back of a room and on a student's phone.

---

## 1. Principles

1. **Light & legible first.** Warm parchment background, dark ink text. Light
   themes read better on classroom projectors in lit rooms. No dark mode.
2. **Semantic, not decorative, color.** Green = gain / GOOD / safe-ish upside;
   rose = loss / BAD / risk. These map to game meaning and must always be paired
   with an icon or text (never color alone).
3. **One primary action per screen.** The main CTA is gold, full-width, and
   pinned to a stable position so repeated actions can be clicked in place.
4. **Show consequences, teach by playing.** Prefer tangible, visual encodings
   (risk meters, outcome previews, sparklines) over bare numbers.
5. **A "moment" on the projector.** Reveals are events — big, animated,
   full-screen. See the **Present mode** pattern.
6. **Motion is meaning, and optional.** 150–320ms, ease-out; celebratory only at
   real beats (a win, a reveal). Always respect `prefers-reduced-motion`.
7. **SVG icons, not emoji.** One inline line-icon set (1.75 stroke,
   `currentColor`). Emoji allowed only as occasional celebratory flourish
   (medals on a podium), never as structural/navigational icons.

---

## 2. Color tokens

Defined as **RGB channel triplets** in `:root` so Tailwind opacity modifiers
(`bg-brand/20`) work, then referenced via `rgb(var(--x) / <alpha-value>)`.

```css
/* app/globals.css */
:root {
  color-scheme: light;

  --paper: 247 243 234;       /* #F7F3EA warm parchment page */
  --paper-2: 240 234 221;     /* #F0EADD deeper inset panel */
  --surface: 255 254 251;     /* #FFFEFB cards */

  --ink: 28 25 23;            /* #1C1917 headings / primary text */
  --ink-muted: 87 83 78;      /* #57534E secondary text */
  --ink-subtle: 120 113 108;  /* #78716C hints */

  --line: 231 224 210;        /* #E7E0D2 borders */
  --line-strong: 214 204 184; /* #D6CCB8 stronger borders */

  --brand: 161 98 7;          /* #A16207 premium gold — primary/CTA (AA on white) */
  --brand-strong: 133 77 14;  /* #854D0E gold hover */
  --brand-soft: 254 243 199;  /* #FEF3C7 gold tint */

  --gain: 4 120 87;           /* #047857 emerald — GOOD / profit / safe upside */
  --gain-soft: 209 250 229;   /* #D1FAE5 */
  --loss: 190 18 60;          /* #BE123C rose — BAD / loss / risk */
  --loss-soft: 255 228 230;   /* #FFE4E6 */

  --play: 124 58 237;         /* #7C3AED violet — playful highlight / "you" / toggles */
  --play-soft: 237 233 254;   /* #EDE9FE */
}
```

**Roles**
- `brand` (gold): the single primary action, brand marks, key highlights.
- `gain` / `loss`: outcomes & directional data. Use the `-soft` tints for
  backgrounds, the solid for text/icons/bars.
- `play` (violet): sparingly — the "you" highlight on leaderboards, stateful
  toggles, info banners.
- `ink` scale: text. `paper`/`surface`/`line`: structure.

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

**Always use the semantic classes** (`bg-surface`, `text-ink`, `text-brand`,
`text-gain`, `border-line`, `bg-play-soft`) — never raw `slate-*` / `indigo-*` /
`emerald-N`. For Recharts/canvas that need hex, use the values above
(series palette: `#A16207 #047857 #7C3AED #BE123C #0E7490 #B45309 #1D4ED8 …`,
grid `#E7E0D2`, axes `#78716C`, tooltip bg `#FFFEFB` border `#D6CCB8`).

---

## 3. Typography

Three Google fonts via `next/font` (self-hosted, `display: swap`), exposed as CSS
variables and mapped in Tailwind.

| Role | Font | Tailwind | Use |
|------|------|----------|-----|
| Display / headings | **Fraunces** (serif) | `font-display` | h1–h3, hero numbers, big moments. Editorial, academic gravitas. |
| UI / body | **Plus Jakarta Sans** | `font-sans` (default) | Everything else. Friendly, geometric, legible. |
| Numbers / data | **JetBrains Mono** | `font-mono` | Money, leaderboards, codes, timers. Always tabular. |

```ts
// app/layout.tsx
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
const display = Fraunces({ subsets:["latin"], weight:["400","500","600","700","900"], style:["normal","italic"], variable:"--font-display", display:"swap" });
const sans = Plus_Jakarta_Sans({ subsets:["latin"], weight:["400","500","600","700","800"], variable:"--font-sans", display:"swap" });
const mono = JetBrains_Mono({ subsets:["latin"], weight:["400","500","700"], variable:"--font-mono", display:"swap" });
// <html className={`${display.variable} ${sans.variable} ${mono.variable}`}><body className="min-h-dvh font-sans">
```

- Headings default to `font-display` via a base rule; weight `900` for big titles.
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
- **Radius:** cards `rounded-2xl`, controls/inputs `rounded-xl`, chips/pills
  `rounded-full`, small `rounded-lg`. Present-mode panels `rounded-3xl`.
- **Spacing:** 4/8px rhythm; cards use `p-6`, vertical stacks `space-y-4/5`.
- **Elevation (warm, paper-like):**
  ```ts
  boxShadow: {
    card: "0 1px 2px rgba(40,33,20,.04), 0 6px 20px -8px rgba(40,33,20,.12)",
    lift: "0 2px 4px rgba(40,33,20,.05), 0 16px 36px -12px rgba(40,33,20,.22)",
  }
  ```
  Cards: `border border-line bg-surface shadow-card`. Hover-lift interactive
  cards with `hover:-translate-y-0.5 hover:shadow-lift`.
- **Texture:** the page body carries a faint tiled-dot grid + a warm gold corner
  glow (identity, very subtle):
  ```css
  body {
    background-image:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='1' cy='1' r='1.1' fill='%231c1917' fill-opacity='0.08'/%3E%3C/svg%3E"),
      radial-gradient(1100px 560px at 100% -10%, rgb(var(--brand)/.08), transparent 60%);
    background-size: 22px 22px, 100% 100%;
    background-attachment: fixed, fixed;
  }
  ```

---

## 5. Motion

Tailwind keyframes/animations; everything below is gated by a global
`prefers-reduced-motion` reset that near-zeroes durations and hides confetti.

| Name | Use |
|------|-----|
| `animate-pop-in` | Card / panel entrance (scale+fade, ~0.32s). |
| `animate-rise` | Hero / section entrance (translateY+fade). |
| `animate-count-pop` | A result number landing. |
| `animate-confetti` | Celebratory burst (see `Confetti.tsx`) — wins, reveals. |
| `animate-shake` | A negative result (BAD outcome card). |
| `animate-pulse-soft` | "Waiting…" idle states. |
| `active:scale-[0.98]` | Press feedback on buttons/cards. |

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
Add new icons in the same style; never reach for an icon library or emoji for
structural UI. Directional meaning (GOOD/BAD, up/down) always uses
`ArrowUp`/`ArrowDown`, never color alone.

---

## 7. Core components (`components/ui.tsx`)

Build screens from these; they encode the tokens so restyles cascade.

- **`Card`** — `rounded-2xl border border-line bg-surface p-6 shadow-card`.
- **`Button`** — `variant`: `primary` (gold, the one CTA), `secondary`
  (`bg-paper-2` outline), `danger` (`bg-loss`). Always `active:scale-[0.98]`,
  full-width in panels (`className="w-full text-lg"`), shows a busy label while
  async.
- **`Field` / `TextInput` / `Select`** — visible bold label, optional hint,
  `border-line-strong bg-paper`, focus → `border-brand`. Use semantic input
  `type`/`inputMode`.
- **`Toggle`** — switch with `role="switch"`, gold when on.
- **`Banner`** — `kind`: `error` (loss), `info` (play), `success` (gain); soft
  tint bg + matching border, `role="alert"`.

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
bar** (a flex bar: `bg-loss` width = % risky, `bg-gain` width = % safe) with the
% as the hero number and exact dollars quiet beneath — far more scannable than
columns of numbers.

**GOOD / BAD outcomes.** Soft-tint pill with an arrow icon inline; the dramatic
version (present mode) is a full-screen color flood + huge arrow + confetti on
good / shake on bad.

**Collapse the rarely-used.** Tuck infrequent controls behind a styled native
`<details>` disclosure (chevron rotates with `group-open:rotate-180`) to keep
panels compact.

**Long lists stay usable.** Any roster/list that can grow (lobbies, ticks) gets a
bounded `max-h-[…] overflow-y-auto` so primary actions never get pushed off-screen
— assume 100+ students.

**Cross-tab host preferences.** Host UI prefs that must sync between the control
tab and the projector tab use `localStorage` + a `storage` event listener (see
`useShowBots`), not React state.

**Loading / empty states.** Never ship a bare spinner only; use a short, on-brand
line (`text-ink-subtle`) and, for data, a helpful empty state ("appears after the
first round"). Prefer skeletons for >300ms loads.

---

## 9. Present / projector mode

Every game gets a dedicated **read-only big-screen view** for the projector while
the host drives from their laptop. Pattern (see `components/host/HostPresent.tsx`,
route `app/host/[sessionId]/present/page.tsx`):

- A **"Present"** link (Monitor icon, `target="_blank"`) on the lobby, the live
  control screen, and the summary.
- Read-only; auto-updates via the same realtime hooks as the control screen.
  Header = wordmark + a join-code chip (latecomers) + fullscreen toggle + exit.
- Covers all states: **lobby** (huge join URL + QR + live count), **in-progress
  open** ("Place your bets" + giant submitted/total), **locked** ("Revealing…"),
  **revealed** (full-screen GOOD/BAD `RevealTakeover` with confetti on good; a
  neutral "Results are in" when outcomes are per-player), **finished** (final
  standings). Big type throughout (`clamp()` sizes), medal podium for top 3.

---

## 10. Accessibility checklist (ship gate)

- [ ] Text contrast ≥ 4.5:1 (gold `#A16207`, gain `#047857`, loss `#BE123C` all
      pass on white/paper). Verify any new pairing.
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
app/globals.css          tokens, base type, focus rings, body texture, motion reset, slider/confetti CSS
tailwind.config.ts       color tokens, font families, shadows, keyframes/animations
app/layout.tsx           next/font wiring (Fraunces / Plus Jakarta / JetBrains Mono)
components/ui.tsx         Card, Button, Field, TextInput, Select, Toggle, Banner
components/icons.tsx      inline SVG icon set
components/Confetti.tsx   reduced-motion-aware celebratory confetti
components/host/HostPresent.tsx   projector/present-mode reference implementation
components/use-show-bots.ts       cross-tab preference pattern (localStorage + storage event)
```

**Starting a new game:** copy `globals.css`, `tailwind.config.ts`, the
`next/font` block in `layout.tsx`, `components/ui.tsx`, `components/icons.tsx`,
and `components/Confetti.tsx`. Build screens from `ui.tsx` primitives using the
semantic tokens, follow the patterns in §8–§9, and run the §10 checklist before
shipping.
