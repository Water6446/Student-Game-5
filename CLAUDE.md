# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

There are **three game types**: `basic` (one risky bet), `portfolio` (N risky
assets) and `manager` (active vs. passive — continuous normal returns, fees,
leverage, and a secret alpha held in `session_secrets`; each round is a year).
Keep in-UI explanations SHORT — one line max — and put the detailed workings in
MECHANICS.md instead. Update it whenever a mechanic changes.

## Commands

```bash
npm install
npm run dev                                 # Next.js dev server on :3000
npm run build
npm test                                    # Vitest: lib/**/*.test.ts only (pure, no DB, no DOM)
npm run test:watch
npx vitest run lib/game/manager.test.ts     # one file
npx vitest run -t "leverage cap"            # one test by name
npx tsc --noEmit                            # typecheck
```

`npm run lint` is `next lint`, but ESLint is not a dependency and there is no
config, so it drops into Next's interactive setup — use `tsc --noEmit` instead.

**Database proofs (no Docker, no Supabase project needed):**

```bash
npm run test:db                   # both suites below, EVERY migration, in-process Postgres
npm run test:db -- game           # scripts/db_selftest.sql: game security + math + manager secrecy
npm run test:db -- accounts       # scripts/accounts_selftest.sql: the account layer (0016–0030)
npm run security-check            # optional: the same assertions through a LIVE project
```

`scripts/db-selftest.mjs` gives each suite a fresh PGlite database (real Postgres
in WebAssembly), applies `scripts/_supabase_mock.sql` plus every migration, and
runs the suite through a small psql emulator (`\set`, `\gset`, `:'var'`). While
the 0008 bypass is live the game suite prints a `NOTE:` that a guest can host —
expected, not a failure. A new RPC or policy gets a denial test in
`scripts/*_selftest.sql` in the same change. `security-check` is the only thing
in the repo that uses a service key, and it needs `.env.local` plus a live
project.

Supabase CLI: `npm run db:link`, `db:push` (apply migrations), `db:diff`, `db:status`.

Env: `cp .env.example .env.local`. The browser client throws on a missing/empty
URL or anon key and strips a trailing slash from the URL — a trailing slash
breaks only the realtime socket, which presents as "live updates work locally
but not on Vercel". Dashboard toggles and the launch checklist are in
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md); how accounts work is in
[docs/ACCOUNTS.md](./docs/ACCOUNTS.md).

## Architecture

**The server owns every number.** Host and students both reach Postgres as
`anon`/`authenticated` under default-deny RLS, and every privileged action is a
SECURITY DEFINER RPC (`create_session`, `join_session`, `start_round`,
`lock_round`, `resolve_round`, `next_round`, `finish_session`,
`submit_*_allocation`, `get_leaderboard`, `get_my_rank`, `get_manager_truth`, …).
`resolve_round` is the **only** writer of `players.current_wealth`. The app never
uses a service_role key. So: never compute wealth client-side and write it — the
TS math exists for previews, the fee counter, reveals and tests. Clients have no
direct write to any game table (students rename via `set_my_display_name`), and
`players` SELECT is column-scoped without `auth_uid` — use `PLAYER_COLUMNS`,
never `select("*")`, and `get_my_player_id` to find "me". Hidden market odds live
in `session_secrets` while a game runs (0029; the host merges them back in
`useSession`).

**TS mirrors SQL; change both.** `lib/game/math.ts` (basic), `portfolio.ts` and
`manager.ts` are 1:1 mirrors of the three branches of `resolve_round`
(0003 / 0010 / 0015). `lib/game/db.ts` hand-mirrors the table row shapes (no
generated types), `lib/game/hidden-odds.ts` mirrors `_apply_odds`, and
`lib/design/colors.ts` mirrors the CSS tokens. A mechanic change is three edits:
the migration, its TS mirror, and MECHANICS.md.

**Migrations are append-only.** `supabase/migrations/NNNN_*.sql` applied in
order, each opening with a header comment explaining *why* it exists. Never edit
an applied migration — add the next number. Functions use `create or replace`,
so the highest-numbered file mentioning a function holds its real definition
(`resolve_round` lives in 0029, not 0003 or 0015). Supabase grants every new
function to `anon` and `authenticated` directly, so each one needs `revoke all
... from public, anon` (and `authenticated`, for helpers). `accounts_selftest.sql`
asserts the EXACT callable set for both roles — add a new client RPC there.

**Three client layers:**

1. `lib/game/*.ts` — pure, no I/O, and the only tested code (vitest `include` is
   `lib/**/*.test.ts`). `results.ts` + `counterfactual.ts` + `condense.ts` derive
   every end-of-game view (ranks, trajectories, luck, Sharpe, CSV) from raw rows.
2. `components/use-*.ts` — one hook per live table: initial select plus a
   `postgres_changes` subscription (`useSession`, `useRound`, `usePlayers`,
   `useRoundAllocations`, `useSessionHistory`). RLS decides what each caller
   sees, so host and student screens share the same hooks.
3. Screens — `app/host/[sessionId]/page.tsx` and `app/play/[sessionId]/page.tsx`
   are thin dispatchers on `session.status` (`lobby` | `active` | `finished`)
   into `components/host/*` and `components/student/*`.

**The round loop, and why display phase ≠ row status.** `start_round` → `open` →
students submit → `lock_round` → `resolve_round` (draws the market, writes the
allocations, then sets `status='revealed'` **last**, because every client keys
its reveal off that write) → `next_round`. What a screen *shows* is decided by
`lib/game/round-phase.ts` + `components/use-round-phase.ts`: they gate the stale
round served for one fetch after `next_round`, and in auto market mode swallow
the `locked` transient the class must never see.

**Game type is config, not route.** One engine, three games, dispatched on
`session.config.game_type` through `isPortfolio()` / `isManager()`
(`lib/game/types.ts`); absent means `basic` (pre-portfolio sessions). The manager
game's truth (alpha/beta/tracking error) lives in `session_secrets` — RLS on, no
policies, no grants — reachable only through `get_manager_truth()` (host any
time, students only once the session is `finished`). `configForRerun()` strips
`managers` before re-running a session; keeping it would rebuild every fund at
alpha 0 and collapse the lesson.

**Auth.** Students sign in anonymously; hosts need a real identity. `middleware.ts`
→ `lib/supabase/middleware.ts` refreshes the session on every request via
`getUser()` (not `getSession()`). `lib/auth/can-host.ts` holds `canHost()` and
`hasAccount()` as exact complements, because `/host` and `/login` redirect to
each other and drifting conditions would ping-pong. The one server route is
`app/api/auth/sign-in` — username→email needs `USERNAME_LOOKUP_SECRET`, which
must never reach the browser; email/password sign-in goes straight from the
browser to Supabase so GoTrue sees the real client IP.

## Notable

- `app/globals.css` body has a tiled-dot background; some headless screenshot
  tools hang on it (renders fine in real browsers).
- The site header is mounted **once**, in `app/layout.tsx` (`SiteHeaderGate`) —
  pages must not render `<SiteHeader />` themselves. Game routes opt out in
  `lib/site-chrome.ts`; `StatusPage` supplies it there. Its signed-in/out
  variants switch on `html[data-auth]` (DESIGN.md §8 "Site header").
- The host **"Skip email — sign in for testing"** bypass is **live and wanted**
  — the game is still in its testing phase. It sits behind
  `NEXT_PUBLIC_ALLOW_ANON_HOST`, which defaults to **on**, so the button renders
  and anonymous hosts reach `/host` without any env setup. Do not remove or
  disable it without being asked.
  **Pre-deploy checklist** (two coupled changes, do both):
  set `NEXT_PUBLIC_ALLOW_ANON_HOST=false`, and add a migration reverting
  `supabase/migrations/0008_temp_allow_anon_host.sql`, which relaxes the
  **server** side independently of the flag. The exact migration (a trigger —
  never re-apply an old `create_session`) and the test updates that go with it
  are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) Part C.1.
