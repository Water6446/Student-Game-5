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
   → toggle **ON** → Save. *(A signed-in host account can join without this, but a
   true anonymous student is blocked until it's on — "anonymous sign-ins are
   disabled".)*
2. **Redirect / Site URLs** for every sign-in that leaves the site (Google,
   email links) — see Part B § 0b for the details:
   Dashboard → Authentication → **URL Configuration**
   - Site URL: `http://localhost:3000` (dev) and your Vercel URL in prod
   - Redirect URLs: add `http://localhost:3000/**` (and the Vercel `/**`)

> **"permission denied for …"** (Postgres 42501) from the app almost always means
> a migration is pending on the remote: `npm run db:status`, then
> `npm run db:push`. (An RLS *policy* rejection reads "violates row-level
> security policy" instead.)

### Testing with multiple students at once

Anonymous auth stores its session in the browser's local storage, so **two tabs
in the same Chrome profile are the same student.** To simulate a real class:

- Normal window = professor (host)
- An **Incognito window** = student 1
- A **different browser** (Firefox/Edge) or a **second Chrome profile** = student 2
- Your **phone** = student 3

Each isolated storage = its own anonymous user.

---

## Part B — Accounts setup

The account layer (migrations `0016`–`0025`, see
**[ACCOUNTS.md](./ACCOUNTS.md)**) is in the code, but **none of the sign-in
methods work until these dashboard steps are done.** Everything here is a
console/DNS task only the project owner can do.

### 0. Apply the migrations

Nothing below exists in the database until this runs.

- [ ] `npm run db:push` (after the one-time `npx supabase login` + `npm run
      db:link` in Part A). `npm run db:status` lists what is applied vs pending.

### 0b. Allow the app's URL back in — do this before Google

Every method here leaves the site and comes back: OAuth bounces via Google, and
confirmation, reset and magic links arrive from an email. Supabase refuses to
return to a URL that is not on the allowlist, so without this step Google
sign-in appears to work and then dumps you somewhere blank.

- [ ] **Supabase** → Authentication → **URL Configuration**
  - **Site URL**: `http://localhost:3000` while developing, your production URL
    once deployed.
  - **Redirect URLs**: add `http://localhost:3000/**`, plus the production
    `https://<your-app>.vercel.app/**`. Keep both — they can coexist.
  - Using a different dev port (`next dev -p 3100`)? Add that one too; the app
    returns to whatever origin it is served from.

### 1. Google sign-in — do this one first

It needs no email sending at all, which makes it the quickest way to get a real
(non-anonymous) host account.

- [ ] **Google Cloud console** → APIs & Services → Credentials → *Create OAuth
      client ID* (Web application). Authorized redirect URI:
      `https://mftrhnwnvidxjdzenmip.supabase.co/auth/v1/callback`
- [ ] **Supabase** → Authentication → Sign In / Providers → **Google** → on,
      paste the client ID and secret.
- [ ] **Supabase** → Authentication → **Sign In / Providers** → **Allow manual
      linking** → **on** → Save. Without it `linkIdentity()` fails with
      `manual_linking_disabled`, which breaks both "Link a Google account" on
      /account and the student "save my results → Continue with Google" flow.

### 2. Email — currently switched OFF

**As shipped, `NEXT_PUBLIC_EMAIL_DELIVERY` is not `true`**, so the app hides the
magic-link sign-in and the password reset rather than offering flows that cannot
complete. Registration is email + username + password, and the account works
immediately.

For that to hold, **Supabase → Authentication → Providers → Email → "Confirm
email" must be OFF**. With it on, sign-up withholds the session and waits for a
link that will never arrive.

Two consequences while it is off:

- A forgotten password cannot be recovered unless that account has Google linked.
- Anyone can register with an address they do not own, since nothing checks it.
  Fine for a pilot; not something to leave on once real classes depend on it.

Turning it back on is the checklist below plus `NEXT_PUBLIC_EMAIL_DELIVERY=true`
and a redeploy (`NEXT_PUBLIC_*` is baked in at build time).

### 2b. Email — when you are ready to turn it on

The built-in sender allows **2 messages an hour on every plan**, Pro included.
That is unusable for real registration, so custom SMTP is not optional.

- [ ] **Custom SMTP** (Resend, Postmark, SES, SendGrid): Authentication →
      Emails → SMTP Settings.
- [ ] **SPF / DKIM / DMARC** on the sending domain, or university spam filters
      will eat the links.
- [ ] Raise the post-SMTP cap: Authentication → Rate Limits (it defaults to a
      conservative 30/hour even once custom SMTP is on).
- [ ] Authentication → Providers → Email → **Confirm email: ON**. Registration
      depends on it; with it off, sign-up returns a session immediately and the
      "check your email" step is skipped.

### 3. Password policy

- [ ] Authentication → Providers → Email → **Minimum password length ≥ 10**
      (the app's own forms enforce 10; make the server agree).
- [ ] **Leaked password protection: ON** — needs **Pro or above**. This is one
      of the three reasons ACCOUNTS.md §6.4 calls Supabase Pro non-optional.

### 4. Bot protection

- [ ] Authentication → Settings → **CAPTCHA** (hCaptcha or Cloudflare
      Turnstile) → on. Covers sign-up, sign-in and reset.
- [ ] Keep it enabled for **anonymous sign-ins** too — that endpoint is the one
      a bot uses to inflate `auth.users` and your MAU meter (ACCOUNTS.md T1).

### 5. Username sign-in (optional — email login works without it)

Two halves that must carry the **same** value:

```bash
openssl rand -hex 32          # generate it
```

- [ ] **Database** (SQL editor, as the owner):
      ```sql
      insert into public.app_secrets (key, value)
      values ('username_lookup', '<the 64 hex chars>')
      on conflict (key) do update set value = excluded.value;
      ```
- [ ] **Vercel** → Environment Variables → `USERNAME_LOOKUP_SECRET` = the same
      value. **Server-only — never prefix it `NEXT_PUBLIC_`.**

Leave either half unset and username sign-in turns itself off: the form accepts
email addresses only. It fails closed, never open.

### 6. Retention job

Anonymous guests accumulate forever otherwise, and Supabase has no built-in
cleanup. `purge_stale_guests()` severs them from their results rather than
deleting the results (ACCOUNTS.md §2.4).

- [ ] Run it by hand from the SQL editor, or schedule it:
      ```sql
      select cron.schedule('purge-stale-guests', '0 4 * * 0',
                           $$select public.purge_stale_guests(45)$$);
      ```

### 7. Verify

- [ ] `npm run test:db` — the offline self-tests (the game suite and the
      accounts suite) against every migration, on a throwaway in-process
      Postgres. No Docker needed.
- [ ] `npm run security-check` — the same denials over the live network path
      (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; creates and deletes
      its own test users).
- [ ] Register an account, confirm the email, sign out, sign in **by username**,
      then by **email**, then reset the password.

---

## Part C — Launch checklist

Work top to bottom.

### 1. Undo the temporary testing bypass — REQUIRED

While testing, a guest (anonymous) account may host, so the "Skip email — sign in
for testing" button works. This must come out before launch, or any student
could create sessions. Two coupled halves — the flag only hides the button, and
migration `0008` relaxed the **server** independently:

- [ ] **Server — a new migration** (next free number) rejecting guest hosts:

      ```sql
      -- 00NN_restore_host_guard.sql — undo 0008: guests may not host.
      create or replace function public.reject_anonymous_host()
      returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
      begin
        if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
          raise exception 'anonymous users may not host';
        end if;
        return new;
      end;
      $$;
      revoke all on function public.reject_anonymous_host() from public, anon, authenticated;
      drop trigger if exists sessions_reject_anonymous_host on public.sessions;
      create trigger sessions_reject_anonymous_host
        before insert on public.sessions
        for each row execute function public.reject_anonymous_host();
      ```

      **Do not** "re-apply the 0007 definition of `create_session`", as older
      notes said: 0007 predates the portfolio game, the manager game and the
      index fund, and re-applying it would silently remove all three. A trigger
      (the same approach `0018` takes for quotas) guards every insert path
      without copying `create_session`'s ~250 lines again.
- [ ] **Tests** — in `scripts/db_selftest.sql`, make the guest-hosting block
      strict (fail if the guest's `create_session` succeeds). In
      `scripts/accounts_selftest.sql`, the "anonymous host survives the purge"
      scenario creates its session as a guest; seed it as the superuser with
      `request.jwt.claims` cleared instead. Then `npm run test:db`.
- [ ] **Client** — set `NEXT_PUBLIC_ALLOW_ANON_HOST=false` in Vercel (hides the
      button; `lib/auth/can-host.ts` stops letting guests into `/host`) and
      redeploy.
- [ ] `npm run db:push`, then update CLAUDE.md's "Notable" note — the bypass is
      no longer live.

### 2. Supabase dashboard — Auth

- [ ] **Authentication → URL Configuration**
  - **Site URL** = your production URL (e.g. `https://<your-app>.vercel.app`)
  - **Redirect URLs** include `https://<your-app>.vercel.app/**`
        (keep `http://localhost:3000/**` for local dev)
- [ ] **Enable CAPTCHA / Bot Protection for anonymous sign-ins**
      (Authentication → Settings/Attack Protection). Without it a bot could
      mass-create anonymous users.
- [ ] **Email**: either still off (Part B § 2 — "Confirm email" OFF,
      `NEXT_PUBLIC_EMAIL_DELIVERY` unset), or fully on (Part B § 2b, then send
      yourself a magic link from the live `/login` page). Never half-on.
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

- [ ] Host: sign in with a **real account** (Google, or email + password — not
      the testing bypass) → land on the dashboard.
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

(The player cap and the `sessions(host_id)` index shipped in `0018`.)

- [ ] **Content-Security-Policy** header (must allowlist Supabase `https`/`wss`
      so it doesn't break realtime — tested separately).
- [ ] **Lazy-load Recharts** to shrink the host route's initial JS.

### 7. Rollback plan

- App: in Vercel, **Deployments → ... → Promote to Production** on the last known
  good deployment.
- DB: restore from the backup/PITR snapshot taken before class.
- The game is resumable — session/round/wealth state is all server-side, so a
  host refresh (or re-login) picks up exactly where it left off.
