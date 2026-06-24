# Handoff: "Academy Arcade" — The Risk Game UI Refresh

## Overview
This package redesigns the entire visual layer of **The Risk Game** (the live, in-class
investment-risk simulation). It replaces the current "Parchment Pro / Claude-ish" look
(warm cream, Fraunces serif headings, soft gold, soft shadows) with **"Academy Arcade"**:
the same warm-paper academic foundation, but rebuilt with **ink-black borders, hard offset
shadows, saturated color blocks, and big bold grotesk headlines** — a confident, game-show
energy that still reads as a finance classroom tool and stays legible on a projector.

**Functionality does not change.** This is purely a styling/skin refresh. All game logic,
state, hooks (`use-round`, `use-players`, etc.), routing, and the Supabase/realtime wiring
stay exactly as they are. Do **not** touch behavior — only presentation.

## About the design files
The file in `reference/` (`The Risk Game - Redesign.dc.html`) is a **design reference**, not
production code. It is a self-contained HTML/JS prototype that shows the intended look and
behavior across every screen. **Do not copy its markup into the app.** Your job is to
**recreate this look inside the existing Next.js + React + TypeScript + Tailwind codebase**,
using its established patterns (the token system in `globals.css` + `tailwind.config.ts`, the
shared primitives in `components/ui.tsx`, the existing component files). To open the reference,
serve the `reference/` folder over HTTP (e.g. `npx serve reference`) and open the `.dc.html`
file — it needs `support.js` as a sibling, which is already included.

The reference has a top nav (Landing / Student / Host / Projector) and sub-tabs that let you
walk every state. Use it as the source of truth for color, type, spacing, borders, and shadows.

## Fidelity
**High-fidelity.** Colors, typography, borders, radii, and shadows are final and exact — match
them. Spacing/sizing should match closely; you may adapt to the codebase's existing spacing
scale where reasonable.

---

## The system (read this first)
Three type roles, applied consistently everywhere:
1. **Archivo (700–900)** — punchy headlines, big numbers, button labels, leaderboard names. *(replaces Fraunces as the display face)*
2. **Fraunces italic (400–600)** — the "professor's voice": instructional captions, subtitles, helper text. *(Fraunces stays, but italic-only and demoted to editorial accents)*
3. **JetBrains Mono (500–800)** — ALL money, percentages, codes, round counters. *(unchanged — already in use)*

Visual signature:
- **Ink-black borders** (`#211A12`) on essentially every surface, **2–2.5px** wide. This is the single biggest change — current borders are light (`--line`); they become ink.
- **Hard offset shadows** — solid ink, **no blur**: `3px 3px 0 #211A12` for cards, up to `6–8px` for hero elements. Replaces the soft `shadow-card`.
- **Saturated color blocks** with ink borders: amber `#F0A92B`, electric blue `#2557E8`, gain green `#1F8A4C`, loss red `#DB3B2B`.
- **Press feedback:** interactive elements shift down-right and drop their shadow on `:active` — `translate(2px,2px)` + `shadow-none`.
- Warm paper page (`#EBE3D0`) with a faint **ink dot-grid** texture (keep the dots; drop the gold corner-glow gradient).

---

## Implementation strategy — token-first
Because the app is fully token-driven, ~70% of the refresh lands by editing **three files**:
`app/layout.tsx` (fonts), `app/globals.css` (CSS variable values + slider + body), and
`tailwind.config.ts` (shadow tokens). Then update the shared primitives in
`components/ui.tsx`. Then do per-screen touch-ups. Work in that order.

### 1) Fonts — `app/layout.tsx`
Swap the display and sans faces; keep mono; add an editorial (Fraunces-italic) variable.

```ts
import { Archivo, Hanken_Grotesk, Fraunces, JetBrains_Mono } from "next/font/google";

// Display: big bold grotesk (headlines, numbers, buttons, names)
const display = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

// UI / body
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// "Professor's voice" — editorial italic accents only
const editorial = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["italic"],
  variable: "--font-editorial",
  display: "swap",
});

// Money / codes / counters (unchanged)
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});
```
Add `${editorial.variable}` to the `<html>` className alongside the others.
Update `viewport.themeColor` to `#EBE3D0`.

In `tailwind.config.ts` add the editorial family:
```ts
fontFamily: {
  display: ["var(--font-display)", "system-ui", "sans-serif"], // Archivo
  sans:    ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"], // Hanken Grotesk
  editorial: ["var(--font-editorial)", "Georgia", "serif"], // Fraunces italic
  mono:    ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"], // JetBrains Mono
},
```
Use `font-editorial italic` for instructional/helper copy. Headings (`h1–h3`) keep
`font-display` (now Archivo) — but bump default heading weight toward 800–900 and you may drop
the `tracking-tight`/italic serif feel. Big display numbers should use `font-mono` (money) or
`font-display` (counts) per the reference.

### 2) Token values — `app/globals.css` `:root`
Replace the channel triplets (keep the RGB-triplet format so `/<alpha>` modifiers keep working).
Borders become ink — that's intentional.

| Token | Old hex | **New hex** | **New triplet** | Role |
|---|---|---|---|---|
| `--paper` | #F7F3EA | **#EBE3D0** | `235 227 208` | page background |
| `--paper-2` | #F0EADD | **#FBEFD2** | `251 239 210` | gold-tint inset panel |
| `--surface` | #FFFEFB | **#FFFDF6** | `255 253 246` | cards |
| `--ink` | #1C1917 | **#211A12** | `33 26 18` | text **and borders** |
| `--ink-muted` | #57534E | **#6B5C40** | `107 92 64` | secondary text (darkened for projector contrast) |
| `--ink-subtle` | #78716C | **#7C6B48** | `124 107 72` | hints |
| `--line` | #E7E0D2 | **#211A12** | `33 26 18` | borders → **ink** |
| `--line-strong` | #D6CCB8 | **#211A12** | `33 26 18` | strong borders → **ink** |
| `--brand` | #A16207 | **#F0A92B** | `240 169 43` | amber **fill** (blocks/buttons) |
| `--brand-strong` | #854D0E | **#E0961A** | `224 150 26` | amber hover |
| `--brand-soft` | #FEF3C7 | **#FBEFD2** | `251 239 210` | amber tint |
| `--gain` | #047857 | **#1F8A4C** | `31 138 76` | GOOD market / profit |
| `--gain-soft` | #D1FAE5 | **#E4FBEA** | `228 251 234` | gain tint |
| `--loss` | #BE123C | **#DB3B2B** | `219 59 43` | BAD market / loss |
| `--loss-soft` | #FFE4E6 | **#FFE3DD** | `255 227 221` | loss tint |
| `--play` | #7C3AED | **#2557E8** | `37 87 232` | electric blue — "you"/primary accent (replaces violet) |
| `--play-soft` | #EDE9FE | **#E4ECFF** | `228 236 255` | blue tint |

> **Important gold caveat:** the new `--brand` (#F0A92B) is a *fill* color — it sits behind
> ink text, never used as gold text on white (it would fail contrast). Anywhere the old design
> used gold *text*, use `--ink` instead. Amber buttons get **ink** text (`text-ink`), not white.

Extra tint fills used in the reference (chips, accents) — add as plain values if useful:
blue tint `#E4ECFF`, red tint `#FFE3DD`, green tint `#E4FBEA`, gold tint `#FBEFD2`.

### 3) `app/globals.css` — body, borders, slider
- **Body texture:** keep the dot grid but make dots ink and a touch stronger; **remove the gold
  radial corner-glow**. New look is flat warm paper + dots:
  ```css
  body {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='1' cy='1' r='1.3' fill='%23211a12' fill-opacity='0.07'/%3E%3C/svg%3E");
    background-size: 22px 22px;
    background-attachment: fixed;
  }
  ```
- **Default border width:** the look relies on 2–2.5px ink borders. Either add
  `borderWidth: { DEFAULT: "2px" }` to the Tailwind theme (global), or use `border-2`/`border-[2.5px]`
  on each surface. Recommended: use `border-2 border-ink` on cards/buttons/inputs explicitly
  (clearer than a global default change).
- **Slider thumb** (`.game-slider`): amber thumb, ink border, hard offset shadow, larger:
  ```css
  .game-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    height: 34px; width: 34px; border-radius: 9999px;
    background: rgb(var(--brand));      /* amber */
    border: 3px solid rgb(var(--ink));
    box-shadow: 3px 3px 0 rgb(var(--ink));
    cursor: pointer; transition: transform .12s ease;
  }
  .game-slider:active::-webkit-slider-thumb { transform: scale(1.08); }
  .game-slider::-moz-range-thumb { /* same as above */ }
  ```
  The track in the reference is an ink-bordered pill, green (safe) with a red (risky) fill that
  grows from the right as the risky share increases.
- Keep the `prefers-reduced-motion` block and confetti as-is.

### 4) `tailwind.config.ts` — shadows
Replace soft shadows with hard offsets (no blur, ink color):
```ts
boxShadow: {
  card: "3px 3px 0 rgb(var(--ink))",   // standard card / button
  lift: "6px 6px 0 rgb(var(--ink))",   // hero card, modal, big CTA
  pop:  "5px 5px 0 rgb(var(--ink))",   // primary CTA emphasis
},
```
Add a reusable press affordance pattern (apply per-element):
`active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`.
Keep all existing `keyframes`/`animation` (pop-in, rise, count-pop, confetti, pulse-soft) —
they still apply.

### 5) Shared primitives — `components/ui.tsx`
**Card**
```tsx
"rounded-2xl border-2 border-ink bg-surface p-6 shadow-card"
```
**Button** — borders + offset shadow + press shift; add a `gold` variant; primary becomes blue:
```tsx
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-ink px-5 py-3 " +
  "font-display font-extrabold transition active:translate-x-[2px] active:translate-y-[2px] " +
  "active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-x-0 " +
  "disabled:active:translate-y-0";
const variants = {
  primary: "bg-play text-white shadow-card hover:brightness-110",       // electric blue
  gold:    "bg-brand text-ink shadow-card hover:bg-brand-strong",       // amber, INK text
  secondary:"bg-surface text-ink shadow-card hover:bg-paper-2",
  success: "bg-gain text-white shadow-card hover:brightness-110",
  danger:  "bg-loss text-white shadow-card hover:brightness-110",
};
```
(Map existing `variant="primary"` CTAs to blue or gold per the reference: the headline "lock
in / start" CTAs are gold; navigational "join / next round / start game" are blue or green.)

**Field / TextInput / Select:** `border-2 border-ink bg-surface ... shadow-card font-semibold`,
focus keeps an ink/brand ring.
**Toggle:** ink `border-2`; track on = `bg-play` (blue) instead of brand; knob white with thin ink border.
**Banner:** `rounded-xl border-2 border-ink ... shadow-card`, fills = `*-soft`, text = `gain`/`loss`/`play`.

---

## Screens / components (per-file notes)

Each maps a reference screen to the real component(s). General rule: cards get `border-2
border-ink` + `shadow-card`; headings/numbers go Archivo; helper text goes `font-editorial
italic` in `text-ink-muted`; money/codes go `font-mono`.

### Landing — `app/page.tsx`, `components/JoinForm.tsx`
- Two-column hero (copy left, join card right). Eyebrow pill: blue-tint bg, ink border, shadow.
- H1 "PLAY THE MARKET." in Archivo 900, ~72px, `leading-[.92]`, tight tracking.
- Subhead in `font-editorial italic`, `text-ink-muted`; inline "safe"=gain, "risky"=loss emphasis.
- CTAs: "Join a game" = blue primary; "Host a game" = secondary. Both `border-2` + `shadow-lift`.
- Join card: 5 ink-bordered code cells (gold-tint fill, mono 30px), gold "Enter the market"
  button, dashed-top footer line with mono count + editorial caption.

### Student flow — `components/student/*`, `components/Instructions.tsx`
Mobile-first; the reference shows a phone frame (frame is just for presentation — render full-screen in-app).
- **Join (`StudentRound`/`JoinForm` entry):** "WHO'S PLAYING?" Archivo; name + code inputs
  (`border-2 border-ink`, shadow); code field gold-tint + mono tracking; blue "Enter the market →".
- **Waiting (`StudentWaiting.tsx`):** "✓ You're in" gain eyebrow, "HOLD TIGHT." headline, editorial
  body, pulsing ink-bordered ⏳ medallion (`animate-pulse-soft`), "In the room" chips card
  (ink-bordered pills, varied tint fills).
- **Allocate (`AllocationInput.tsx` + `StudentRound.tsx`):** the centerpiece.
  - Header: ink "ROUND 07/25" pill (mono) + right-aligned "YOUR WEALTH" label + mono amount.
  - "The market looks like" row: editorial label + mono `▲62% / ▼38%` (gain/loss colors).
  - Two big stat blocks: **SAFE** = solid `bg-gain` white text, **RISKY** = solid `bg-loss`
    white text; each `border-2 border-ink shadow-card`, Archivo label + mono amount + mono %.
  - Slider: ink-bordered pill track, green base with red fill from the right = risky share;
    amber thumb (see CSS). Live: dragging updates both stat blocks' amounts/percent.
  - "ALL SAFE / ALL RISKY" mono end labels.
  - Gold "Lock in my bet 🔒" CTA (`shadow-pop`), editorial caption below.
- **Locked:** blue "🔒 Bet locked" eyebrow, "NICE. NOW WE WAIT." Archivo, the two SAFE/RISKY
  blocks repeated (read-only), three pulsing amber dots (staggered `animate-pulse-soft`).
- **Reveal (`StudentRound` result / `OutcomeChips.tsx` / `Confetti.tsx`):** full-bleed gain
  (`bg-gain`) or loss (`bg-loss`) banner with ink bottom border + Archivo "GOOD! ▲" / "DOWN ▼"
  + editorial subline + small confetti shapes (keep `Confetti.tsx`, retint to amber/blue/white).
  Below: "NEW WEALTH" label, mono 56px amount, gain/loss pill delta, gold rank card "🏆 You're
  3rd of 28", blue "On to round 8 →" CTA.
- **Finished (`StudentFinished.tsx`):** final standing in the same vocabulary — big mono final
  wealth, rank, gain/loss summary, leaderboard echo. Keep confetti for a top finish.

### Host — `components/host/*`
- **Lobby (`HostLobby.tsx`, `CreateSessionForm.tsx`, `HostSignIn.tsx`):** left = **dark ink panel**
  (`bg-ink` / `#211A12`, cream text `#F6EFDD`) with "GAME CODE", giant mono code (~66px), QR
  placeholder (use existing QR), and "join at …" editorial caption in a muted cream. Right =
  surface card: "Players joined" + mono count badge (blue-tint, ink border, shadow), ink-bordered
  player pills (varied tints), a dashed settings row (Rounds / Start wealth, mono values), green
  "▶ Start the game" CTA. Inputs in `CreateSessionForm` use the new Field/TextInput styles.
- **Round control (`HostRoundControl.tsx`, `MarketOddsControl.tsx`, `AllocationsBreakdown.tsx`):**
  two cards. Left: ink "ROUND 07/25" pill + editorial status; "Set the odds" with an ink-bordered
  split bar (gain green / loss red, shadow) + mono labels; a gold-tint "BETS LOCKED IN" panel
  with big mono `18 / 28` + editorial waiting note. Right "Resolve the round": two big solid
  buttons **MARKET UP** (`bg-gain`) and **MARKET DOWN** (`bg-loss`), Archivo, ink border + shadow;
  secondary row "⟲ Re-open betting" (secondary) + gold "Show projector ↗".
- **Summary / charts (`HostSummary.tsx`, `WealthChart.tsx`, `SessionHistoryTable.tsx`,
  `SessionsList.tsx`, `SessionHistoryTable`):** apply the same card/border/shadow/type system.
  For `WealthChart`, use the new semantic colors (gain/loss/blue) for series; ink axis lines;
  mono tick labels. Tables: ink header row, mono numeric columns, ink-bordered rows.

### Projector — `components/host/HostPresent.tsx`  ← legibility is the priority here
Rendered on a 16:9 stage on a big screen in a lit room. The reference stage is an ink-bordered
rounded panel with `shadow-lift` and the ink dot-grid inside.
- **Lobby:** split layout — left dark ink panel with **giant mono game code (~92px)** + editorial
  "join from your phone"; right "In the room" with a large mono count and big ink-bordered player
  pills (15px+).
- **Betting:** top bar (ink "ROUND" pill + Archivo "PLACE YOUR BETS" + editorial code). Left blue-tint
  panel: "LOCKED IN" + **huge mono `18/28`** (~96px). Right: "STANDINGS SO FAR" + leaderboard rows
  — ink-bordered, `shadow-card`, Archivo names (🥇🥈🥉), mono amounts in gain/loss color; leader row
  gold-tint, 4th in muted ink.
- **Reveal:** full-width gain/loss banner (Archivo ~46px "MARKET UP! ▲" + editorial subline +
  confetti shapes), then big leaderboard rows with per-row mono delta (`▲ +$28.10` gain / `▼ −$12.30`
  loss) + a "▲ up 2" movement badge on risers (white text on gain, ink border).
- **Projector legibility rules (apply throughout HostPresent):** minimum on-screen text ~24px;
  use `--ink-muted` (#6B5C40), never lighter, for any secondary text; numbers/names large and bold;
  keep solid fills behind all text (don't put text directly on the dot texture); maintain the
  ink borders for hard edges that survive projector blur.

---

## Interactions & behavior (unchanged logic — match these visuals)
- **Press:** interactive elements `translate(2px,2px)` + drop shadow on `:active`.
- **Hover:** solid-color buttons `brightness-110`; surface buttons → `bg-paper-2`.
- **Reveal entrance:** banner uses `animate-pop-in` (or the existing reveal animation); confetti
  on GOOD/finish (`confetti` keyframe) — keep, just retint.
- **Slider:** live two-way update of SAFE/RISKY amounts & percentages as the risky share changes.
- **Waiting states:** `animate-pulse-soft` on the medallion and the lock dots.
- **Active nav/step:** active tab = solid ink fill + cream text + pressed offset; inactive = surface
  + ink border + shadow. (In React, drive via conditional classes — straightforward.)
- Honor `prefers-reduced-motion` (block already exists).

## Design tokens summary
- **Colors:** see the table above. Ink `#211A12`; paper `#EBE3D0`; surface `#FFFDF6`; amber `#F0A92B`;
  blue `#2557E8`; gain `#1F8A4C`; loss `#DB3B2B`. Tints: gold `#FBEFD2`, blue `#E4ECFF`, green `#E4FBEA`, red `#FFE3DD`.
- **Type:** Archivo (display 600–900), Hanken Grotesk (sans 400–700), Fraunces italic (editorial 400–600), JetBrains Mono (400–800).
- **Radius:** `rounded-xl` (12px) buttons/inputs/cells, `rounded-2xl` (16px) cards, `rounded-full` pills.
- **Borders:** ink, 2px (cards/buttons/inputs), 2.5–3px (hero/phone shell/projector stage).
- **Shadows (hard, ink, no blur):** card `3px 3px 0`, lift `6px 6px 0`, pop `5px 5px 0`.
- **Spacing:** card padding ~24px (`p-6`); element gaps 8–14px; section gaps 22–32px.

## Assets
No new image assets. Icons: keep `components/icons.tsx`; the reference uses Unicode glyphs
(▲ ▼ 🛡 🔥 🔒 🥇🥈🥉 🏆) as accents — fine to keep, or substitute existing icon components.
QR code: keep the app's existing QR generation on the host lobby / projector.

## Files in this bundle
- `reference/The Risk Game - Redesign.dc.html` — the hi-fi interactive reference (all screens).
- `reference/support.js` — runtime required to open the reference file.
- `README.md` — this document (self-sufficient).

## Suggested order of work
1. `app/layout.tsx` fonts → 2. `globals.css` tokens + body + slider → 3. `tailwind.config.ts`
shadows + fontFamily → 4. `components/ui.tsx` primitives → 5. Landing/Join → 6. Student flow →
7. Host lobby + round control → 8. **HostPresent (projector)** → 9. Summary/charts/tables.
Verify against the reference screen-by-screen; run the dev server and click through a full round.
