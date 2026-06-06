# Supabase setup & migrations (stop pasting SQL by hand)

This project now uses the **Supabase CLI** so schema changes are applied with one
command instead of copy-pasting into the dashboard SQL editor.

## One-time setup (you do this once — it needs a browser + your DB password)

```bash
# 1. Authenticate the CLI with your Supabase account (opens a browser).
#    The token is stored in your home dir, NEVER in this repo.
npx supabase login

# 2. Link this repo to your hosted project (asks for the DB password once).
npm run db:link        # -> supabase link --project-ref mftrhnwnvidxjdzenmip

# 3. Apply every migration in supabase/migrations to the remote DB.
npm run db:push        # -> supabase db push
```

After this, whenever the schema changes, applying it is just:

```bash
npm run db:push
```

Handy extras:

- `npm run db:status` — list which migrations are applied vs pending on the remote.
- `npm run db:diff`   — show drift between your migrations and the live DB.

> Once you've run `login` + `db:link`, **I can run `npm run db:push` for you**
> from then on — the auth token lives in your home dir and the link is cached, so
> future schema changes don't need any manual steps from you.

## Two things that MUST be toggled in the dashboard (not in code)

The CLI's `config.toml` only configures a *local* Supabase. For the hosted
project these are dashboard settings:

1. **Enable anonymous sign-ins** (students auth anonymously to join):
   Dashboard → Authentication → **Sign In / Providers** → scroll to
   **"Anonymous sign-ins"** → toggle **ON** → Save.
   *(This is why a second test student saw "anonymous sign-ins are disabled" — the
   professor account is a real magic-link user, so it could join, but a true
   anonymous student is blocked until this is on.)*

2. **Redirect / Site URLs** for magic-link host login:
   Dashboard → Authentication → **URL Configuration**
   - Site URL: `http://localhost:3000` (dev) and your Vercel URL in prod
   - Redirect URLs: add `http://localhost:3000/**` (and the Vercel `/**`)

## Why "permission denied for table allocations" happened

That error is Postgres error 42501 — a **missing GRANT**, which means migration
`0002_rls.sql` (the table grants + RLS policies) wasn't fully applied to the
remote DB. (An RLS *policy* rejection reads "violates row-level security policy"
instead — different error.) Running `npm run db:push` applies all four migrations
(`0001`–`0004`) and fixes it. The migrations are idempotent
(`create ... if not exists`, `create or replace`, `drop policy if exists`), so
re-running over a partially-applied DB is safe.

**Fast fallback** (no CLI): open the dashboard SQL editor and paste the contents
of `supabase/migrations/0002_rls.sql` then `supabase/migrations/0004_delete_session.sql`,
and run each.

## Testing with multiple students at once

Anonymous auth stores its session in the browser's local storage, so **two tabs
in the same Chrome profile are the same student.** To simulate a real class:

- Normal window = professor (host)
- An **Incognito window** = student 1
- A **different browser** (Firefox/Edge) or a **second Chrome profile** = student 2
- Your **phone** = student 3

Each isolated storage = its own anonymous user.
