# Accounts — design & rollout plan

How the game goes from "magic-link hosts + anonymous students" to a real account
system, without giving up the frictionless join or the default-deny security
model. Plus the honest answer to "will Vercel + Supabase limit me, and what do I
do about it".

Companion docs: **[DEPLOYMENT.md](./DEPLOYMENT.md)** (launch checklist),
**[../DESIGN.md](../DESIGN.md)** (UI system), **[../MECHANICS.md](../MECHANICS.md)**
(game numbers). Items marked **(I can do this)** are code changes done in a PR;
the rest are dashboard steps only the project owner can do.

---

## Status — what is built

Phases 1–4 are **implemented** (migrations `0016`–`0022` plus the UI). Phase 5,
closing the anonymous-host testing bypass, is deliberately **not** done: it is a
one-migration flip to make when you are ready, and CLAUDE.md asks for the bypass
to stay until then.

| Piece | Where |
| --- | --- |
| `profiles` (username, display name, institution, role, plan) | `0016_profiles.sql` |
| Sign-up trigger, username generation/availability/rename | `0016_profiles.sql` |
| Guest → account claim, cross-session history | `0017_claim_account.sql` |
| Session quota + player cap (triggers) | `0018_quotas.sql` |
| Guest retention: sever, don't cascade | `0019_guest_retention.sql` |
| Export / deletion preview / delete | `0020_account_lifecycle.sql` |
| Username → email lookup, secret-gated | `0021_username_login.sql` |
| Brute-force throttle for the proxied path | `0022_login_throttle.sql` |
| Sign-in / register card, Google, reset page | `components/host/HostSignIn.tsx`, `app/auth/reset/` |
| Account page | `app/account/`, `components/account/` |
| "Keep your results?" prompt | `components/student/SaveResultsPrompt.tsx` |
| 28 SQL assertions | `scripts/accounts_selftest.sql` (`npm run test:accounts-db`) |
| 6 more live assertions | `scripts/security-check.ts` |

**Before any of it works in production**, the dashboard steps in
[DEPLOYMENT.md § Accounts setup](./DEPLOYMENT.md#part-b--accounts-setup) have to
be done: Google OAuth credentials, manual linking, custom SMTP, CAPTCHA, and the
`USERNAME_LOOKUP_SECRET` pair. Username sign-in fails closed until the last of
those exists — the form quietly accepts email addresses only.

Decided scope for this plan:

- **Hosts get real accounts** — magic link, email + password, and Google.
- **Students stay account-free by default**, and may *optionally* claim an
  account to keep their results. The "0 student accounts" promise on the
  homepage stays true: claiming is opt-in and never blocks play.
- **No billing design yet.** The schema leaves clean hook points for it
  (`profiles.plan`, a quota function) so adding Stripe later is additive.

---

## Part 0 — Where things stand

The existing security model is good and this plan builds on it rather than
replacing it. What's already true today:

| Piece | Today |
| --- | --- |
| Host identity | Supabase magic link (`signInWithOtp`) → `sessions.host_id` |
| Student identity | `signInAnonymously()` → `players.auth_uid`, joined via `join_session` RPC |
| Authorization | Default-deny RLS on all 5 tables + `SECURITY DEFINER` predicate helpers (`is_session_host`, `is_session_member`, …) |
| Privileged writes | Host-only `SECURITY DEFINER` RPCs; clients hold no write path to wealth or market outcome |
| Column safety | `grant update (display_name) on players`, `grant insert (…, risky_amount, safe_amount) on allocations` — a student physically cannot write `resulting_wealth` |
| Secrets | `session_secrets` has RLS on, **no policies and no grants**; only `get_manager_truth` reads it |
| Keys | Browser holds only the publishable key. `service_role` is used by nothing but `scripts/security-check.ts` |
| Testing bypass | `NEXT_PUBLIC_ALLOW_ANON_HOST` (default on) + migration `0008` let an anonymous user host. Live and wanted, for now |

### The gaps an account system has to close

1. **No user-owned record anywhere.** There is no `profiles` table. Everything
   about a person lives in `auth.users`, which the app cannot extend.
2. **One sign-in method, and it's the rate-limited one.** Supabase's built-in
   email sender allows **2 messages per hour** — the reason the "skip email"
   bypass exists at all. No custom SMTP means magic link cannot carry a real
   user base.
3. **No account lifecycle.** No profile editing, no data export, no account
   deletion. For a tool holding student results, export and delete are table
   stakes, not nice-to-haves.
4. **No quotas.** Any signed-in user can call `create_session` an unlimited
   number of times. There is not even an index on `sessions(host_id)`.
5. **No bot protection on anonymous sign-in.** CAPTCHA is unset, so the
   `signInAnonymously` endpoint is an open row-creation primitive, throttled
   only by the default 30/hour/IP limit.
6. **Anonymous users are never cleaned up.** Every browser that ever hits
   `/join` leaves a permanent `auth.users` row.
7. **Guest cleanup would destroy class history.** `players.auth_uid` is
   `not null references auth.users (id) on delete cascade`, so deleting a stale
   guest cascades away their `players` row and every `allocations` row under it.
   This has to be fixed *before* any cleanup job exists. See §2.4.

---

## Part 1 — The identity model

Three classes of identity, not two:

```
                        can host?   survives browser?   costs an MAU?
  Guest player          no          no                  yes (while active)
  Claimed student       no*         yes                 yes
  Host account          yes         yes                 yes
```

\* see decision **D2** — whether a claimed student may also host is a policy
choice, not a security constraint.

### 1.1 The linchpin: anonymous → permanent keeps the same user id

This is what makes optional student accounts cheap. In Supabase, converting an
anonymous user to a permanent one is *linking an identity to the existing user* —
via `updateUser({ email })`, `updateUser({ password })`, or
`linkIdentity({ provider: 'google' })`. **The `auth.users.id` does not change.**

Concretely: a student joins anonymously, plays four sessions, then claims an
account at the end of the fourth. Their `players.auth_uid` rows already point at
that uuid, so all four sessions' history is theirs retroactively. There is no
row migration, no merge step, and no window where two identities exist for one
person. Every RLS policy keyed on `auth_uid = auth.uid()` keeps working
unchanged.

The only rule to enforce: **`is_anonymous` is the authoritative flag, and it is
read from `auth.users` server-side — never from a client-supplied claim.**

### 1.2 Where authorization data lives — and the footgun to avoid

> **Never put a role, plan, or entitlement in `user_metadata`.**
> `user_metadata` (`raw_user_meta_data`) is writable by the user themself via
> `supabase.auth.updateUser({ data: … })`. A student could set
> `{ role: 'admin' }` in one API call. Anything the server must trust belongs in
> a table the user cannot write (`public.profiles`, with column-scoped grants),
> or in `app_metadata`, which the client cannot touch.

This is the single most common way a Supabase account layer gets broken, and it
is worth a comment in the migration so it doesn't get re-introduced later.

The plan puts trusted fields in `public.profiles` because that matches the
pattern the codebase already uses — `SECURITY DEFINER` predicate helpers reading
a table, as in `0002_rls.sql`. No custom access-token hook is needed.

---

## Part 2 — Schema

Five new migrations. Each is idempotent in the existing style
(`create ... if not exists`, `create or replace`, `drop policy if exists`).

### 2.1 `0016_profiles.sql` — the account record **(I can do this)**

```sql
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  institution  text null,
  -- 'user' | 'admin'. NOT a host/student switch — see D2. Never client-writable.
  role         text not null default 'user' check (role in ('user','admin')),
  -- hook point for paid tiers later; quotas read this today.
  plan         text not null default 'free' check (plan in ('free','pilot','dept')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- You may read and update only your own profile.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column grants are the real defence: role/plan are unreachable from a client,
-- exactly as current_wealth is unreachable on players.
grant update (display_name, institution) on public.profiles to authenticated;
```

A profile row is created **only for permanent users** — a guest is not an
account:

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;             -- guests get no profile; claiming creates one
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Note `raw_user_meta_data->>'full_name'` is used **only** as a display-name
seed — a cosmetic field. That is the one safe use of user metadata.

### 2.2 `0017_claim_account.sql` — the student claim **(I can do this)**

Called by the client *after* it has successfully linked an email, password, or
Google identity. It exists so the profile row is created under server rules and
the `is_anonymous` check cannot be spoofed.

```sql
create or replace function public.claim_my_account(p_display_name text default null)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_anon boolean;
  v_row  public.profiles;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;

  -- Authoritative read; never trust a client-supplied flag.
  select coalesce(u.is_anonymous, false) into v_anon
    from auth.users u where u.id = v_uid;
  if v_anon then
    raise exception 'link an email or Google identity before claiming';
  end if;

  insert into public.profiles (id, display_name)
  values (v_uid, coalesce(nullif(trim(p_display_name), ''), ''))
  on conflict (id) do update
    set display_name = coalesce(nullif(trim(excluded.display_name), ''),
                                public.profiles.display_name)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.claim_my_account(text) from public;
grant execute on function public.claim_my_account(text) to authenticated;
```

Plus a read-side RPC for the payoff — the thing that makes claiming worth it:

```sql
-- get_my_history() -> one row per session this account has played:
--   session_id, played_at, rounds, final_wealth, rank, players_in_session
-- SECURITY DEFINER so it can aggregate across sessions the caller is no longer
-- a member of, while filtering strictly on auth_uid = auth.uid().
```

### 2.3 `0018_quotas.sql` — abuse limits with a billing hook **(I can do this)**

```sql
create index if not exists sessions_host_idx
  on public.sessions (host_id, created_at desc);

create or replace function public.session_quota(p_uid uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case coalesce((select p.plan from public.profiles p where p.id = p_uid), 'free')
    when 'dept'  then 500
    when 'pilot' then 100
    else 12                               -- free: 12 sessions / 30 days
  end;
$$;
```

The shipped migration enforces this with a `BEFORE INSERT` trigger on
`sessions` rather than by editing `create_session`. That function's body is ~220
lines as of `0014`, and `create or replace`-ing it for every policy tweak is
exactly how two definitions drift apart; a trigger also covers any future insert
path for free. The equivalent inline check would have been:

```sql
  if (select count(*) from public.sessions s
        where s.host_id = v_uid
          and s.created_at > now() - interval '30 days')
     >= public.session_quota(v_uid) then
    raise exception 'session limit reached for this account';
  end if;
```

Also worth adding here, from DEPLOYMENT.md §6's optional-hardening list: a
**player cap** inside `join_session` (e.g. 400 per session) so one join code
cannot be used to mass-create `players` rows.

When billing arrives, it sets `profiles.plan` from a Stripe webhook and nothing
else changes. That is the whole point of routing quotas through one function.

### 2.4 `0019_guest_retention.sql` — cleanup that doesn't eat history **(I can do this)**

**This migration must land before any cleanup job runs.** `players.auth_uid`
still carries `on delete cascade` from `0001`, so purging a stale guest would
cascade away their `players` row and every `allocations` row under it — silently
destroying a past class's results.

Two corrections to the first draft of this plan, found while implementing it:

1. `auth_uid` is **already nullable** — migration `0009` dropped `NOT NULL` so
   benchmark bots could exist. Only the FK action needs changing.
2. `0009` also added `players_auth_or_bot_chk: check (auth_uid is not null or
   is_bot)`, which would **reject** a severed human row. The invariant has to be
   widened, not just the FK relaxed.

So the shipped migration does three things: relax the FK, stamp a new
`purged_at` column from a `BEFORE UPDATE` trigger (which fires for the update
that `ON DELETE SET NULL` performs, and runs before `CHECK` evaluation), and
widen the constraint to `auth_uid is not null or is_bot or purged_at is not
null`.

```sql
alter table public.players add column if not exists purged_at timestamptz;

alter table public.players drop constraint if exists players_auth_uid_fkey;
alter table public.players add constraint players_auth_uid_fkey
  foreign key (auth_uid) references auth.users (id) on delete set null;
```

Why this is the right shape:

- **History survives.** The `players` row keeps its display name and wealth
  curve; only the link to a person is cut.
- **It is also the GDPR erasure primitive.** "Delete my account" becomes
  pseudonymisation of past results rather than destruction of a class's data.
- **RLS stays correct by construction.** `auth_uid = auth.uid()` is `false` for
  a `NULL` row, so a severed record is readable by the host only — never by
  another student. Postgres treats `NULL`s as distinct in
  `unique (session_id, auth_uid)`, so the constraint still holds for real uids.

Check `join_session` and `is_my_player` still read correctly against a nullable
column (both compare equality, so they do), and **verify the cascade change in
the SQL self-test** rather than by reasoning about it.

Then the job itself:

```sql
create or replace function public.purge_stale_guests(p_days int default 45)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  with doomed as (
    delete from auth.users u
     where coalesce(u.is_anonymous, false)
       and u.created_at < now() - (p_days || ' days')::interval
       and not exists (            -- never touch a guest in a live session
         select 1 from public.players p
           join public.sessions s on s.id = p.session_id
          where p.auth_uid = u.id and s.status <> 'finished')
    returning 1)
  select count(*) into v_n from doomed;
  return v_n;
end;
$$;

revoke all on function public.purge_stale_guests(int) from public, anon, authenticated;
```

Scheduled with `pg_cron` (weekly), or run by hand from the SQL editor at first —
Supabase has no built-in cleanup for anonymous users. Nothing but the table
owner may execute it.

### 2.5 `0020_account_lifecycle.sql` — export & delete **(I can do this)**

```sql
-- export_my_data() -> jsonb: profile + every player row + allocations, own rows only.
-- delete_my_account(): deletes the profile, NULLs auth_uid on player rows (the FK
--   above does this), reassigns or deletes owned sessions, then removes the
--   auth.users row. SECURITY DEFINER, filtered hard on auth.uid().
```

One decision to make here (**D3**): deleting a *host* account with live sessions.
Options are refuse until sessions are finished, or cascade-delete the sessions
(which erases students' results too). Refusing, with a clear message listing the
blocking sessions, is the safer default.

### 2.6 `0021_restore_host_guard.sql` — the launch revert **(I can do this)**

The pre-deploy item already tracked in CLAUDE.md and DEPLOYMENT.md §1. It is the
*last* migration in this plan, not the first: until the three real sign-in
methods work with custom SMTP, removing the bypass would lock you out of your
own testing.

Two coupled changes, both required:

- [ ] `create or replace create_session` re-adding the `is_anonymous` rejection
      (the `0007_show_odds.sql` guard), now above the quota check.
- [ ] Set `NEXT_PUBLIC_ALLOW_ANON_HOST=false` in Vercel, and delete the
      `skipEmailForTesting` path in `components/host/HostSignIn.tsx` plus the
      flag branch in `app/host/page.tsx`.

The flag alone is not enough — migration `0008` relaxed the **server**, so the
server needs its own revert.

---

## Part 3 — Sign-in methods

All three requested, in this order of implementation risk (lowest first).

### 3.1 Magic link — already built, needs an email provider

The code path exists and works. What's missing is deliverability:

- [ ] **Custom SMTP is mandatory before launch.** The built-in sender is capped
      at **2 emails/hour on every plan**, Pro included. Resend, Postmark, SES or
      SendGrid all work. *(dashboard + DNS)*
- [ ] After enabling custom SMTP, Supabase still applies a default **30
      messages/hour** cap — raise it deliberately in Authentication → Rate
      Limits. *(dashboard)*
- [ ] SPF/DKIM/DMARC on the sending domain, or university spam filters will eat
      the links. *(DNS)*

### 3.2 Google OAuth — lowest-friction win **(I can do this)**

- [ ] Google Cloud console: OAuth client, authorized redirect to
      `https://<project>.supabase.co/auth/v1/callback`. *(dashboard)*
- [ ] Supabase: enable Google, paste client id/secret. *(dashboard)*
- [ ] Enable **manual linking** in Authentication settings — `linkIdentity()`
      fails without it, which is what the student claim flow needs. *(dashboard)*
- [ ] Code: a `signInWithOAuth({ provider: 'google' })` button. The existing
      `/auth/callback` route already handles the PKCE code exchange, and
      `siteUrl()` already resolves the right origin on previews and localhost —
      so this is genuinely a small change.

**One security note.** Supabase automatically links a new OAuth identity to an
existing user when the provider returns the *same verified email*. That is
correct behaviour for Google, which always verifies. If a provider that returns
unverified emails is ever added, that same convenience becomes an account
takeover: attacker signs up with the victim's address at the sloppy provider and
inherits the account. Rule of thumb: **only add providers that verify email.**

### 3.3 Email + password — largest surface, so most care **(I can do this)**

Supabase handles hashing (bcrypt), so the work is policy and flows:

- [ ] **Enable leaked-password protection** (HaveIBeenPwned Pwned Passwords).
      Requires **Pro or above** — a real reason the Pro upgrade in §6 is not
      optional. *(dashboard)*
- [ ] Minimum length ≥ 10 and a required-characters policy. *(dashboard)*
- [ ] Email confirmation **on**, so signup cannot squat an address the user
      doesn't control. *(dashboard)*
- [ ] Password reset flow: reuses `/auth/callback`, plus a new
      `/auth/reset` page for `updateUser({ password })`.
- [ ] CAPTCHA on signup/sign-in/reset (§4).
- [ ] Generic responses on the reset form — "if that address has an account,
      we've sent a link" — so it isn't an account-existence oracle.
- [ ] For a guest setting a password as part of claiming: require the email to
      be added and **verified first**, then the password. Never allow a password
      on an unverified address, or a guest could park a password on someone
      else's email.

MFA (TOTP) is supported and is the natural next step for host accounts, but it
is a later phase — see §7, Phase 6.

### 3.4 Signing in with a username — and why it needs a server secret

The requested flow is: register with **username + email + password**, get a
confirmation link that signs you in, and from then on sign in with **either the
email or the username** plus the password.

Supabase Auth has no username login — `signInWithPassword` takes an email. So
something has to map username → email *before* GoTrue sees the request, and that
mapping is the whole security problem. Three ways to do it:

| Option | Verdict |
| --- | --- |
| Open RPC `username → email`, callable by anyone | **Rejected.** That is an email harvester: guess handles, collect addresses, phish or credential-stuff them |
| Verify the password in Postgres with `crypt()`, return the email only on success | **Rejected.** A home-rolled auth path outside GoTrue's rate limiting and lockout — an unthrottled password oracle |
| **Shipped:** the lookup requires a server-only shared secret, so only our own Route Handler can do it | GoTrue still performs every password check and keeps its own limits; we only resolve an identifier |

**Why a scoped secret rather than the `service_role` key.** The obvious
implementation puts `service_role` in a Route Handler. But `service_role`
bypasses RLS entirely, so leaking it means the whole database — `session_secrets`
included. Leaking `app_secrets.username_lookup` means username → email
enumeration and nothing else. Same setup cost, roughly a hundredfold smaller
blast radius, and it preserves the property README.md advertises: the app holds
no key that can bypass RLS.

Two consequences worth knowing:

- **It fails closed.** No secret configured → the function returns `NULL` for
  every call and the sign-in form silently accepts email only. It never fails
  open.
- **The proxied path needs its own throttle** (`0022`). An email login goes
  straight from the browser to Supabase, so GoTrue sees the real client IP. A
  username login cannot, so from Supabase's side every attempt arrives from the
  Vercel egress IP — one shared bucket that is both useless as a brute-force
  limit and a self-inflicted DoS, since 30 guesses by an attacker would lock out
  every legitimate username login. So the proxy counts failures itself, on the
  targeted username *and* on a salted hash of the caller's IP (no IP is stored),
  and locks a bucket for 15 minutes after 8 failures.

---

## Part 4 — Security

Security is the priority, so this section is the plan's centre of gravity. The
threat model extends the one in the `0002_rls.sql` header: *a curious student
with dev tools and the public anon key*, now also *an anonymous person on the
internet who wants free compute, an inbox to spam, or someone else's account*.

| # | Threat | Mitigation | Where |
| --- | --- | --- | --- |
| T1 | **Bot mass-creates anonymous users** — inflates `auth.users`, DB size and the MAU meter | Cloudflare Turnstile or invisible hCaptcha on anonymous sign-in; keep the 30/hr/IP limit; weekly `purge_stale_guests()`; player cap in `join_session` | dashboard + §2.3/2.4 |
| T2 | **Credential stuffing** against password sign-in | Leaked-password protection (Pro); CAPTCHA; per-IP rate limits; min length | dashboard |
| T3 | **Email bombing / enumeration** via magic link or reset | Custom SMTP with its own quota; lowered Supabase rate limits; generic responses on both forms | dashboard + §3.3 |
| T4 | **Privilege escalation to host** | `role`/`plan` live in `profiles` with **no client update grant**; never in `user_metadata`; `create_session` guard restored in `0021` | §1.2, §2.1, §2.6 |
| T5 | **Account takeover via OAuth email collision** | Only verified-email providers; document the rule so a future provider doesn't reopen it | §3.2 |
| T6 | **Session hijacking / XSS token theft** | `@supabase/ssr` cookie handling already in `lib/supabase/middleware.ts`; add a CSP that allowlists Supabase `https:` **and `wss:`** (omitting `wss:` silently kills realtime) | DEPLOYMENT.md §6 |
| T7 | **Cross-account data leaks** in the new tables | `profiles` policies are `id = auth.uid()` only; `get_my_history` and `export_my_data` filter on `auth.uid()` inside a `SECURITY DEFINER` body | §2 |
| T8 | **Student PII exposure** (new: claimed accounts carry email) | Data minimisation — email optional, never required to play; export + delete RPCs; see §5.3 | §2.5, §5.3 |
| T9 | **Quota bypass by making many host accounts** | Quota is per account, so this is the residual risk. Bounded by email verification + CAPTCHA; if it ever matters, gate on verified institutional domains | §2.3 |

### 4.1 Verification — prove it, don't assume it

The repo already has the right two-layer harness, and the account layer belongs
in both:

- **`scripts/db_selftest.sql`** (offline, canonical — `bash scripts/run-db-selftest.sh`)
  add: a student cannot select another user's `profiles` row; a student's
  `update profiles set role = 'admin'` is rejected by the column grant; a guest
  with `is_anonymous` cannot call `create_session` once `0021` lands;
  `claim_my_account` rejects an anonymous caller; `purge_stale_guests()` leaves
  finished-session `players` rows intact with `auth_uid` NULLed; quota rejects
  session N+1.
- **`scripts/security-check.ts`** (live, over the real network path as an
  attacker would) add the same assertions through PostgREST/RPC.

Rule for this work: **every new RPC and every new policy gets a denial test in
the same PR.** The existing script's `expectDenied` helper already makes this a
few lines each.

---

## Part 5 — UI surfaces

Per CLAUDE.md, build from `components/ui.tsx` primitives and semantic tokens
(`bg-surface`, `text-ink`, `border-ink`, `bg-brand`, `bg-play`) — no raw
`slate-*`/`indigo-*`. Read DESIGN.md before touching any of these.

### 5.1 `/host` sign-in — three methods in one card

`components/host/HostSignIn.tsx` grows from one email field to a segmented
control: **Email link · Password · Google**. Google as a bordered button with the
mark; magic link stays the default tab because it is the lowest-friction for a
professor on a lecture-hall machine. The testing bypass keeps rendering behind
`NEXT_PUBLIC_ALLOW_ANON_HOST` until Phase 5.

### 5.2 `/account` — new page

Profile (display name, institution), linked identities with add/remove, "Download
my data" (from `export_my_data`), and a destructive-styled "Delete account"
behind a typed confirmation. Reachable from the host dashboard header, which
currently holds only a "Sign out" button.

### 5.3 The student claim prompt — the part to get right

Offered **at the end of a session**, in `components/student/StudentFinished.tsx`,
never before. One line, dismissible, and it must never gate the results the
student is already looking at:

> *Keep your results? Save them to an account to see your history across
> sessions.* → **Save my results** · *No thanks*

Design constraints, because this is where an account system usually turns
user-hostile:

- **Never block play.** No prompt on `/join`, none mid-round.
- **Dismissal sticks** — remember it locally so it isn't asked every session.
- **Ask for the minimum.** Email or Google, nothing else. No institution, no
  student ID, no real name required.
- **Say what it costs them.** A one-line note that this stores their email, and
  that they can delete it later from `/account`.

---

## Part 6 — Hosting: what actually limits you

Researched September 2026; sources at the end. Prices move, so re-check before
acting on the numbers.

### 6.1 The two conflated worries

"People making many accounts" is really two different problems, and only one of
them is about hosting:

1. **Legitimate growth.** Not your binding constraint, and not close. See the
   arithmetic below — the MAU meter has enormous headroom for classroom use.
2. **Malicious mass signup.** A *security control* problem (T1), not a hosting
   problem. Turnstile plus the guest cleanup job solves it for $0. Without them,
   no amount of plan headroom helps, because the growth is unbounded.

So the answer is: fix T1, then stop worrying about MAU.

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
| Leaked-password protection | ✗ | ✓ | ✓ |
| **Inactivity auto-pause** | **after 7 days** | never | never |
| Active projects | 2 | unlimited | unlimited |

### 6.3 What those ceilings mean for *this* app

Four quantities, worked through with this game's actual shape (N students,
R rounds). Recheck the arithmetic yourself — the point is the order of
magnitude and which term dominates.

**Database size — a non-issue.** An `allocations` row is on the order of 150
bytes with index overhead. A 200-student, 25-round session is
200 × 25 = 5,000 rows ≈ **~1 MB**. Free's 500 MB holds hundreds of sessions;
Pro's 8 GB is years away even at heavy use. The thing that would actually fill
the DB is T1 — junk `auth.users` rows.

**MAU — enormous headroom.** Each distinct browser profile is one anonymous
user, so one 200-student lecture ≈ 200 MAU. Free's 50,000 needs ~250 such
lectures *in a single month*; Pro's 100,000 needs ~500. You will not reach this
with real classes. (Note that guests *do* count while active, and a student who
clears storage counts again — still nowhere near.)

**Realtime concurrency — the first limit that actually bites.** Every open page
holds one socket: each student, the host dashboard, and the present view. A
200-student lecture is ~202 concurrent connections, which **exceeds the Free
tier's 200 cap on your first full class.** Pro's 500 covers two mid-size classes
at once; past that the overage is mild ($10 per extra 1,000 peak).

**Realtime messages — the one with a quadratic term, and it's fixable.** This
one is specific to the current code. `app/play/[sessionId]/page.tsx` calls
`usePlayers`, which subscribes to `postgres_changes` on **every `players` row in
the session** — and `show_full_leaderboard_to_students` defaults to `true`, so
students really do receive all of them. A reveal updates all N rows, so each
reveal costs ≈ N × (N+1) messages, and a session costs ≈ **N² × R**:

| Students | Messages / 25-round session | On Free (2M/mo) | Pro overage @ $2.50/1M |
| --- | --- | --- | --- |
| 50 | ~64,000 | fine | ~$0.16 |
| 200 | ~1.0M | ~2 sessions/month | ~$2.50 |
| 500 | ~6.3M | over on session 1 | ~$16 |
| 1,000 | ~25M | over | ~$63 |

Cheap in dollars on Pro, but it is the term that grows fastest, and the fix is
small: have students subscribe to **one aggregated leaderboard row per session**
(updated once per reveal) instead of N individual player rows. That turns
N² × R into N × R — for 200 students, ~40,200 messages per reveal becomes ~200,
a **200× reduction**. Worth doing before a 300+ person lecture, independent of
accounts. **(I can do this)**

### 6.4 Recommendation

**Stay on Vercel + Supabase. Move to the paid tiers, not to a different vendor.**

1. **Before the first real class: Supabase Pro, $25/mo.** Not optional, for
   three independent reasons — Free's 200-connection realtime cap is under one
   lecture, Free auto-pauses after 7 days of inactivity (a semester has gaps
   longer than that), and leaked-password protection is Pro-only, which §3.3
   needs.
2. **Before you charge anyone: Vercel Pro, $24/mo.** Hobby forbids commercial
   use, so the first invoice you send makes it a licence problem, not a capacity
   one. Until then Hobby is genuinely fine for the app tier.
3. **Total at launch: roughly $50/month**, plus a few dollars of realtime
   overage on the biggest lectures. For a departmental teaching tool that is the
   right trade — you are buying back the ops time that self-hosting would spend.

**Watch-list — the thresholds that would change the answer:**

| Watch | Threshold | Do this |
| --- | --- | --- |
| Concurrent realtime peak | > 500 | Pay the $10/1,000 overage first; it is far cheaper than Team at $599. Only then consider moving sockets off Supabase |
| Realtime messages | > ~5M/mo | Ship the aggregated-leaderboard fix in §6.3 before paying more |
| MAU | > 100k | **Check for abuse first** (T1). Real classes should not get you here |
| DB size | > 8 GB | Almost certainly junk guest rows — run the purge job |
| Vercel bandwidth | > 1 TB/mo | Unlikely; this app ships text and small JSON |
| Charging money | any | Vercel Pro, immediately |

### 6.5 If you ever do outgrow it — the migration path that matters

Know what is portable and what is sticky before you need to move:

| Portable (little work) | Sticky (real work) |
| --- | --- |
| The Next.js app — Vercel, Cloudflare, Railway, Render and Coolify all run it | **Supabase Auth (GoTrue)** — the user table, identities, and every `auth.uid()` in your 15 migrations |
| The Postgres schema and migrations — plain SQL | **Supabase Realtime** — `postgres_changes` is not a standard Postgres feature |
| RLS policies — standard Postgres | PostgREST-shaped client calls (`.from()`, `.rpc()`) |

The strategic consequence: **your escape hatch is self-hosted Supabase, not a
different auth vendor.** Self-hosted Supabase runs the same GoTrue, the same
Postgres, the same RLS and the same Realtime, so the migrations and every
`auth.uid()` keep working — it's a data migration, not a rewrite. Moving to
Clerk/Auth.js + plain Postgres instead would mean rewriting every policy and
every RPC in `0002`–`0021`. Don't plan for that.

Ranked options if the bill or the limits ever force a move:

1. **App tier off Vercel, keep Supabase.** Cloudflare Workers/Pages (unmetered
   bandwidth on free), Railway, or Render. Small change, keeps the database and
   auth exactly as they are. This is the cheap 80%.
2. **Self-hosted Supabase on Hetzner via Coolify.** Infra lands around
   $10–40/mo versus $25+ managed, so the dollar saving is small at your scale
   and only becomes interesting well past 100k MAU.
3. **Full self-host of everything.** Reported at ~2–5 hours of maintenance per
   month, and you take ownership of GoTrue security patches, email
   deliverability, backups and PITR.

**My recommendation against option 3 while you're a solo maintainer holding
student results:** the saving is tens of dollars a month; the cost is that every
auth CVE becomes your pager. Supabase Pro at $25 buys managed auth patching,
PITR backups, a signable DPA and EU data regions. Revisit only if MAU passes
~100k *from real users* or a university demands on-premise hosting.

### 6.6 Compliance, briefly (not legal advice)

Adding optional student accounts introduces student email — PII, where today the
app stores only a display name and numbers. Worth doing early because it is
cheap now and expensive later:

- [ ] **Sign Supabase's DPA** and, if you have EU students, put the project in
      an **EU region**. Both are supported. *(dashboard/legal)*
- [ ] **Publish a privacy policy** naming what's stored (display name, results,
      optionally email), the retention window, and how to get data out or
      deleted. The `export_my_data`/`delete_my_account` RPCs are the
      implementation of that promise.
- [ ] **Keep data minimisation as a hard rule** — never require an email to
      play. It is your strongest compliance position and it is already the
      product's design.
- [ ] Under FERPA the university is typically the controller and you are the
      processor acting as a "school official"; under GDPR, controller/processor
      respectively. Either way the university will eventually ask for a DPA —
      having one ready is a sales advantage, not just a legal chore.

---

## Part 7 — Phased rollout

Each phase is independently shippable and leaves the app working.

**Phase 0 — Prerequisites (dashboard only, blocks everything else)**
- [ ] Custom SMTP configured + SPF/DKIM/DMARC; raise the post-SMTP rate limit
- [ ] Turnstile or invisible hCaptcha enabled, **including on anonymous sign-in**
- [ ] Google OAuth client created; **manual linking enabled**
- [ ] Supabase **Pro** (unlocks leaked-password protection and PITR; removes auto-pause)
- [ ] Password policy: min length ≥ 10, leaked-password protection on, email confirmation on

**Phase 1 — Account foundation (I can do this)**
- [ ] `0016_profiles.sql` + trigger; `/account` page reading and updating it
- [ ] Self-test + `security-check.ts` cases: cross-account read denied, role escalation denied

**Phase 2 — Three sign-in methods (I can do this)**
- [ ] Google OAuth button; password sign-up/sign-in; `/auth/reset` page
- [ ] `HostSignIn.tsx` segmented control per DESIGN.md
- [ ] Reset form gives generic, non-enumerating responses

**Phase 3 — Optional student accounts (I can do this)**
- [ ] `0017_claim_account.sql` (`claim_my_account`, `get_my_history`)
- [ ] Claim prompt in `StudentFinished.tsx`; sticky dismissal
- [ ] History view on `/account`
- [ ] Verify a claimed account still sees its pre-claim sessions (the §1.1 property)

**Phase 4 — Abuse limits & retention (I can do this)**
- [ ] `0018_quotas.sql` — quota + `sessions(host_id)` index + player cap
- [ ] `0019_guest_retention.sql` — **FK change first**, then `purge_stale_guests()`
- [ ] `0020_account_lifecycle.sql` — export + delete
- [ ] Schedule the purge weekly (`pg_cron`)

**Phase 5 — Close the testing bypass (I can do this)**
- [ ] `0021_restore_host_guard.sql`
- [ ] `NEXT_PUBLIC_ALLOW_ANON_HOST=false` in Vercel; remove the button and flag branch
- [ ] Update CLAUDE.md's "Notable" section and DEPLOYMENT.md §1 — the bypass is gone, so the note must stop saying it's live

**Phase 6 — Later, not now**
- [ ] TOTP MFA for host accounts
- [ ] Institutional SSO (SAML) — needs Supabase Pro/Team + per-university setup
- [ ] Billing: Stripe → `profiles.plan`; unpark `components/marketing/Pricing.tsx`
- [ ] The aggregated-leaderboard realtime fix (§6.3) — independent of accounts, do it before a 300+ lecture

---

## Part 8 — Decisions I need from you

| # | Decision | Recommendation |
| --- | --- | --- |
| **D1** | Default sign-in tab on `/host` | Magic link — lowest friction on a shared lecture-hall machine |
| **D2** | May a claimed *student* account host its own sessions? | **Yes.** Hosting stays gated on "not anonymous" + quota rather than a role bit, which removes a whole class of privilege-escalation bug. If you'd rather restrict it, that's a `profiles.can_host` boolean and an extra guard — say so and I'll add it |
| **D3** | Host deletes an account with live sessions | Refuse, listing the blocking sessions. Cascading would erase students' results |
| **D4** | Free-tier session quota | 12 per 30 days. High enough that no real professor notices, low enough to blunt scripted abuse |
| **D5** | Guest retention window | 45 days. Long enough to cover a marking period, short enough to keep `auth.users` lean |
| **D6** | Is the student claim flow wanted at launch, or after? | Ship Phases 1–2 and 4–5 first (host accounts + hardening), then Phase 3. It's the only phase with new PII, and it benefits from the rest being solid |

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
