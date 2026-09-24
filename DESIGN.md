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
   open sections under a heavy ink rule; a list is ruled rows; a verdict is a
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
- **Sections, not cards.** Every game screen (host lobby / control / summary,
  projector, student waiting / round / finish, the host dashboard) is **one
  cream sheet**: `<main className="min-h-dvh bg-surface">`, no dot texture, and
  content grouped into open `Section`s — a 3px ink rule across the top
  (`SECTION` in `components/ledger.ts`), the `SectionTitle`, then content
  straight on the page. Two sections side by side sit in a grid with a wide
  gutter (`gap-x-12`); their rules line up. Inside a section, group with
  hairlines (`border-ink/15`) and whitespace, never another box.
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

- **`Section`** — the game screens' container: heavy ink rule, `SectionTitle`
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
- **`SectionTitle`** — every card heading: Archivo extra-bold, upper case,
  `text-lg sm:text-xl`, with an optional `info` (renders the `InfoTip` beside
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

**Primary-action placement.** Keep the main CTA pinned to the same spot across a
state machine so sequential actions are clickable in place (e.g. host control
panel: `Lock & reveal` while open and `Next round` after reveal occupy the same
top position). Put the button first; supporting context flows below it.

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

**Colour bands, not panels.** The student's verdicts — GOOD!/Down, "LOCKED IN",
starting and final wealth — run the full width of the screen (`-mx-5`) as a
solid band between 3px ink rules, with square ends. Colour does the work; there
is no rounded box around it.

**Rosters, not pill walls.** Names in the lobby are a ruled list in columns — a
small colour square, the name, the edit pencil — not a chip per student.

**Where the game is.** Every live screen says the round: the student's ink pill
carries a thin amber progress track under "Round 6 / 10"; the host's header
carries the **round track** — one segment per round, green/red once a shared
basic market resolves (ink otherwise), amber for the round in play (a single
bar past 40 rounds).

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
tab and the projector tab use `localStorage` + a `storage` event listener (see
`useShowBots`), not React state.

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
sheet as every game screen, at stage size — open sections under heavy rules,
the leaderboard a scoreboard-sized ledger. The solid blocks are the objects
the room reads: the ink join-code block, the white QR, the verdict block, the
podium.

- A **"Present"** link (Monitor icon, `target="_blank"`) on the lobby, the live
  control screen, and the summary.
- Read-only; auto-updates via the same realtime hooks as the control screen.
  Header = wordmark + a join-code chip (latecomers) + fullscreen toggle + exit.
- Covers all states: **lobby** (giant mono join code — one tile per character,
  landing in turn — + QR + live count on an ink panel with `shadow-lift-brand`,
  and the newest ~36 names popping in as chips), **in-progress open** ("Place
  your bets" + huge rolling submitted/total + a chunky meter; "Everyone's in"
  when it fills), **locked** (a "Bets are locked" stamp), **revealed**
  (full-bleed GOOD/BAD `RevealTakeover` — slow-turning sunburst rays, the arrow
  flying in from its direction, the headline stamping down, confetti on good; a
  neutral "Results are in" when outcomes are per-player), **finished** (a
  **podium** — 2-1-3 blocks rising third-first, balances rolling up from the
  starting wealth, confetti — then places 4+ as a list). Big type throughout
  (`clamp()` sizes).
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
`next/font` block in `layout.tsx`, `components/ui.tsx`, `components/use-count-up.ts`,
`components/icons.tsx`, and `components/Confetti.tsx`. Build screens from `ui.tsx` primitives using the
semantic tokens, follow the patterns in §8–§9, and run the §10 checklist before
shipping.
