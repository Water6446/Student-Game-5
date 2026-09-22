# Investment-Risk Game (Kahoot-style, real-time)

A live, in-class simulation where a professor hosts a session and students join
from their phones/laptops to split their wealth between a **safe** and a
**risky** asset each round. Built on **Next.js (App Router) + TypeScript**,
**Supabase** (Postgres / Auth / Realtime), **Tailwind**, **Recharts**, and
`qrcode.react`. Replaces a manual spreadsheet.

> **Security is a first-class requirement.** The threat model is a curious CS
> student with browser dev tools and the public anon key. See
> [Security model](#security-model) and the [hardening checklist](#supabase-hardening-checklist).

Three games share one engine — lobby, rounds, lock/reveal, leaderboard, present
mode and CSV export. Hosts have accounts (a dashboard of past and live
sessions); students join anonymously with a code or QR and may optionally keep
their results in an account.

| Doc | What's in it |
| --- | --- |
| [DESIGN.md](./DESIGN.md) | The "Academy Arcade" design system every screen follows |
| [MECHANICS.md](./MECHANICS.md) | How every game number works (luck, Sharpe, returns, ρ, fees, the index fund) |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Supabase CLI workflow, dashboard setup, the launch checklist |
| [docs/ACCOUNTS.md](./docs/ACCOUNTS.md) | How accounts work, the security rules behind them, hosting limits |
| [CLAUDE.md](./CLAUDE.md) | Working notes for AI-assisted changes (read before editing) |

---

## The games

| | Basic | Portfolio | Manager |
|---|---|---|---|
| Risky side | one risky bet | N risky assets | 5 fund managers + an index fund |
| Outcome | good / bad | good / bad per asset | **continuous normal returns** |
| Round = | a round | a round | **a year** (25 by default) |
| Extra | — | correlation ρ | fees, leverage to 2×, a secret alpha |

The **manager game** teaches active vs. passive: skill is real but tiny and
statistically invisible over a career, fees compound against you regardless, and
a 0.05% index fund is always on the menu as the passive alternative. Its maths,
the fee order of operations and the secrecy model are in
[MECHANICS.md § Manager game](./MECHANICS.md#manager-game).

## The basic game (rules)

- Each player starts with a configurable **starting wealth** (default `$100`).
- Runs for a configurable number of **rounds** (default `25`).
- Each round a player splits their **current** wealth: `safe = current − risky`.
- The market each round is **Good** (default `p = 0.6`) or **Bad**.
- **Safe never changes.** Two payoff modes (host picks at setup):
  - **moderate**: risky ×1.1 if Good, ×0.9 if Bad → `new = safe + risky·(1.1|0.9)`
  - **extreme**: risky ×2 if Good, ×0 if Bad → `new = safe + risky·(2|0)`
- The market result is revealed **after** allocations lock, never before.
- Market control flags: `market_mode = auto|manual`,
  `market_scope = shared|independent` (manual implies shared).

Worked examples (all verified by tests, in both TS and SQL):

| mode | wealth | risky | outcome | result |
|------|-------:|------:|---------|-------:|
| moderate | 100 | 50 | good | **105** |
| moderate | 100 | 50 | bad  | **95**  |
| extreme  | 100 | 50 | good | **150** |
| extreme  | 100 | 50 | bad  | **50**  |

---

## Repository layout

```
app/                  Next.js routes: / (marketing), /host, /join, /play,
                      /login, /account, /auth, /privacy, /terms
components/           UI — ui.tsx primitives, icons.tsx, and one folder per
                      surface (host/, student/, account/, auth/, marketing/)
lib/game/             Pure, unit-tested game maths — the TypeScript mirror of
                      the SQL (types, math, portfolio, manager, results, format)
lib/auth/             Who may host, sign-in validation, open-redirect guard
supabase/migrations/  SQL migrations, applied in order (`npm run db:push`)
  0001–0005           Schema, RLS + grants + Realtime, host RPCs + round loop,
                      delete_session, submit_allocation
  0006–0013           Market odds, bots, the portfolio game, correlation
  0008                TEMPORARY testing bypass: guests may host (see CLAUDE.md)
  0014–0015           The manager game (session_secrets holds the true alpha:
                      RLS on, NO policies, NO grants — deny-all)
  0016–0025           The account layer (see docs/ACCOUNTS.md)
  0026                The manager game's index fund
scripts/
  db-selftest.mjs     `npm run test:db` — applies every migration to a
                      throwaway in-process Postgres and runs both suites below
  db_selftest.sql     The game: security model + wealth math + manager secrecy
  accounts_selftest.sql  The account layer
  _supabase_mock.sql  Local stand-in for Supabase's auth surface (test only)
  security-check.ts   `npm run security-check` — the same denials, live
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in. The comments there explain
each one.

| var | exposure | purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | publishable key (safe; protected by RLS) |
| `NEXT_PUBLIC_SITE_URL` | public | base URL for the join link/QR |
| `NEXT_PUBLIC_ALLOW_ANON_HOST` | public | the testing bypass; **on** until launch |
| `NEXT_PUBLIC_EMAIL_DELIVERY` | public | show email-dependent flows; off until custom SMTP |
| `USERNAME_LOOKUP_SECRET` | **server only** | enables username sign-in; unset = email only |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | _not used by the app_; only the live security check |

The **service_role key is never shipped to the client** and is not needed to run
the app — every privileged action is a host-only RPC.

---

## Supabase setup

1. Create a Supabase project. Note the project URL and the publishable key.
2. Apply the migrations **in order** with the Supabase CLI (`npm run db:push`).
3. **Auth**: enable **Anonymous sign-ins** (students), then the account setup
   in [docs/DEPLOYMENT.md Part B](./docs/DEPLOYMENT.md#part-b--accounts-setup)
   (Google, password policy, CAPTCHA, the username secret).
4. Apply the [hardening checklist](#supabase-hardening-checklist).

---

## Running locally

```bash
npm install
npm run dev             # Next.js dev server on http://localhost:3000
npm run test            # game-maths unit tests (Vitest)
npm run test:db         # the database self-tests (no Docker, no cloud)
```

`npm run test:db` builds a throwaway Postgres in-process (PGlite), applies a
tiny mock of Supabase's `auth.uid()` / role surface plus **every** migration,
and runs two suites as attacker identities — aborting on any failure. Run one
with `npm run test:db -- game` or `-- accounts`. Among what they prove:

- a **signed-out caller** cannot call anything but the four sign-in functions;
- a **student cannot** lock or resolve a round, write `current_wealth`, write
  any allocation directly, or put more than their wealth at risk (the submit
  RPC clamps it);
- a **student cannot** see another student's allocation, or a non-member the
  session/players; a hidden leaderboard is denied to students but not the host;
- for a manager game, `sessions.config` **leaks no** `alpha`, `beta` or
  `tracking_error`; a **student cannot** read `session_secrets` or call
  `get_manager_truth` before the game finishes; the **leverage cap is enforced
  server-side**; the index fund stays out of the skill shuffle and tracks the
  market exactly, less its fee;
- the **wealth math** in SQL matches the worked examples above, including the
  non-submitter "all-safe" default;
- the account layer: no self-promotion through `profiles`, quotas and the player
  cap hold, guest purges sever rather than delete results, username lookup
  fails closed, the login throttle locks.

While the testing bypass is live the game suite also prints a `NOTE:` that a
guest can host — a reminder, not a failure.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it into Vercel.
2. Set the `NEXT_PUBLIC_*` variables above (and `USERNAME_LOOKUP_SECRET` if you
   want username sign-in) as Vercel env vars. Do **not** set the service_role
   key in Vercel.
3. Deploy. Add the Vercel URL to Supabase **Auth → URL Configuration** (Site URL
   + redirect URLs) so Google and email sign-in return to your app.

The full pre-class launch checklist — including closing the testing bypass —
dashboard steps, smoke test and rollback plan live in
**[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**.

---

## Security model

- **Default-deny RLS on every table.** Clients connect as the non-owner
  `anon`/`authenticated` roles, so every direct query is subject to policy.
- **All wealth/market math runs only in `resolve_round`**, a SECURITY DEFINER
  function that asserts the caller is the session's host, refuses unless the
  round is `locked`, and is the **only** writer of `players.current_wealth`.
- **Students write allocations only through `submit_allocation`** (and its
  portfolio/manager siblings): SECURITY DEFINER RPCs that tie the row to
  `auth.uid()`, accept only while the round is `open`, validate the amounts
  (the basic game clamps `0 ≤ risky ≤ wealth`; the manager game rejects anything
  past the leverage cap) and derive `safe` server-side. Students hold no direct
  insert/update grant on `allocations` at all (players: `display_name` only).
- **Host privilege is tied to an auth uid**, not a guessable secret. Hosts sign
  in with a real account (Google, or email/username + password). **While
  testing, a guest may also host** — migration `0008` plus
  `NEXT_PUBLIC_ALLOW_ANON_HOST`; both are reverted at launch
  (docs/DEPLOYMENT.md Part C.1).
- **Signed-out callers** can execute only the four sign-in functions (`0024`) —
  Supabase grants every new function to `anon` directly, so this is enforced
  explicitly and asserted by the self-test.
- **Pending allocations are private**: a student can never select another
  student's allocation (pending or revealed).
- **Leaderboard visibility** is config-gated. When hidden, students get only
  their rank via `get_my_rank()` (returns rank + total, never the list).
- The market outcome is **written only at reveal time**, so it cannot leak
  early; the manager game's true parameters live in `session_secrets`, readable
  only through `get_manager_truth()` (the host any time, students once the game
  finishes).

### Supabase hardening checklist

- [ ] **RLS enabled** on every table (done by the migrations; verify in the
      Table editor).
- [ ] **Anonymous sign-in ON** (students need it), with **CAPTCHA** covering it
      and sign-up/sign-in.
- [ ] **Auth rate limits** set (sign-in / OTP / anonymous) to throttle abuse.
- [ ] **Realtime restricted to authenticated**, and only the game tables are in
      the `supabase_realtime` publication (done by `0002_rls.sql`).
- [ ] **service_role key** present only in server-side secrets, never in client
      env or the repo.
- [ ] **The testing bypass is closed** before real classes (docs/DEPLOYMENT.md
      Part C.1).
- [ ] `npm run test:db` passes, and `npm run security-check` against the live
      project.
