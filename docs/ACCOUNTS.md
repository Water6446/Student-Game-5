# Accounts — how the account system works

The reference for the account layer: who can do what, where each piece lives,
the security rules it depends on, and what Vercel + Supabase actually limit.

Companion docs: **[DEPLOYMENT.md](./DEPLOYMENT.md)** (dashboard setup and the
launch checklist), **[../DESIGN.md](../DESIGN.md)** (UI system),
**[../MECHANICS.md](../MECHANICS.md)** (game numbers). The migrations themselves
are the source of truth for every rule below; this document explains them.

---

## Status — what is built

The account layer is **implemented** (migrations `0016`–`0025` and `0027`–`0030`, plus
the UI). Two
things are deliberately not done yet: closing the anonymous-host testing bypass
(a launch step — [DEPLOYMENT.md Part C.1](./DEPLOYMENT.md#1-undo-the-temporary-testing-bypass--required))
and the "later" list in [§7](#part-7--whats-left).

| Piece | Where |
| --- | --- |
| `profiles` (username, display name, institution, role, plan) | `0016_profiles.sql` |
| Sign-up trigger, username generation / availability / rename | `0016_profiles.sql` |
| Guest → account claim, cross-session history (`claim_my_account`, `get_my_history`) | `0017_claim_account.sql` |
| Session quota + player cap (triggers) | `0018_quotas.sql` |
| Guest retention: sever, don't cascade (`purge_stale_guests`) | `0019_guest_retention.sql`, revised in `0024` |
| Export / deletion preview / delete | `0020_account_lifecycle.sql` |
| Username → email lookup, secret-gated | `0021_username_login.sql` |
| Brute-force throttle for the proxied username path | `0022_login_throttle.sql`, revised in `0024`; attempts counted up front in `0027_login_reserve.sql` |
| Host dashboard overview | `0023_session_overview.sql` |
| **Signed-out callers locked out of every RPC but sign-in**; purge spares anonymous hosts | `0024_account_edge_cases.sql` |
| Host renames a session (`set_session_label`) | `0025_rename_session.sql` |
| Player names: cleaned, 40 chars, lobby-only renames; host rename/remove; `auth_uid` not client-readable | `0028_player_names.sql` |
| Internal helpers withdrawn from clients; size limits on profile text and session config | `0030_hardening.sql` |
| "Confirm it's you" before changing email/password/Google or deleting the account | `components/account/ConfirmIdentity.tsx`, `lib/auth/reauth.ts` |
| Sign-in / register card, Google, reset page | `components/auth/SignInCard.tsx`, `app/auth/reset/` |
| The one login URL | `app/login/` |
| Account dropdown in the site header | `components/marketing/AccountMenu.tsx` |
| Account page (profile, identities, history, export, delete) | `app/account/`, `components/account/` |
| "Keep your results?" prompt | `components/student/SaveResultsPrompt.tsx` |
| Who may host (and the testing bypass flag) | `lib/auth/can-host.ts` |
| Open-redirect guard for `?next=` | `lib/auth/next-path.ts` (+ unit tests) |
| Privacy policy and terms | `app/privacy/`, `app/terms/`, `LEGAL` in `lib/marketing/content.ts` |
| Offline proof: 40 SQL assertions | `scripts/accounts_selftest.sql` — `npm run test:db` |
| Live proof over the network | `scripts/security-check.ts` — `npm run security-check` |

> **Grants on Supabase are not what they look like.** Supabase grants EXECUTE on
> every new `public` function *directly* to `anon`, so `revoke all ... from public`
> does not stop a signed-out caller. And a host check written
> `host_id <> auth.uid()` is skipped when there is no JWT (`auth.uid()` is NULL,
> `if NULL` is false). `0024` revokes `anon` from everything but the four sign-in
> functions, and the self-test asserts that exact list, so a new function that
> forgets to revoke `anon` fails `npm run test:db`. Prefer
> `host_id is distinct from auth.uid()` in new host checks.

**Before any of it works in production**, the dashboard steps in
[DEPLOYMENT.md Part B](./DEPLOYMENT.md#part-b--accounts-setup) have to be done:
Google OAuth credentials, manual linking, CAPTCHA, the `USERNAME_LOOKUP_SECRET`
pair, and — when email is switched on — custom SMTP. Username sign-in fails
closed until its secret exists: the form quietly accepts email addresses only.

---

## Part 1 — The identity model

Three classes of identity:

```
                        can host?   survives browser?   costs an MAU?
  Guest player          no*         no                  yes (while active)
  Claimed student       yes         yes                 yes
  Host account          yes         yes                 yes
```

\* except while the testing bypass is live (`NEXT_PUBLIC_ALLOW_ANON_HOST` plus
migration `0008`). Hosting is gated on "not anonymous" plus the quota — not on a
role bit — so any permanent account may host, and there is no role to escalate.

### 1.1 The linchpin: anonymous → permanent keeps the same user id

In Supabase, converting an anonymous user to a permanent one *links an identity
to the existing user* — `updateUser({ email })`, `updateUser({ password })` or
`linkIdentity({ provider: 'google' })`. **The `auth.users.id` does not change.**

So a student who joins anonymously, plays four sessions, then claims an account
keeps all four: their `players.auth_uid` rows already point at that id. No row
migration, no merge step, and every RLS policy keyed on `auth_uid = auth.uid()`
keeps working. The self-test asserts it ("a claimed guest keeps the sessions
played before claiming").

The one rule: **`is_anonymous` is authoritative only when read from
`auth.users` server-side — never from a client-supplied claim.**

### 1.2 Where authorization data lives — and the footgun to avoid

> **Never put a role, plan, or entitlement in `user_metadata`.**
> `user_metadata` (`raw_user_meta_data`) is writable by the user themself via
> `supabase.auth.updateUser({ data: … })`. Anything the server must trust belongs
> in a table the user cannot write (`public.profiles`, with column-scoped
> grants), or in `app_metadata`, which the client cannot touch.

`profiles.role` and `profiles.plan` have **no client update grant**; clients may
update `display_name` and `institution` only, and change the username only
through `set_my_username`. The mock in `scripts/_supabase_mock.sql` carries a
writable `raw_user_meta_data` precisely so the self-test can prove nothing
trusts it.

---

## Part 2 — Schema

Every migration is idempotent in the repo's style (`create ... if not exists`,
`create or replace`, `drop policy if exists`).

### 2.1 `0016_profiles.sql` — the account record

One row per **permanent** user, created by an `after insert` trigger on
`auth.users`; guests get no profile until they claim. Readable and updatable by
the owner only. Usernames are generated unique at sign-up and changed through
`set_my_username`; `username_available` is one of the four functions a
signed-out caller may use.

### 2.2 `0017_claim_account.sql` — the student claim

`claim_my_account` runs *after* the client has linked an email, password or
Google identity, and re-reads `is_anonymous` from `auth.users` itself, so an
anonymous caller is refused. `get_my_history` is the payoff: one row per session
the account has played, filtered hard on `auth.uid()`.

### 2.3 `0018_quotas.sql` — abuse limits with a billing hook

- **Session quota**, via `session_quota(uid)`: free 12 / pilot 100 / dept 500
  sessions per rolling 30 days, read from `profiles.plan`. Enforced by a
  `BEFORE INSERT` trigger on `sessions` rather than inside `create_session` —
  that function is ~250 lines and `create or replace`-ing it for every policy
  tweak is how two definitions drift apart; a trigger also covers any future
  insert path.
- **Player cap**: 400 humans per session (bots excluded), also a trigger.
- The `sessions(host_id, created_at)` index both need.

When billing arrives it sets `profiles.plan` from a Stripe webhook and nothing
else changes.

### 2.4 `0019_guest_retention.sql` — cleanup that doesn't eat history

Anonymous guests accumulate forever otherwise. The design choice that matters:
**deleting a guest severs their results, it does not delete them.**

- `players.auth_uid` is `ON DELETE SET NULL` (it used to cascade, which would
  have deleted a past class's results along with a stale guest). A trigger
  stamps `purged_at` on the severed row, and the row invariant is
  `auth_uid is not null or is_bot or purged_at is not null`.
- The `players` row keeps its display name and wealth curve; only the link to a
  person is cut. RLS stays correct by construction — `auth_uid = auth.uid()` is
  false for a NULL row, so a severed record is readable by the host only.
- This is also the erasure primitive for account deletion (§2.5).

`purge_stale_guests(p_days default 45)` (as revised in `0024`) deletes anonymous
users with no activity inside the window, and never one who is still in an
unfinished session, joined a game inside the window, or **hosts anything** (the
cascade on `sessions.host_id` would take the class with them). It refuses a
window under 7 days, and only the table owner can run it — schedule it with
`pg_cron` (DEPLOYMENT.md Part B § 6).

### 2.5 `0020_account_lifecycle.sql` — export & delete

- `export_my_data()` — profile, hosted sessions and every played session, own
  rows only.
- `my_deletion_preview()` — the counts the UI shows before deletion.
- `delete_my_account()` — **refused while the account hosts any unfinished
  session.** Otherwise it deletes the profile and the `auth.users` row: player
  rows elsewhere are severed (§2.4), but sessions this account *hosted* cascade
  away with every student's rows in them — which is why the UI shows the preview
  and requires a typed confirmation.

### 2.6 `0021`–`0030` — sign-in plumbing, edge cases, hardening

- `0021` `email_for_username(username, secret)` and the `app_secrets` table
  (§3.4).
- `0022` the login throttle behind the username path (§3.4).
- `0023` `get_my_sessions_overview()` for the host dashboard, plus the session
  label clamp (trimmed, 80 chars, dropped when blank).
- `0024` signed-out callers locked out of every RPC but sign-in; purge spares
  anonymous hosts; per-bucket throttle limits.
- `0025` `set_session_label`, so a host can rename a session.
- `0027` `login_begin` / `login_finish`: the username throttle books each attempt
  *before* the password check, so a burst of parallel guesses cannot all slip
  past the count (§3.4).
- `0028` player names (cleaned, 1–40 chars, renamed only in the lobby via
  `set_my_display_name`), `host_rename_player` / `host_remove_player` with a
  rejoin ban, and column-scoped `SELECT` on `players` that leaves `auth_uid`
  out (students find their own row with `get_my_player_id`).
- `0029` (a game migration) hidden odds move to `session_secrets`.
- `0030` internal helpers withdrawn from `authenticated`; length limits on
  `profiles.display_name` (80) and `institution` (120); a 32 KB cap on
  `sessions.config`.

---

## Part 3 — Sign-in methods

### 3.1 Email links — built, switched off until there is an email provider

Magic link, sign-up confirmation and password reset all exist in code, but the
UI hides them unless `NEXT_PUBLIC_EMAIL_DELIVERY=true`: Supabase's built-in
sender allows **2 emails an hour on every plan**, Pro included. Turning email on
needs custom SMTP, SPF/DKIM/DMARC and "Confirm email" back on —
DEPLOYMENT.md Part B § 2b.

### 3.2 Google OAuth

`signInWithOAuth({ provider: 'google' })`; `/auth/callback` does the PKCE
exchange. The student claim flow and "Link a Google account" use
`linkIdentity()`, which needs **manual linking** enabled in the dashboard.

**One security note (T5).** Supabase automatically links a new OAuth identity to
an existing user when the provider returns the *same verified email*. That is
correct for Google, which always verifies. If a provider that returns
unverified emails is ever added, the same convenience becomes an account
takeover: an attacker signs up with the victim's address at the sloppy provider
and inherits the account. **Only add providers that verify email.**

### 3.3 Email + password — the largest surface, so the most care

Supabase handles hashing (bcrypt); the policy is ours:

- **Minimum length 10** — the app's forms enforce it
  (`lib/auth/validation.ts`); set the dashboard to match.
- **Leaked-password protection** (HaveIBeenPwned) — needs **Pro or above**, one
  of the reasons §6.4 calls Pro non-optional.
- **CAPTCHA** on sign-up, sign-in and reset (§4, T1/T2).
- **Generic responses** on the reset form, so it is not an account-existence
  oracle.
- While "Confirm email" is **off** (DEPLOYMENT.md Part B § 2), nothing verifies
  that an address belongs to its owner, and a forgotten password cannot be
  recovered unless Google is linked. Acceptable for a pilot, not for launch.

### 3.4 Signing in with a username — and why it needs a server secret

Registration takes username + email + password, and sign-in accepts **either
the email or the username**. Supabase Auth has no username login —
`signInWithPassword` takes an email — so something has to map username → email
*before* GoTrue sees the request, and that mapping is the whole security
problem:

| Option | Verdict |
| --- | --- |
| Open RPC `username → email`, callable by anyone | **Rejected.** An email harvester: guess handles, collect addresses, phish or credential-stuff them |
| Verify the password in Postgres with `crypt()`, return the email only on success | **Rejected.** A home-rolled auth path outside GoTrue's rate limiting — an unthrottled password oracle |
| **Shipped:** the lookup requires a server-only shared secret, so only our own Route Handler (`app/api/auth/sign-in`) can do it | GoTrue still performs every password check and keeps its own limits; we only resolve an identifier |

**Why a scoped secret rather than the `service_role` key.** `service_role`
bypasses RLS entirely, so leaking it means the whole database — `session_secrets`
included. Leaking `app_secrets.username_lookup` means username → email
enumeration and nothing else: the same setup cost, a far smaller blast radius,
and the app still holds no key that can bypass RLS.

- **It fails closed.** No secret configured → the lookup returns `NULL` for
  every call and the form accepts email only. It never fails open.
- **The proxied path has its own throttle** (`0022`, revised in `0024`). An email
  login goes straight from the browser to Supabase, so GoTrue sees the real
  client IP. A username login cannot: every attempt arrives from Vercel's egress
  IP, one shared bucket that is useless as a brute-force limit and a
  self-inflicted DoS. So the proxy counts failures itself — per targeted
  username (locks after 8) and per salted hash of the caller's IP (locks after
  30, so one campus NAT cannot lock out the campus) — for 15 minutes. No IP is
  stored.
- **Each attempt is counted before it runs** (`0027`). `login_begin` books the
  attempt as a failure and decides whether it may proceed in one locked step;
  `login_finish` then forgives it (`ok`), hands it back (`refund`, for an outage
  or GoTrue's own rate limit), or leaves it (`wrong`). Checking first and
  booking after — the `0022` shape — let a burst of simultaneous guesses all
  read "not locked".
- **The IP is taken from the header the platform controls.** On Vercel that is
  the first `x-forwarded-for` entry; anywhere else it is the *last* one, the
  address the proxy appended (`lib/auth/request-guard.ts`).
- **Login CSRF.** The route accepts only an exact `application/json` body and
  refuses requests the browser marks `Sec-Fetch-Site: cross-site`.


### 3.5 Changing how an account signs in — "confirm it's you"

A signed-in browser left unattended is the realistic takeover here: the
professor's laptop at the front of the room, a lab PC someone forgot to sign
out of. Without a check it was two clicks from a stolen account — new email,
new password — and with email off, the owner had no way back.

So the account page shows **change email, change password, link Google and
delete account** only when the session was proven by a real sign-in in the last
10 minutes. The evidence is the access token's `amr` claim, which GoTrue stamps
on every password, Google, emailed-link or recovery sign-in (refreshing a token
does not); `anonymous` never counts. Otherwise the page asks for the current
password, or a Google sign-in for accounts that have Google linked
(`components/account/ConfirmIdentity.tsx`).

- `/auth/reset` sets a new password only for a session that fresh — i.e. one
  that just came from a reset link. Anyone else is sent to `/account`.
- The join form asks "is that you?" before joining a game as a real account
  signed in on that browser; "no" signs that browser out (locally only) and
  joins as a guest.
- **Limits.** This is a UI gate: it stops the person at the keyboard, not
  someone who has lifted the tokens out of the browser (that is T6 — the CSP).
  Supabase's "Secure password change" is the server-side half, but it needs
  email to re-authenticate, so it waits for SMTP (DEPLOYMENT.md Part B). And if
  that browser is still signed in to Google, Google may not ask for a password.

---

## Part 4 — Security

The threat model extends the one in the `0002_rls.sql` header: *a curious
student with dev tools and the public anon key*, plus *an anonymous person on
the internet who wants free compute, an inbox to spam, or someone else's
account*.

| # | Threat | Mitigation | Where |
| --- | --- | --- | --- |
| T1 | **Bot mass-creates anonymous users** — inflates `auth.users`, DB size and the MAU meter | CAPTCHA on anonymous sign-in (dashboard, **pending**); the 30/hr/IP limit; `purge_stale_guests()`; the player cap | DEPLOYMENT B § 4, §2.3, §2.4 |
| T2 | **Credential stuffing** against password sign-in | Leaked-password protection (Pro); CAPTCHA; per-IP limits; min length 10; the username-path throttle | §3.3, §3.4 |
| T3 | **Email bombing / enumeration** via magic link or reset | Email off until custom SMTP with its own quota; generic reset responses | §3.1, §3.3 |
| T4 | **Privilege escalation to host** | `role`/`plan` live in `profiles` with **no client update grant**; never in `user_metadata`. The guest-hosting bypass is **live on purpose** until the launch revert | §1.2, DEPLOYMENT C.1 |
| T5 | **Account takeover via OAuth email collision** | Only verified-email providers | §3.2 |
| T6 | **Session hijacking / XSS token theft** | `@supabase/ssr` cookie handling (`lib/supabase/`); a CSP allowlisting Supabase `https:` **and `wss:`** (omitting `wss:` silently kills realtime) is still to do | DEPLOYMENT C § 6 |
| T7 | **Cross-account data leaks** | `profiles` policies are `id = auth.uid()` only; `get_my_history` and `export_my_data` filter on `auth.uid()` inside `SECURITY DEFINER` bodies; `players.auth_uid` is not client-selectable (`0028`) | §2 |
| T8 | **Student PII exposure** (claimed accounts carry an email) | Email never required to play; export + delete RPCs; privacy policy | §2.5, §5.3, §6.6 |
| T9 | **Quota bypass by making many host accounts** | The quota is per account, so this is the residual risk. Bounded by CAPTCHA and (once on) email verification; if it ever matters, gate on verified institutional domains | §2.3 |
| T10 | **Someone at an unattended, signed-in browser** (the lecture laptop, a lab PC) changes the email and password, links their own Google, or deletes the account | "Confirm it's you": those actions appear only within 10 minutes of a real sign-in (`amr` claim, `lib/auth/reauth.ts`); `/auth/reset` sets a password only for a fresh session; the join form asks before playing as a signed-in account. Server-side half: "Secure password change", once email works | §3.5, DEPLOYMENT B |

### 4.1 Verification — prove it, don't assume it

Two layers:

- **`npm run test:db`** — offline and canonical. Applies every migration to a
  throwaway in-process Postgres and runs `scripts/db_selftest.sql` (the game)
  and `scripts/accounts_selftest.sql` (this layer) as attacker identities.
- **`npm run security-check`** — the same denials over the real network path
  (PostgREST/RPC with the public anon key), against a live project.

Rule: **every new RPC and every new policy gets a denial test in the same
change.**

---

## Part 5 — UI surfaces

Built from `components/ui.tsx` primitives and semantic tokens, per DESIGN.md.

### 5.1 Sign-in — `/login`

One card (`components/auth/SignInCard.tsx`): sign in with username or email plus
password, register (username + email + password), Google, and — only when email
delivery is on — magic link and reset. The testing bypass button ("Skip email —
sign in for testing") renders while `NEXT_PUBLIC_ALLOW_ANON_HOST` is on.

### 5.2 `/account`

Profile (display name, institution, username), linked identities (add Google,
change email), game history, "Download my data" (`export_my_data`), and a
destructive-styled "Delete account" behind the deletion preview and a typed
confirmation.

### 5.3 The student claim prompt — the part to get right

Offered **at the end of a session**, in `StudentFinished.tsx`, never before. One
line, dismissible, and it never gates the results the student is already
looking at:

> *Keep your results? Save them to an account to see your history across
> sessions.* → **Save my results** · *No thanks*

The constraints, because this is where an account system usually turns
user-hostile:

- **Never block play.** No prompt on `/join`, none mid-round.
- **Dismissal sticks** — remembered locally so it isn't asked every session.
- **Ask for the minimum.** A username, plus an email only if they choose that
  route over Google. No institution, no student ID, no real name.
- **Say what it costs them.** One line noting that this stores their email, and
  that they can delete it later from `/account`.

---

## Part 6 — Hosting: what actually limits you

Researched September 2026; sources at the end. Prices move, so re-check before
acting on the numbers.

### 6.1 The two conflated worries

"People making many accounts" is really two different problems, and only one of
them is about hosting:

1. **Legitimate growth.** Not the binding constraint, and not close — the MAU
   meter has enormous headroom for classroom use (§6.3).
2. **Malicious mass signup.** A *security control* problem (T1), not a hosting
   problem. CAPTCHA plus the guest cleanup job solves it for $0. Without them,
   no amount of plan headroom helps, because the growth is unbounded.

### 6.2 Current ceilings

**Vercel**

| | Hobby | Pro |
| --- | --- | --- |
| Price | $0 | $20/user/mo annual, $24 monthly |
| **Commercial use** | **Not permitted** | Permitted |
| Fast data transfer | ~100 GB/mo, **hard cap** (no overage billing) | 1 TB, then ~$40/TB |
| Functions | limited | 1,000 GB-hrs, then ~$40/GB-hr |
| Build minutes | limited | 6,000, then ~$0.005/min |

**Supabase** (billed per organisation)

| | Free | Pro | Team |
| --- | --- | --- | --- |
| Price | $0 | $25/mo (incl. $10 compute credits) | $599/mo |
| Database | 500 MB | 8 GB | 8 GB |
| MAU | 50,000 | 100,000 | 500,000 |
| MAU overage | — | ~$0.00325–0.0034 each | same |
| Realtime concurrent | **200** | **500**, then $10 per extra 1,000 peak | same |
| Realtime messages | 2M/mo | higher, then $2.50/1M | same |
| Leaked-password protection | no | yes | yes |
| **Inactivity auto-pause** | **after 7 days** | never | never |
| Active projects | 2 | unlimited | unlimited |

### 6.3 What those ceilings mean for *this* app

Worked through with this game's shape (N students, R rounds). The point is the
order of magnitude and which term dominates.

**Database size — a non-issue.** An `allocations` row is on the order of 150
bytes with index overhead. A 200-student, 25-round session is 5,000 rows ≈
**~1 MB**. Free's 500 MB holds hundreds of sessions. What would actually fill
the DB is T1 — junk `auth.users` rows.

**MAU — enormous headroom.** Each distinct browser profile is one anonymous
user, so a 200-student lecture ≈ 200 MAU. Free's 50,000 needs ~250 such lectures
*in one month*.

**Realtime concurrency — the first limit that actually bites.** Every open page
holds one socket: each student, the host dashboard, and the present view. A
200-student lecture is ~202 concurrent connections, which **exceeds the Free
tier's 200 cap on the first full class.** Pro's 500 covers two mid-size classes
at once. (The 400-player cap in `0018` sits well above any real lecture; this
ceiling bites long before it does.)

**Realtime messages — the one with a quadratic term.** Students subscribe to
`postgres_changes` on **every `players` row in the session** (`usePlayers` on
`app/play/[sessionId]/page.tsx`), and a reveal updates all N rows, so each
reveal costs ≈ N × (N+1) messages and a session ≈ **N² × R**:

| Students | Messages / 25-round session | On Free (2M/mo) | Pro overage @ $2.50/1M |
| --- | --- | --- | --- |
| 50 | ~64,000 | fine | ~$0.16 |
| 200 | ~1.0M | ~2 sessions/month | ~$2.50 |
| 500 | ~6.3M | over on session 1 | ~$16 |
| 1,000 | ~25M | over | ~$63 |

Cheap in dollars on Pro, but it grows fastest, and the fix is small: have
students subscribe to **one aggregated leaderboard row per session** instead of
N player rows — N² × R becomes N × R, a ~200× reduction at 200 students. Worth
doing before a 300+ person lecture (§7).

### 6.4 Recommendation

**Stay on Vercel + Supabase. Move to the paid tiers, not to a different vendor.**

1. **Before the first real class: Supabase Pro, $25/mo.** Not optional, for
   three independent reasons — Free's 200-connection realtime cap is under one
   lecture, Free auto-pauses after 7 days of inactivity (a semester has longer
   gaps), and leaked-password protection is Pro-only (§3.3).
2. **Before charging anyone: Vercel Pro, $24/mo.** Hobby forbids commercial use,
   so the first invoice makes it a licence problem, not a capacity one.
3. **Total at launch: roughly $50/month**, plus a few dollars of realtime
   overage on the biggest lectures.

**Watch-list — the thresholds that would change the answer:**

| Watch | Threshold | Do this |
| --- | --- | --- |
| Concurrent realtime peak | > 500 | Pay the $10/1,000 overage first; far cheaper than Team at $599 |
| Realtime messages | > ~5M/mo | Ship the aggregated-leaderboard fix (§6.3) before paying more |
| MAU | > 100k | **Check for abuse first** (T1). Real classes should not get here |
| DB size | > 8 GB | Almost certainly junk guest rows — run the purge job |
| Vercel bandwidth | > 1 TB/mo | Unlikely; this app ships text and small JSON |
| Charging money | any | Vercel Pro, immediately |

### 6.5 If you ever do outgrow it — the migration path that matters

| Portable (little work) | Sticky (real work) |
| --- | --- |
| The Next.js app — Vercel, Cloudflare, Railway, Render and Coolify all run it | **Supabase Auth (GoTrue)** — the user table, identities, and every `auth.uid()` in the migrations |
| The Postgres schema and migrations — plain SQL | **Supabase Realtime** — `postgres_changes` is not a standard Postgres feature |
| RLS policies — standard Postgres | PostgREST-shaped client calls (`.from()`, `.rpc()`) |

The consequence: **the escape hatch is self-hosted Supabase, not a different auth
vendor.** It runs the same GoTrue, Postgres, RLS and Realtime, so it is a data
migration, not a rewrite. Ranked options if the bill or the limits ever force a
move:

1. **App tier off Vercel, keep Supabase** (Cloudflare, Railway, Render). Small
   change; the cheap 80%.
2. **Self-hosted Supabase** (e.g. Hetzner via Coolify). Around $10–40/mo of
   infra — a small saving at this scale.
3. **Full self-host of everything.** ~2–5 hours of maintenance a month, and you
   own GoTrue security patches, email deliverability, backups and PITR. Not
   recommended for a solo maintainer holding student results.

### 6.6 Compliance, briefly (not legal advice)

Optional student accounts introduce student email — PII, where otherwise the app
stores only a display name and numbers.

- [ ] **Sign Supabase's DPA** and, with EU students, put the project in an **EU
      region**. *(dashboard/legal)*
- [x] **Privacy policy** naming what's stored, the retention window, and how to
      get data out or deleted (`app/privacy/`); `export_my_data` /
      `delete_my_account` implement that promise.
- [x] **Data minimisation as a hard rule** — never require an email to play.
- [ ] Under FERPA the university is typically the controller and the app the
      processor acting as a "school official"; under GDPR, controller/processor
      respectively. A university will eventually ask for a DPA — have one ready.

---

## Part 7 — What's left

**Before launch** (DEPLOYMENT.md has the steps):

- [ ] The dashboard setup in Part B — Google, manual linking, CAPTCHA
      (including anonymous sign-in), password policy, the username secret, the
      retention schedule.
- [ ] Supabase Pro (§6.4).
- [ ] **Close the testing bypass** — DEPLOYMENT.md Part C.1. Its tests change
      with it, and CLAUDE.md's "Notable" note must stop saying it is live.

**Later, not now:**

- [ ] Email on: custom SMTP + "Confirm email" (§3.1).
- [ ] TOTP MFA for host accounts.
- [ ] Institutional SSO (SAML) — needs Supabase Pro/Team + per-university setup.
- [ ] Billing: Stripe → `profiles.plan`; unpark `components/marketing/Pricing.tsx`.
- [ ] The aggregated-leaderboard realtime fix (§6.3) — before a 300+ lecture.
- [ ] A Content-Security-Policy (T6).

### Decisions in force

| Decision | Setting |
| --- | --- |
| May a claimed student host? | Yes — hosting is gated on "not anonymous" + quota, not a role |
| Host deletes an account with running sessions | Refused, naming the count; finished hosted sessions are deleted with the account |
| Free session quota | 12 per rolling 30 days (pilot 100, dept 500) |
| Player cap | 400 humans per session |
| Guest retention | 45 days by default; never under 7; never a guest who hosts |

---

## Sources

Pricing and platform limits, retrieved September 2026 — verify before acting:

- [Supabase Pricing 2026: Plans, Overage Rates, and Real Monthly Costs — Flexprice](https://flexprice.io/blog/supabase-pricing-breakdown)
- [Supabase Pricing in 2026: Plans, Free Tier Limits & Full Breakdown — UI Bakery](https://uibakery.io/blog/supabase-pricing)
- [Supabase Pricing 2026: Real Costs Exposed — MetaCTO](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [Supabase Realtime in Production: Limits & Fixes (2026) — Agile Soft Labs](https://www.agilesoftlabs.com/blog/2026/05/supabase-realtime-in-production-what)
- [Vercel Free vs Pro Plan in 2026: Real Limits, Pricing — Fencode](https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing)
- [Is Vercel Free? 2026 Pricing, Limits & the 100GB Bandwidth Cap — PandaCodegen](https://www.pandacodegen.com/blog/nextjs-hosting-zero-cost)
- [Vercel Pricing in 2026: Plans, Credits — Flexprice](https://flexprice.io/blog/vercel-pricing-breakdown)
- [Supabase Email Rate Limit Exceeded: Causes and Fix 2026 — Axonbuild](https://axonbuild.com/blog/supabase-email-rate-limit/)
- [Fix Rate Limit Issues in Supabase — RapidDev](https://www.rapidevelopers.com/supabase-tutorial/how-to-fix-rate-limit-issues-in-supabase)
- [Best Vercel Alternatives in 2026 — Encore.dev](https://encore.dev/articles/vercel-alternatives)
- [10 Vercel Alternatives for Deploying Apps in 2026 — DigitalOcean](https://www.digitalocean.com/resources/articles/vercel-alternatives)
- [Deploy Self-Hosted Supabase on Hetzner Cloud with Coolify — Hetzner Community](https://community.hetzner.com/tutorials/coolify-supabase-deploy/)
- [The True Cost of Self-Hosting Supabase — Supascale](https://www.supascale.app/blog/the-true-cost-of-selfhosting-supabase-a-breakdown)
- [Supabase Pricing Hidden Costs at Scale — BuildMVPFast](https://www.buildmvpfast.com/blog/supabase-pricing-hidden-costs-scale-alternatives-2026)
- [Student Data Privacy Governance: FERPA & GDPR — Secure Privacy](https://secureprivacy.ai/blog/student-data-privacy-governance)
- [FERPA Compliance Guide (Updated 2026) — UpGuard](https://www.upguard.com/blog/ferpa-compliance-guide)
