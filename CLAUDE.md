# CLAUDE.md

## Design

This project — and every new game in this in-class/student-game family — follows
a single design system documented in **[DESIGN.md](./DESIGN.md)**.

**Before building or changing any UI, read `DESIGN.md` and follow it exactly:**
the "Parchment Pro + a little Kahoot" identity, the semantic color tokens
(`paper`/`ink`/`brand` gold/`gain` green/`loss` rose/`play` violet), the font
stack (Fraunces / Plus Jakarta Sans / JetBrains Mono), the `components/ui.tsx`
primitives, the icon set in `components/icons.tsx`, and the patterns for present
mode, risk meters, motion, and accessibility.

Use the semantic Tailwind classes (`bg-surface`, `text-ink`, `text-brand`,
`text-gain`, `text-loss`, `border-line`, …) — never raw `slate-*` / `indigo-*` /
`emerald-N`. When starting a brand-new game, copy the foundation files listed in
DESIGN.md §11 and build from the `ui.tsx` primitives.

## Notable

- `app/globals.css` body has a tiled-dot background; some headless screenshot
  tools hang on it (renders fine in real browsers).
- The host **"Skip email — sign in for testing"** bypass in `HostSignIn` is a
  temporary testing hack and must be gated before a production deploy.
