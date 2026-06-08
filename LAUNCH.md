# 🚀 Launch checklist

Everything needed to take the investment-risk game from "testing" to "live for a
real class." Work top to bottom. Items marked **(I can do this)** are code changes
I'll make in one PR when you say go; the rest are dashboard/console steps only you
can do.

Supabase project ref: `mftrhnwnvidxjdzenmip`

---

## 1. Undo the temporary testing bypass  ⚠️ REQUIRED

While testing we let anyone host without email. This must come out before launch,
or any student could create sessions.

- [ ] **Restore `create_session` security guard** — re-add the "anonymous users may
      not host" check. **(I can do this)** — new migration that re-applies the
      `0007` definition, then `npm run db:push`.
- [ ] **Re-lock the `/host` gate** — in `app/host/page.tsx`, change `if (!user)`
      back to `if (!user || isAnonymous(user))` and restore the `isAnonymous`
      import. **(I can do this)**
- [ ] **Remove the "Skip email — sign in for testing" button** and the
      `skipEmailForTesting` function in `components/host/HostSignIn.tsx`. **(I can do this)**
- [ ] Merge that PR and let Vercel redeploy.

> Tell me **"do the launch revert"** and I'll open this as a single PR.

---

## 2. Supabase dashboard — Auth

- [ ] **Authentication → URL Configuration**
  - **Site URL** = your production URL (e.g. `https://<your-app>.vercel.app`)
  - **Redirect URLs** include `https://<your-app>.vercel.app/**`
        (keep `http://localhost:3000/**` for local dev)
- [ ] **Enable CAPTCHA / Bot Protection for anonymous sign-ins**
      (Authentication → Settings/Attack Protection). Students sign in anonymously,
      so without this a bot could mass-create anonymous users.
- [ ] **Email provider is enabled** and magic links work (Authentication →
      Providers → Email). Send yourself a test link from the live `/host` page.
- [ ] Confirm **anonymous sign-ins** stay **enabled** (students need them).

## 3. Supabase dashboard — Database

- [ ] **Confirm RLS is ON** for `sessions`, `players`, `rounds`, `allocations`
      (Table editor shows a shield; it's enabled by migration `0002`, just verify).
- [ ] **Enable backups / PITR** (Database → Backups) so a class run can be restored.
- [ ] (Optional) **Realtime** is enabled for the four game tables (added by `0002`).

## 4. Vercel

- [ ] **Environment variables** (Settings → Environment Variables, Production):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://mftrhnwnvidxjdzenmip.supabase.co`
        (no trailing slash, no spaces)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your `sb_publishable_...` key
  - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.vercel.app`
- [ ] **Redeploy after any env var change** (`NEXT_PUBLIC_*` are baked in at build time).
- [ ] Production branch is `main`.

---

## 5. Pre-class smoke test (5 min, on the live URL)

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

---

## 6. Optional hardening (nice-to-have, not blockers)  **(I can do these)**

- [ ] **Player cap + config bounds** in `join_session` (anti-abuse) + index on
      `sessions(host_id)`.
- [ ] **Content-Security-Policy** header (must allowlist Supabase `https`/`wss`
      so it doesn't break realtime — tested separately).
- [ ] **Lazy-load Recharts** to shrink the host route's initial JS.

---

## 7. Rollback plan

- App: in Vercel, **Deployments → ... → Promote to Production** on the last known
  good deployment.
- DB: restore from the backup/PITR snapshot taken before class.
- The game is resumable — session/round/wealth state is all server-side, so a
  host refresh (or re-login) picks up exactly where it left off.
