# CLAUDE.md

## Design

This project — and every new game in this in-class/student-game family — follows
a single design system documented in **[DESIGN.md](./DESIGN.md)**.

**Before building or changing any UI, read `DESIGN.md` and follow it exactly:**
the "Academy Arcade" identity (warm paper, ink-black borders, hard offset
shadows, saturated color blocks, bold grotesk headlines), the semantic color
tokens (`paper`/`ink`/`brand` amber/`gain` green/`loss` red/`play` electric
blue), the font stack (Archivo / Hanken Grotesk / Fraunces italic / JetBrains
Mono), the `components/ui.tsx` primitives, the icon set in `components/icons.tsx`,
and the patterns for present mode, risk meters, motion, and accessibility.

Use the semantic Tailwind classes (`bg-surface`, `text-ink`, `border-ink`,
`text-gain`, `text-loss`, `bg-brand`, `bg-play`, …) — never raw `slate-*` /
`indigo-*` / `emerald-N`. Note `brand` (amber) is a fill behind **ink** text,
never gold text on white. When starting a brand-new game, copy the foundation
files listed in DESIGN.md §11 and build from the `ui.tsx` primitives.

## Mechanics

**[MECHANICS.md](./MECHANICS.md)** is the master reference for how every game
number works (luck, Sharpe, returns, correlation ρ, counterfactuals, standings).
Keep in-UI explanations SHORT — one line max — and put the detailed workings in
MECHANICS.md instead. Update it whenever a mechanic changes.

## Notable

- `app/globals.css` body has a tiled-dot background; some headless screenshot
  tools hang on it (renders fine in real browsers).
- The host **"Skip email — sign in for testing"** bypass is **live and wanted**
  — the game is still in its testing phase. It sits behind
  `NEXT_PUBLIC_ALLOW_ANON_HOST`, which defaults to **on**, so the button renders
  and anonymous hosts reach `/host` without any env setup. Do not remove or
  disable it without being asked.
  **Pre-deploy checklist** (two coupled changes, do both):
  set `NEXT_PUBLIC_ALLOW_ANON_HOST=false`, and add a migration reverting
  `supabase/migrations/0008_temp_allow_anon_host.sql`, which relaxes the
  **server** side independently of the flag.
