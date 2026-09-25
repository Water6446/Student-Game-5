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
2. **Printed, not boxed.** Content sits on the page, grouped by rules and
   headings — not inside containers. A game screen is one cream sheet with
   open sections under an ink rule; a list is ruled rows; a verdict is a
   full-width colour band. Boxes are for real objects only: a button, an input,
   a stamp, the join-code block. Card inside card, row-box inside that, pill
   inside that is the "everything is a bubble" look, and it is banned (§4
   "Sections, not cards"). Hard ink offset shadows are rarer still (§4
   "Elevation budget"). Text sits on a solid fill — the cream sheet or a band —
   never on the dot texture.
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
  --paper-inverse: 246 239 221; /* #F6EFDD cream text ON dark ink panels */

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

  --gain-bright: 94 211 142;  /* #5ED38E up, ON INK ONLY (the ticker tape) */
  --loss-bright: 255 122 102; /* #FF7A66 down, ON INK ONLY */
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
- `gain-bright` / `loss-bright`: up and down **on an ink ground** — the ticker
  tape. The regular `gain`/`loss` fail contrast on ink; these pass it. Never
  on paper or surface (they fail there instead).
- `paper-inverse` (cream): the text colour **on** a dark `bg-ink` panel — the
  join-code block in the lobby and present views. Use `text-paper-inverse` and
  its opacity modifiers (`/70`, `/80`) for the quieter lines in that block; never
  `text-paper`, which is the page ground and reads dingy against ink.

Tailwind maps them (see `tailwind.config.ts`):

```ts
const token = (n: string) => `rgb(var(${n}) / <alpha-value>)`;
colors: {
  paper: { DEFAULT: token("--paper"), 2: token("--paper-2") },
  surface: token("--surface"),
  ink: { DEFAULT: token("--ink"), muted: token("--ink-muted"), subtle: token("--ink-subtle") },
  line: { DEFAULT: token("--line"), strong: token("--line-strong") },
  brand: { DEFAULT: token("--brand"), strong: token("--brand-strong"), soft: token("--brand-soft") },
  gain: { DEFAULT: token("--gain"), soft: token("--gain-soft"), bright: token("--gain-bright") },
  loss: { DEFAULT: token("--loss"), soft: token("--loss-soft"), bright: token("--loss-bright") },
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
- **Radius:** the scale is tightened in `tailwind.config.ts` — printed-ticket
  corners, not soft bubbles: cards `rounded-2xl` (12px), controls/inputs/panels
  `rounded-xl` (8px), small blocks `rounded-lg` (6px), present-mode panels
  `rounded-3xl` (16px). `rounded-full` is for true tags and round things only
  (a dot, the round pill, a switch) — never a number, a delta or a status.
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
    "card-hover": "4px 4px 0 rgb(var(--ink))", // hover half of the press affordance
    "lift-brand": "6px 6px 0 rgb(var(--brand)), 6px 6px 0 2px rgb(var(--ink))",
  }
  ```
- **One frame, subdivided — not cards.** Every game screen (host lobby /
  control / summary, projector, student waiting / round / finish) is **one
  cream sheet**: `<main className="min-h-dvh bg-surface">`, no dot texture, a
  **paper masthead** on top, and its content tiled into **panels** — one ink
  frame split by ink lines, each panel with a title strip (`PanelGrid` /
  `Panel`, §8 "The trading floor"). Panels touch; they never float apart with
  gutters between them. Inside a panel, group with hairlines (`border-ink/15`)
  and whitespace, never another box. Site pages that are not game screens (the
  host dashboard, the join form) keep open `Section`s — a 2px ink rule across
  the top (`SECTION` in `components/ledger.ts`), the `SectionTitle`, then
  content straight on the page.
- **Cards** — `rounded-2xl border-2 border-ink bg-surface p-6 shadow-card` —
  are for a standalone form or dialog on a site page (sign in, account panels,
  a status page, confirm dialogs), not for grouping content on a game screen.
- **Elevation budget.** A hard shadow means "this is an object"; spend it on
  (1) top-level cards and panels, (2) the **one** headline action on a screen
  (`shadow-pop`), and (3) moments — a stamp, the trophy medallion, the podium,
  the "came out on top" strategy. Everything inside a card is **flat**: inputs,
  number fields, `Segmented`, `ChipButton`/`ChipRow`, `Toggle`, `Banner`, meters,
  inner panels, list rows, badges, secondary buttons (which lift and gain their
  shadow only under the pointer). An input gains `shadow-card` on focus — the
  field you're typing in is the one that rises. If a screen has more than a
  handful of shadows, something inside a card is raised that shouldn't be.
  **On an ink-filled (`bg-ink`) panel use `shadow-lift-brand`, never
  `shadow-lift`**: an ink offset under an ink panel is invisible except as a
  jagged notch at two corners, which reads as a rendering glitch. The amber block
  keeps the offset legible, and its ink outline ties it back to the system.
- **Press affordance:** interactive elements **rise toward the pointer on hover**
  (up-left 1px, shadow grows to `card-hover`) and **press flat on `:active`**
  (down-right 2px, shadow gone). It lives in one string, `PRESSABLE` in
  `ui.tsx`; `Button`, `ChipButton` and `buttonClasses()` (the same styling for a
  `<Link>`) all use it, so a link and a button side by side behave alike.
  Disabled controls neither lift nor press.
- **Ink on ink:** nothing ink-filled carries an ink offset — not a panel, a pill,
  an active tab or an active chip. An ink offset under an ink block only shows
  as a notch at two corners. Panels and pills use an **amber** offset
  (`shadow-lift-brand`, or `shadow-[3px_3px_0_rgb(var(--brand))]` for buttons
  sitting on an ink panel); active tabs and chips use the pressed state (no
  shadow, shifted 2px) per the active-nav pattern in §8.
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
| `animate-pop-in` | Card / panel / banner entrance (scale+fade, ~0.32s). |
| `animate-rise` | Section entrance; with `.stagger` + `--i`, list rows arriving in turn. |
| `animate-count-pop` | A result number landing; the newest outcome tile; a count that changed. |
| `animate-stamp` | **A verdict landing** — "LOCKED IN", "MARKET UP!", "You're in": oversized and tilted, it slams down and settles at −2°. The game-show beat; one per moment. |
| `animate-rise-tall` / `animate-drop-in` | Podium blocks rising; the reveal arrow flying in from the direction it points. |
| `animate-confetti` | Celebratory burst (`Confetti.tsx`): ink-outlined paper pieces that sway (`--drift`) and tumble (`--spin`). Wins, GOOD reveals, the podium. |
| `animate-shake` | A negative result (the student's BAD reveal card). |
| `animate-pulse-soft` / `animate-bob` | Idle "waiting" states: dots pulse, the lobby medallion bobs. |
| `animate-ping` | The live dot on the host's "Open" status pill. |
| `animate-spin-slow` | The sunburst rays behind a projector reveal takeover. |
| `animate-fade-in` | Dialog backdrops. |
| `animate-ticker` | The ticker tape sliding left, forever — only when Settings → Fun turns it on; pauses under the pointer or focus, stands still under reduced motion (§8 "The trading floor"). |
| `animate-flap` | A split-flap tile turning over to a new character; tiles land in turn (`animationDelay: i * 70ms`). Keyed on the character, so only changed tiles flip. |
| `CountUp` / `useCountUp` | **Numbers roll, they don't jump.** A student's new wealth rolls from the pre-round balance; the final wealth from the starting wealth; the projector's balances and the submitted counters roll on every change. Display only — screen readers get the final value once. |

- **Stagger** long lists with `className="stagger animate-rise"` and
  `style={{ "--i": Math.min(i, 12) }}` — capped so row 100 doesn't wait five
  seconds. Rows animate on mount only; realtime re-sorts move them without replay.
- **Budget:** at most one `stamp` and one roll per screen state. Motion marks a
  beat (a lock, a reveal, a finish), never a hover on a static card.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:.001ms!important; animation-iteration-count:1!important;
    transition-duration:.001ms!important; scroll-behavior:auto!important;
  }
  .confetti-piece { display:none; }
}
```

The reset also zeroes `animation-delay`, so staggered and delayed entrances land
instantly instead of staying hidden; `useCountUp` snaps straight to the value.

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
gets `border-2 border-ink`; only cards and the headline button carry
`shadow-card` at rest (§4 "Elevation budget").

- **`Masthead`** (`components/Masthead.tsx`) — the top of every host game
  screen, in two layers. The **toolbar**: a cream strip with its own ink rule,
  the back link and the session crumbs (`Session KXQ7P / Basic / Live`,
  `SessionCrumbs`) on the left, the secondary tools as full-height cells split
  by hairlines on the right (`TOOL` / `TOOL_DANGER`: Present, Settings, Finish
  early, Delete — icons only on a phone). Then the **title band**: warm paper,
  the big display title, a text status, the screen's **one primary action**
  (top right, full width under the title on a phone), and a strip under them
  (the line score). Housekeeping never sits beside the game's title. One per
  screen, always.
- **`Section`** — the game screens' container: ink rule, `SectionTitle`
  (with optional `info`, `icon`, `action`), content on the page. See §4.
- **`Card`** — `rounded-2xl border-2 border-ink bg-surface p-6 shadow-card`.
  Standalone forms and dialogs only (§4).
- **`Button`** — `variant`: `primary` (electric blue, navigational CTAs),
  `gold` (amber fill, **ink** text — the headline "lock in / start" CTA),
  `secondary` (`bg-surface` outline → `hover:bg-paper-2`), `ghost` (borderless,
  for toolbar actions like "Finish early" / "Delete"; add `text-loss
  hover:bg-loss-soft` for a destructive one), `success` (`bg-gain`), `danger`
  (`bg-loss`). `size`: `md` (48px, everything a player acts on) or `sm` (toolbars
  and header rows: 40px from `sm` up, 44px on phones for the touch target). Base: `border-2 border-ink ... shadow-card
  font-display font-extrabold` + `PRESSABLE`. Full-width in panels
  (`className="w-full text-lg shadow-pop"` for the headline one), shows a busy
  label while async. A `<Link>` that looks like a button uses
  `buttonClasses(variant, size, extra)`.
- **Which colour is which CTA** (the host's pinned action included): **gold** for
  the beats — Start the game, Lock & reveal, Lock allocations, Reveal results,
  Finish game, Create session, Lock in my bet, Enter the market. **Blue** for
  moving on — Next round / Next year, Sign in. `danger` only for irreversible
  destruction, and those sit behind a confirm; ending a game after its last round
  is the natural end, not a destructive act.
- **`SectionTitle`** — every section heading: a *label*, not a headline —
  Archivo extra-bold, 13px, upper case, tracked `0.1em`. The masthead title is
  the page's one big heading. Min-height 36px so side-by-side sections line up
  whether or not one has a switch beside its title. Optional `info` (renders the `InfoTip` beside
  it), `icon`, and `action` slot on the right (a `BotToggle`, a "Show all").
  Don't hand-roll `<h2>` styles inside cards.
- **`NumberField`** — money/percent input: 48px, mono, tabular, right-aligned,
  `prefix="$"` or `suffix="%"` pinned so it never overlaps the digits, native
  spinner hidden (`.no-spinner`). The only number input in the student screens.
- **`Segmented`** — mutually exclusive options ($ / %): ink-bordered pill whose
  active option sits on an ink block that **slides** between positions;
  `aria-pressed` per option, `label` names the group.
- **`ChipButton`** — a preset ("25%", "Split evenly", "All cash", "2×"): 44px,
  ink border, flat. `active` marks the preset matching the current value (ink
  fill, cream text), so the row doubles as a readout.
- **`ChipRow`** — wrap related presets in it and they join into **one ruled
  bar** (`0% | 25% | 50% | 75% | 100%`) instead of five separate boxes. Use it
  for any set of presets that fits one line.
- **`CountUp`** — see §5.
- **`Field` / `TextInput` / `Select`** — visible bold label, optional hint,
  `border-2 border-ink bg-surface font-semibold`, flat at rest; focus → the
  brand ring plus `shadow-card` (the active field rises). Use semantic input `type`/`inputMode`. `hint` stays on screen (format
  limits like "0–1", why a control is disabled); `info` puts background (what the
  setting does, its default) behind an `InfoTip` beside the label.
- **`InfoTip`** — a small ink-muted `Info` icon that reveals an explanation on
  hover, keyboard focus or tap (a tap pins it; tap elsewhere / Escape / blur
  closes). The panel is a `bg-surface` card with an ink border and `shadow-card`,
  portalled and fixed-positioned so no scroller clips it, clamped to a 16px
  gutter. Give it a `label` naming what it explains ("About the standings").
  Place it **beside** a heading (a flex row with the `h2`), never inside the
  `h2`, a `<label>`, or another button.
- **`Toggle`** — switch with `role="switch"`; ink `border-2`, track on = `bg-play`
  (blue), knob white with a thin ink border, slides. The **label names the
  setting and never changes with state** ("Students can see the odds", not
  "Odds shown" / "Odds hidden"); the switch carries the state. `BotToggle` is
  the compact pill version for a card header.
- **`Banner`** — `kind`: `error` (loss), `info` (play/blue), `success` (gain);
  `rounded-xl border-2 border-ink shadow-card`, soft-tint fill + matching text,
  **a leading icon per kind** (alert / info / check) so the kind never rests on
  colour, pops in, `role="alert"`. For something the person must read or act on
  in place.
- **`Skeleton` / `SkeletonCards` / `PageSkeleton`** — `animate-pulse-soft` blocks
  in `bg-ink/10`. `PageSkeleton` is a whole loading page (its own `<main>`, at
  the page's width); `SkeletonCards` is the same body for pages that already
  render the site header. Never a bare "Loading…" line.

Beyond `ui.tsx`, the app-wide pieces (all mounted or used from `app/layout.tsx`):

- **Toasts** (`components/Toast.tsx`, `useToast()`) — bottom-right (bottom-centre
  on phones) card, ink border, round tone icon, auto-dismiss (errors linger),
  pause on hover. Confirms an action just taken: "Profile saved", "Join link
  copied", "Deleted …". Not for anything that needs a decision or a fix.
- **Confirm dialog** (`components/ConfirmDialog.tsx`, `await useConfirm()({…})`)
  — replaces `window.confirm`. Title, short body, a confirm label that names the
  action ("Delete session", never "OK"), `tone: "danger"` for anything
  irreversible. Focus starts on Cancel; Escape and the backdrop cancel.
- **`StatusPage`** — dead ends in site chrome: 404, error, "Session not found",
  "You haven't joined this game". One amber primary action, quiet secondary links.
- **`ConnectionBanner`** — mounted by the live screens (host control, projector,
  play). A pill at the top when offline or when the realtime socket is down past
  a 4s grace; offers Refresh, and says "Back online — refresh to catch up" after,
  because the realtime hooks do not replay missed events.
- **`SkipLink`** — "Skip to content", first in the tab order on every page,
  focuses the page's `<main>`.
- **Tab titles** — the root metadata template is `%s · The Risk Game`. Static
  pages export `metadata.title` (client pages get a route `layout.tsx` that
  does); live screens call `useDocumentTitle()` with state from
  `sessionTabTitle()` — "Round 3/25 · ABCD", "Projector · ABCD".

**Focus:** every interactive element gets a visible ring —
`focus-visible:ring-2 ring-brand ring-offset-2 ring-offset-paper` (set globally
in `globals.css`).

---

## 8. Reusable patterns

**The trading floor** (`components/terminal.tsx`). Game screens borrow their
structure from four places a room already knows how to read, so data sits in a
frame instead of floating in bubbles:

- **`PanelGrid` + `Panel` — a Bloomberg terminal.** One screen tiled into
  panels split by sharp lines. `PanelGrid` is `grid gap-[2px] rounded-xl
  border-2 border-ink bg-ink`: the 2px gap lets the ink ground show through, so
  neighbouring panels share one line. Every cell must be filled (span the last
  one, `lg:col-span-2`) or ink shows as a hole. A `Panel` is a title strip —
  small tracked caps (`0.75rem`, `tracking-[0.12em]`) on `bg-paper-2`, with an
  optional `InfoTip`, a mono `meta` figure and an `action` at the right end —
  over its body. Content that should fill a panel edge to edge (a verdict band,
  a ruled list) takes `bodyClassName="p-0 sm:p-0"` rather than negative
  margins. `size="lg"` is the projector's: taller strip, `text-base` title.
  Plain cells are allowed too: a coloured `div` (the student's final-wealth
  cell) or a `dl` of ruled cells (`grid gap-[2px] bg-ink`, each cell
  `bg-surface`) sits straight in the grid.
- **`StatStrip` — an exchange's market-data row.** The key figures across the
  top of a screen, under the masthead: tracked label, mono figure, one quiet
  line of context (`+355% since the start`, `8/8 submitted`). Two per row on a
  phone (an odd last cell spans the row), all in one row from `sm`. `tone`
  colours a figure only when it is a verdict or a rate; a **balance** (class
  average, median) stays ink and its change line takes the colour
  (`subTone`). `spark` adds a `Sparkline` beside the figure — a muted line
  over a dashed baseline at the first value, the latest point dotted green or
  red, values in its tooltip — from `md` up, and only in strips of five or
  fewer (a sixth cell leaves no room; the figure wins).
- **`Ticker` — a news channel's tape.** The latest round's results on an ink
  strip: the market's verdict, class average, average move, leader, best and
  worst move, dollars at risk, wipe-outs (`components/host/round-feed.ts`
  derives them — pure, humans only, from the same rows as the standings, so the
  tape never disagrees with the table). **It stands still by default**: a
  moving strip competes with the standings for the eye. Still, it is a row of
  ruled cells led by the verdict on amber, sliding sideways by hand on a
  phone, and it leaves off the figures the key-figure strip already shows
  (`TickerItem.secondary`). **Scrolling is a Fun setting** (below): two copies
  slide one copy's width, so it loops without a seam; longer tapes run longer
  (`max(24, n × 6)s`); it **pauses under the pointer or keyboard focus** (WCAG
  2.2.2) and stands still under reduced motion. Up/down use
  `gain-bright`/`loss-bright` with arrows. On the control screen it runs under
  the masthead; on the projector, along the bottom edge (`size="lg"`). It is a
  summary — nothing lives only on the tape.
- **`FlapText` — a station's split-flap board.** A code or counter shown as
  characters on dark tiles with a hinge line; changed tiles turn over in turn.
  Used for the join code (lobby, projector lobby and header) and the
  projector's round counter. `onInk` lightens the tiles for an ink panel.
  `aria-label` carries the whole string; the tiles are hidden.

- **`LineScore` — a baseball line score** (`components/host/LineScore.tsx`).
  The game's progress, in the host masthead (control screen, lobby, summary)
  and at the foot of the projector's "This round" panel (`size="lg"`): one
  ruled column per round, its number over what the market did — green ↑ / red
  ↓ for a shared basic market, the index's return for a manager year, "3/4"
  assets up for a portfolio, a dot for independent draws — row labels on the
  left and a **Total** column on the right, as a scoreboard has. The round in
  play is amber (a pulsing dot while open, a lock once locked) and its number
  is printed in reverse. The lobby shows it empty: how long the game will run.
  Past a dozen rounds a phone keeps the colours and drops the figures; past 30
  it falls back to slim segments, past 40 to one bar.
- **Sign-in sheets.** A roster that fills in — the lobby's players, the
  control screen's submissions — is a grid of ruled cells
  (`border-l border-t` on the list, `border-r border-b` on each cell, hairline
  ink), not a column of lines or a wall of pills. A submitted cell fills
  `bg-gain-soft` with a green check; waiting ones sort first, so the gaps are
  the first thing the host reads.

**Standings are a timing tower** (F1's, on a broadcast). Columns: position (a
`RankBadge`), **movement** since the last round (`▲2` green / `▼1` red / a dash,
from `rankMovement()` in `lib/game/results.ts`), a **colour key** bar that
matches the player's line on the wealth chart (`seriesColors()` in
`WealthChart.tsx` — the table is the chart's legend), name, stats, **gap to the
leader** (`−$1,130`, or "Leader"), then wealth — the manager game drops Gap,
since its wealth cell already carries the year's and the annualized return, and
its Sharpe and fee columns need the room. On a phone the tower collapses
to two lines and shows movement beside the name only when there was one. The
student's own row carries the tower's highlight: a `bg-play-soft` band with a
4px `play` bar on its left edge.

**The console layout.** The host control screen reads like the projector
board: this round's panel over the wealth chart on the left (`5fr`), the
standings tower down the full height on the right (`7fr`), the history
across the foot. The host dashboard follows the same build under the site
header: a paper title band, a key-figure strip (sessions, live now, players,
rounds played, last game), then one frame — the live session across the top,
the game picker as three ruled columns, your sessions beside how to run one.

**Fun settings** (`components/SettingsMenu.tsx`, `components/use-fun.ts`).
The gear in the toolbar (and the projector header) opens a small panel whose
"Fun" section holds the flourishes a host can switch per device: **Scrolling
ticker tape** (off by default), **Flip-board tiles** and **Confetti** (on).
The same switches sit on the account page. A flourish never carries
information that is not on the screen without it, so switching one off loses
nothing. Each reads `useFun(name)`; the primitive checks it itself (`Ticker`,
`FlapText`, `Confetti`), so callers do nothing.

**Primary-action placement.** Keep the main CTA pinned to the same spot across a
state machine so sequential actions are clickable in place. On every game
screen that spot is the **masthead's top right**: `Start the game` in the
lobby, then `Lock & reveal` / `Next round` / `Finish game` on the control
screen, all in one place, so the host never hunts for the button. It is the
only raised (`shadow-pop`) control on the page; the body below is data.

**Tables line up.** Standings and allocations are grids, not flex rows: small
tracked column heads (`#`, Player, Luck, Last 5, Wealth) over rows whose
figures sit in fixed-width columns, so a column of numbers reads as one. An
allocation is one line — name, risk bar, % at risk, dollars at risk — with the
full split in the row's tooltip.

**Balances are ink; changes are coloured.** A wealth figure in a standings row,
leaderboard or header is `text-ink` — green says "gained", and a $30 balance
after a wipe-out did not gain. The colour goes on the *change* beside it: a
this-round delta chip (`bg-gain`/`bg-loss` + arrow), outcome tiles, a signed %.
Result blocks that are verdicts (the student's "Final wealth", the host's "If
everyone had picked one strategy" cards) are toned by the outcome against the
starting wealth — green above, red below, neutral level — never by which
strategy or player they are.

**Lists are ledgers, not stacks of cards.** Standings, leaderboards, strategy
comparisons and the manager reveal are ruled like a printed scoreboard:
`LEDGER` (`components/ledger.ts` — hairlines above, between and below; the
Section's heavy rule and heading sit over it) around `LEDGER_ROW`s (padding + a quiet amber hover band). A row is
never its own bordered, shadowed box. Each row: a `RankBadge` first (amber
block for 1st, bold ink numbers for 2nd–3rd, a quiet number after), name, stats,
then the balance. "You" is a `bg-play-soft` band with a small blue "you" label,
not a pill. The projector's leaderboard is the same ledger at scoreboard size
(`border-y-[3px]`, 1st on an amber band). Outcome history renders as
`OutcomeChips`: 16px borderless squares, green-up / red-down, newest pops in —
a data strip, not a row of buttons. Stat groups (rank / Sharpe / luck) are one
ruled strip with column dividers, not three tiles.

**Deltas are text.** A change — "+$54.48 this round", a leaderboard delta, "you
+$858" — is coloured mono text with an arrow, never a filled pill. A status is
text too: the host's OPEN / LOCKED / REVEALED is a coloured label with a dot.

**Colour bands, not boxes.** The student's verdicts — GOOD!/Down, "LOCKED IN",
starting and final wealth — are solid colour with square ends: a full-width
band under the masthead (the reveal), or a whole cell of the screen's
`PanelGrid` (the starting-wealth ticket, the final-wealth slip, the locked
band filling its panel). Colour does the work; there is no rounded box inside
the frame.

**Rosters, not pill walls.** Names in the lobby — the host's and the
projector's — are ruled: a small colour square, the name (and, for the host,
the edit pencil), in a sign-in sheet's cells on the host lobby and ruled
columns on the projector; never a chip per student. A status beside a name or
a session (ACTIVE / FINISHED / LOBBY) is coloured text with a dot, not a pill.

**Where the game is.** Every live screen says the round: the student's ink pill
carries a thin amber progress track under "Round 6 / 10"; the host's
masthead carries the **line score** (above) — every round, what it did, and
the total. Progress bars are slim and borderless everywhere (the submission
meter too): a bar is data, not an object.

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

**Explain on demand.** Screens show what a player needs to act; the "why" sits
behind an `InfoTip`. A subtitle that explains a card ("The index charges no
fees…"), a legend, a statistical aside or a disclaimer goes in the tip next to
the card's heading. Keep on screen: instructions for the current step ("Choose
how much to put at risk, then lock it in"), why a button is disabled, validation
rules and warnings. On the projector a tip opens only when the host hovers it,
so the room sees the tip only when the host chooses to show it.

**Collapse the rarely-used.** Tuck infrequent controls behind a styled native
`<details>` disclosure — summary `min-h-[44px] rounded-xl border-2 border-ink
bg-paper-2 hover:bg-brand-soft`, chevron on the right rotating with
`group-open:rotate-180` — to keep panels compact.

**Long lists stay usable.** Any roster/list that can grow (lobbies, ticks) gets a
bounded `max-h-[…] overflow-y-auto` so primary actions never get pushed off-screen
— assume 100+ students.

**Cross-tab host preferences.** Host UI prefs that must sync between the control
tab and the projector tab use `useSyncedPreference`: `localStorage` + a
`storage` event listener for other tabs, plus a same-tab window event so a
settings menu and the component it controls agree without sharing state (see
`useShowBots`, `useFun`). Not React state.

**Active nav/step.** Active tab = solid ink fill + cream text + pressed offset;
inactive = `bg-surface` + ink border + shadow. Drive via conditional classes.

**Site header** (`components/marketing/SiteHeader.tsx`). A solid `bg-surface`
bar with a `border-b-2 border-ink` edge, sticky, 64px. Rules that keep it still:
- **Mounted once**, in the root layout (`SiteHeaderGate`), never per page — so
  it survives navigation. Game screens (`/play/<id>`, `/host/<id>`, the
  projector) opt out in `lib/site-chrome.ts`. Pages do not render it.
- **Wide screens:** a `1fr auto 1fr` grid — wordmark, section links at the true
  centre, actions right. **Below `lg`:** wordmark, one amber action (Join — the
  phone audience is students) and a menu button opening a sheet with every link.
- **Nothing changes size with who is looking.** Both auth variants are rendered
  and CSS shows one (`.auth-out` / `.auth-in` off `html[data-auth]`, set before
  first paint). Keep them the same width; labels do not change with state.
- **No link hides on its own page.** Text links show current with the amber
  underline hover uses; the amber pill shows current as the active-nav pattern
  above. Mark it with `aria-current`.
- Anything needing supabase-js loads as an async chunk behind a same-size
  skeleton (`header-account.tsx` / `header-account-skeletons.tsx`).

**Loading / empty states.** Never ship a bare spinner only; use a short, on-brand
line (`text-ink-subtle`) and, for data, a helpful empty state ("appears after the
first round"). Prefer skeletons for >300ms loads.

---

## 9. Present / projector mode

Every game gets a dedicated **read-only big-screen view** for the projector while
the host drives from their laptop. Pattern (see `components/host/HostPresent.tsx`,
route `app/host/[sessionId]/present/page.tsx`): the projector is the same cream
sheet as every game screen, at stage size — one `PanelGrid` of `size="lg"`
panels filling the screen, the ticker tape along the bottom edge. The solid
blocks are the objects the room reads: the ink join panel, the white QR, the
verdict block, the podium.

- A **"Present"** link (Monitor icon, `target="_blank"`) on the lobby, the live
  control screen, and the summary.
- Read-only; auto-updates via the same realtime hooks as the control screen.
  Header = wordmark + a join-code chip (latecomers) + fullscreen toggle + exit.
- Covers all states: **lobby** (two panels: "Join the game" — an ink body with
  the split-flap join code and the QR — and "In the room" — the live count,
  huge, over a three-column ruled roster of the newest ~36 names; a manager
  game shows the line-up there instead), **in-progress open** ("Place
  your bets" + huge rolling submitted/total + a chunky meter; "Everyone's in"
  when it fills), **locked** (a "Bets are locked" stamp), **revealed**
  (full-bleed GOOD/BAD `RevealTakeover` — slow-turning sunburst rays, the arrow
  flying in from its direction, the headline stamping down, confetti on good; a
  neutral "Results are in" when outcomes are per-player), **finished** (a
  **podium** — 2-1-3 blocks rising third-first, balances rolling up from the
  starting wealth, confetti — then places 4+ in a "The rest of the class"
  panel). Big type throughout (`clamp()` sizes).
- **The live board:** "This round" (status, with a split-flap round counter
  in its strip and the line score along its foot) over the wealth chart on
  the left; the standings tower spanning both rows on the right, with the
  class's market luck in its strip; the ticker tape under all of it. The
  header carries the settings gear, so the host can set the tape running
  from the projector itself.
- The live leaderboard shows each player's **change this round** (a delta chip),
  not the market's arrow: in a shared up-market an all-safe player gained
  nothing, and a player can lose money in a good round.
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
app/globals.css          tokens, base type, focus rings, body dot texture, motion reset, slider/confetti CSS, .stagger / .no-spinner / .bg-dots utilities
tailwind.config.ts       color tokens, font families, hard-offset shadows, keyframes/animations
app/layout.tsx           next/font wiring (Archivo / Hanken Grotesk / Fraunces italic / JetBrains Mono)
components/ui.tsx         Card, Button (+ buttonClasses, PRESSABLE), SectionTitle, Field, TextInput, NumberField, Select, Segmented, ChipButton, ChipRow, Toggle, Banner, InfoTip, CountUp, Skeleton/SkeletonCards/PageSkeleton
components/Toast.tsx      useToast() — action confirmations
components/ConfirmDialog.tsx  useConfirm() — the styled replacement for window.confirm
components/StatusPage.tsx 404 / error / not-found dead ends, in site chrome
components/marketing/SiteHeader.tsx   the site header (see §8); SiteHeaderGate.tsx mounts it; header-account.tsx is its lazy account menu
lib/site-chrome.ts        which routes show the header; current-page matching
components/ConnectionBanner.tsx  offline / realtime-down pill for live screens
components/use-count-up.ts       useCountUp() — the rolling-number hook behind ui.tsx's CountUp
components/RankBadge.tsx         the standings rank (amber block for 1st, bold ink for 2nd–3rd)
components/ledger.ts             SECTION (open-section rule), LEDGER / LEDGER_ROW (ruled lists)
components/Masthead.tsx          the paper band atop every game screen: title, status, tools, the one action
components/terminal.tsx          the trading floor: PanelGrid / Panel, StatStrip, Ticker, FlapText (§8)
components/host/round-feed.ts    roundFeed() + tickerItems(): the latest round's figures for the tape and strips (+ the class-average sparkline)
components/host/LineScore.tsx    the line score: every round's result in ruled columns, with a total
components/host/SessionCrumbs.tsx  the toolbar's "Session KXQ7P / Basic / Live"
components/host/HostDashboard.tsx  the host dashboard's body (app/host/page.tsx only loads the data)
components/SettingsMenu.tsx      the gear menu and its Fun section (FunSettingsList, also on /account)
components/use-fun.ts            the Fun settings: ticker scroll, flip tiles, confetti — per device, synced across tabs
components/OutcomeChips.tsx      outcome history as ink-edged up/down tiles
components/icons.tsx      inline SVG icon set
components/Confetti.tsx   reduced-motion-aware celebratory confetti
lib/design/colors.ts      the tokens as literal colour strings, for Recharts and inline styles
components/host/HostPresent.tsx   projector/present-mode reference implementation
components/CondensedList.tsx      top-N + "+N more" + bottom-M collapse for every player list
components/LuckChip.tsx           signed luck vs the expected GOOD rate (clover + ± percentage)
components/ManagerYearResult.tsx  manager game: one year's market + every manager's return
components/FeeCounter.tsx         running fee total in loss tone, host only (students see fees at the end)
components/ManagerProspectus.tsx  manager cards: fee in the description, 10-yr track record, inline SVG sparkline
components/ManagerReveal.tsx      the end-of-game truth: true alpha vs. what was delivered
components/host/ManagerSetup.tsx  host-only manager editor (presets, per-manager alpha/beta/fees)
components/use-manager-truth.ts   get_manager_truth() — the only route to the real parameters
components/use-synced-preference.ts  cross-tab preference pattern (localStorage + storage event)
components/use-show-bots.ts       the bot toggle, built on use-synced-preference
components/use-round-phase.ts     the round phase a screen should DISPLAY (gates stale rounds, swallows the auto-mode lock)
components/use-hotkeys.ts         window keyboard shortcuts, guarded against typing and browser/OS keys (deliberately unadvertised — no legend UI)
```

**Starting a new game:** copy `globals.css`, `tailwind.config.ts`, the
`next/font` block in `layout.tsx`, `components/ui.tsx` (with `button-classes.ts`),
`components/use-count-up.ts`, `components/icons.tsx`, `components/Confetti.tsx`,
`components/Masthead.tsx`, `components/ledger.ts` and `components/terminal.tsx`
(with `lib/design/colors.ts`). Build screens from `ui.tsx` primitives using the
semantic tokens, follow the patterns in §8–§9, and run the §10 checklist before
shipping.
