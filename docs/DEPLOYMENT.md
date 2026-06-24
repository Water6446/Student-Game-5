# Deployment — Supabase setup & launch checklist

Everything needed to take the investment-risk game from "testing" to "live for a
real class": the Supabase CLI migration workflow, then a top-to-bottom launch
checklist. Items marked **(I can do this)** are code changes done in one PR; the
rest are dashboard/console steps only the project owner can do.

Supabase project ref: `mftrhnwnvidxjdzenmip`

---

## Part A — Supabase CLI (stop pasting SQL by hand)

Schema changes are applied with the **Supabase CLI** — one command instead of
copy-pasting into the dashboard SQL editor.

### One-time setup (needs a browser + your DB password)

```bash
# 1. Authenticate the CLI with your Supabase account (opens a browser).
#    The token is stored in your home dir, NEVER in this repo.
npx supabase login

# 2. Link this repo to your hosted project (asks for the DB password once).
npm run db:link        # -> supabase link --project-ref mftrhnwnvidxjdzenmip

# 3. Apply every migration in supabase/migrations to the remote DB.
npm run db:push        # -> supabase db push
```

After that, applying a schema change is just `npm run db:push`. Handy extras:

- `npm run db:status` — list which migrations are applied vs pending on the remote.
- `npm run db:diff` — show drift between your migrations and the live DB.

> Once you've run `login` + `db:link`, **`npm run db:push` can be run for you**
> from then on — the auth token lives in your home dir and the link is cached.

The migrations are idempotent (`create ... if not exists`, `create or replace`,
`drop policy if exists`), so re-running over a partially-applied DB is safe.

### Two things that MUST be toggled in the dashboard (not in code)

The CLI's `config.toml` only configures a *local* Supabase. For the hosted
project these are dashboard settings:

1. **Enable anonymous sign-ins** (students auth anonymously to join):
   Dashboard → Authentication → **Sign In / Providers** → **"Anonymous sign-ins"**
   → toggle **ON** → Save. *(A real magic-link host can join without this, but a
   true anonymous student is blocked until it's on — "anonymous sign-ins are
   disabled".)*
2. **Redirect / Site URLs** for magic-link host login:
   Dashboard → Authentication → **URL Configuration**
   - Site URL: `http://localhost:3000` (dev) and your Vercel URL in prod
   - Redirect URLs: add `http://localhost:3000/**` (and the Vercel `/**`)

> **"permission denied for table allocations"** (Postgres 42501) means a missing
> GRANT — migration `0002_rls.sql` wasn't fully applied. Run `npm run db:push`.
> (An RLS *policy* rejection reads "violates row-level security policy" instead.)
> Fast fallback with no CLI: paste `supabase/migrations/0002_rls.sql` then
> `0004_delete_session.sql` into the dashboard SQL editor and run each.

### Testing with multiple students at once

Anonymous auth stores its session in the browser's local storage, so **two tabs
in the same Chrome profile are the same student.** To simulate a real class:

- Normal window = professor (host)
- An **Incognito window** = student 1
- A **different browser** (Firefox/Edge) or a **second Chrome profile** = student 2
- Your **phone** = student 3

Each isolated storage = its own anonymous user.

---

## Part B — Launch checklist

Work top to bottom.

### 1. Undo the temporary testing bypass — REQUIRED

While testing we let anyone host without email. This must come out before launch,
or any student could create sessions. Tell me **"do the launch revert"** and I'll
open this as a single PR:

- [ ] **Restore `create_session` security guard** — re-add the "anonymous users
      may not host" check. **(I can do this)** — new migration re-applying the
      `0007` definition, then `npm run db:push`.
- [ ] **Re-lock the `/host` gate** — in `app/host/page.tsx`, change `if (!user)`
      back to `if (!user || isAnonymous(user))` and restore the `isAnonymous`
      import. **(I can do this)**
- [ ] **Remove the "Skip email — sign in for testing" button** and the
      `skipEmailForTesting` function in `components/host/HostSignIn.tsx`.
      **(I can do this)**
- [ ] Merge that PR and let Vercel redeploy.

### 2. Supabase dashboard — Auth

- [ ] **Authentication → URL Configuration**
  - **Site URL** = your production URL (e.g. `https://<your-app>.vercel.app`)
  - **Redirect URLs** include `https://<your-app>.vercel.app/**`
        (keep `http://localhost:3000/**` for local dev)
- [ ] **Enable CAPTCHA / Bot Protection for anonymous sign-ins**
      (Authentication → Settings/Attack Protection). Without it a bot could
      mass-create anonymous users.
- [ ] **Email provider is enabled** and magic links work (Authentication →
      Providers → Email). Send yourself a test link from the live `/host` page.
- [ ] Confirm **anonymous sign-ins** stay **enabled** (students need them).

### 3. Supabase dashboard — Database

- [ ] **Confirm RLS is ON** for `sessions`, `players`, `rounds`, `allocations`
      (Table editor shows a shield; enabled by migration `0002`, just verify).
- [ ] **Enable backups / PITR** (Database → Backups) so a class run can be restored.
- [ ] (Optional) **Realtime** is enabled for the four game tables (added by `0002`).

### 4. Vercel

- [ ] **Environment variables** (Settings → Environment Variables, Production):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://mftrhnwnvidxjdzenmip.supabase.co`
        (no trailing slash, no spaces)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_...` key
  - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.vercel.app`
- [ ] **Redeploy after any env var change** (`NEXT_PUBLIC_*` are baked in at build time).
- [ ] Production branch is `main`.

### 5. Pre-class smoke test (5 min, on the live URL)

- [ ] Host: sign in with a **real email** magic link → land on dashboard.
- [ ] Create a session → lobby shows the join code + QR.
- [ ] Join as a student in an **incognito window / phone** → name appears in the
      host lobby **without refreshing** (realtime works).
- [ ] Start a round → student submits an allocation → host sees the count rise live.
- [ ] Lock → host sees the per-student breakdown.
- [ ] Reveal → wealth/leaderboard updates live on both ends; chart fills in.
- [ ] Run to the last round → **Finish** → summary + counterfactual + **CSV download** work.
- [ ] Delete the test session.

If realtime needs a refresh: re-check the Vercel `NEXT_PUBLIC_SUPABASE_URL`
(trailing slash) and that you redeployed after setting env vars.

### 6. Optional hardening (nice-to-have, not blockers)  **(I can do these)**

- [ ] **Player cap + config bounds** in `join_session` (anti-abuse) + index on
      `sessions(host_id)`.
- [ ] **Content-Security-Policy** header (must allowlist Supabase `https`/`wss`
      so it doesn't break realtime — tested separately).
- [ ] **Lazy-load Recharts** to shrink the host route's initial JS.

### 7. Rollback plan

- App: in Vercel, **Deployments → ... → Promote to Production** on the last known
  good deployment.
- DB: restore from the backup/PITR snapshot taken before class.
- The game is resumable — session/round/wealth state is all server-side, so a
  host refresh (or re-login) picks up exactly where it left off.
