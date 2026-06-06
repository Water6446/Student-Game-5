# Investment-Risk Game (Kahoot-style, real-time)

A live, in-class simulation where a professor hosts a session and students join
from their phones/laptops to split their wealth between a **safe** and a
**risky** asset each round. Built on **Next.js (App Router) + TypeScript**,
**Supabase** (Postgres / Auth / Realtime), **Tailwind**, **Recharts**, and
`qrcode.react`. Replaces a manual spreadsheet.

> **Security is a first-class requirement.** The threat model is a curious CS
> student with browser dev tools and the public anon key. See
> [Security model](#security-model) and the [hardening checklist](#supabase-hardening-checklist).

---

## Build status (staged)

The project is built in confirmable stages:

1. **Schema + RLS + RPCs + game math (with tests + a security self-test).** ✅ done
2. **Host create/lobby + student join (anon auth, join code, QR).** ✅ done
3. **Round loop with Realtime: submit → lock → reveal → next.** ✅ done
4. Leaderboard + chart + history (host) and student wealth/rank view. — _next_
5. End summary + counterfactual + CSV export.

---

## The game (rules)

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
lib/game/            Pure, unit-tested game math (single source of truth)
  types.ts           Domain types + default config
  math.ts            resolveAllocation / validateRisky / rollMarket
  math.test.ts       Vitest spec incl. every worked example
supabase/migrations/ SQL migrations (apply in order)
  0001_schema.sql    Tables
  0002_rls.sql       Row Level Security policies + grants + Realtime
  0003_functions.sql SECURITY DEFINER host RPCs + resolve_round
scripts/
  _supabase_mock.sql Local stand-in for the Supabase auth surface (test only)
  db_selftest.sql    Proves the security assertions + math against the real SQL
  run-db-selftest.sh Spins up throwaway Postgres in Docker and runs the above
  security-check.ts  Optional: same assertions through a LIVE project (anon key)
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| var | exposure | purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key (safe; protected by RLS) |
| `NEXT_PUBLIC_SITE_URL` | public | base URL for the join link/QR |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | _not used by the app_; only the optional live security check uses it |

The **service_role key is never shipped to the client** and is not needed to run
the app — every privileged action is a host-only RPC.

---

## Supabase setup

1. Create a Supabase project. Note the project URL and the **anon** key.
2. Apply the migrations **in order** (`0001` → `0002` → `0003`). Either:
   - paste each file into the SQL editor, or
   - with the Supabase CLI: `supabase db push` (place files under
     `supabase/migrations`).
3. **Auth**: enable **Email (magic link)** for hosts and **Anonymous sign-in**
   for students (Authentication → Providers / Sign-in).
4. Apply the [hardening checklist](#supabase-hardening-checklist).

---

## Running locally

```bash
npm install
npm run test            # game-math unit tests (Vitest)
npm run dev             # Next.js dev server on http://localhost:3000
```

**Prove the database security model (no cloud needed, just Docker):**

```bash
bash scripts/run-db-selftest.sh
```

This stands up a disposable Postgres, applies the real migrations against a tiny
mock of Supabase's `auth.uid()` / role surface, and runs `db_selftest.sql`,
which asserts (and aborts on any failure) that:

- a **student cannot** call `resolve_round`, `lock_round`, or `create_session`;
- a **student cannot** write `current_wealth` or another player's allocation;
- a **student cannot** submit `risky > current_wealth`;
- a **student cannot** see another student's allocation, or a non-member the
  session/players; a hidden leaderboard is denied to students but not the host;
- the **wealth math** computed by the SQL matches the spec's worked examples,
  including the non-submitter "all-safe" default.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_SITE_URL` (your production URL) as Vercel env vars. Do **not**
   set the service_role key in Vercel.
3. Deploy. Add the Vercel URL to Supabase **Auth → URL Configuration** (Site URL
   + redirect URLs) so magic-link sign-in returns to your app.

---

## Security model

- **Default-deny RLS on every table.** Clients connect as the non-owner
  `anon`/`authenticated` roles, so every direct query is subject to policy.
- **All wealth/market math runs only in `resolve_round`**, a SECURITY DEFINER
  function that asserts `auth.uid() = sessions.host_id`, refuses unless the round
  is `locked`, validates `0 ≤ risky ≤ current_wealth`, defaults non-submitters to
  all-safe, and is the **only** writer of `players.current_wealth`.
- **Host privilege is tied to a verified auth uid**, not a guessable secret.
  Hosts sign in with a magic link; `create_session` rejects anonymous callers.
- **Students** sign in anonymously; they may upsert **only their own**
  allocation, **only while the round is `open`**, with the risky bound enforced
  in the RLS `WITH CHECK`. Column grants limit their writes to
  `risky_amount`/`safe_amount` (players: `display_name` only).
- **Pending allocations are private**: a student can never select another
  student's allocation (pending or revealed).
- **Leaderboard visibility** is config-gated. When hidden, students get only
  their rank via `get_my_rank()` (returns rank + total, never the list).
- The market outcome is **written only at reveal time**, so it cannot leak early.

### Supabase hardening checklist

- [ ] **RLS enabled** on `sessions`, `players`, `rounds`, `allocations` (done by
      `0002_rls.sql`).
- [ ] **Anonymous sign-in ON; all other public sign-ups OFF** except email
      magic link for hosts.
- [ ] **Auth rate limits** set (sign-in / OTP / anonymous) to throttle abuse.
- [ ] **Realtime restricted to authenticated** and only the four game tables are
      in the `supabase_realtime` publication (done by `0002_rls.sql`).
- [ ] **Anon/authenticated table grants** locked to exactly what the policies
      need — column-scoped (done by `0002_rls.sql`); verify no extra grants exist.
- [ ] **service_role key** present only in server-side secrets, never in client
      env or the repo.
- [ ] Confirm `resolve_round` / host RPCs reject non-host callers (run the DB
      self-test, or the live `security-check.ts`).
```
