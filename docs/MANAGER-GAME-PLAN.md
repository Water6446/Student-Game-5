# Implementation Plan — Module 3: "The Manager Game" (Active vs. Passive)

**Audience:** Claude Code, working in `Student-Game-5`.
**Written:** 2026-08-21. **Base:** branch `feature/aug-2026-improvements` at `9131a13`.
**Prereq:** read `CLAUDE.md`, `DESIGN.md`, `MECHANICS.md` and the existing
`docs/IMPLEMENTATION-PLAN.md` first. They are binding.

---

## 1. What we're building, and why it's different

A third game type on the existing engine — same lobby, rounds, lock/reveal loop,
leaderboard, present mode and CSV. Each round is **one year**; 25 years by
default. Students allocate wealth across a **risk-free asset** and **5 portfolio
managers**, and may **lever up to 2×**. They are scored against a **passive
index they cannot buy**.

The lesson has three layers:

1. Skill is real but tiny and nearly invisible year to year (+2% alpha against
   5% tracking error is a ~0.4 information ratio — statistically undetectable
   over a career).
2. Fees compound against you regardless.
3. On the market-neutral preset: the *best* strategy in the game still loses to
   its own fee structure. Identifying skill correctly is not sufficient.

### The four things that break the existing engine

Read these before writing any code. Every one of them is load-bearing.

| # | Existing assumption | Manager game |
|---|---|---|
| 1 | Outcomes are `'good' \| 'bad'` (a `check` constraint on two columns) | Returns are **continuous** normals. Nothing in the good/bad path applies. |
| 2 | `0 ≤ risky ≤ wealth`, enforced in RLS, both submit RPCs, and the client | **Leverage** means allocations may reach 2× wealth and `safe_amount` goes **negative**. |
| 3 | `sessions.config` is world-readable to any session member | **Alpha must be secret.** See § 2 — this is the biggest single piece of work. |
| 4 | "Each new round opens blank — never pre-filled" (a deliberate design decision, commented in `StudentRound.tsx`) | Allocations **persist year to year** until changed. Non-submitters carry forward, they do **not** default to all-safe. |

Because of #1 and #4, do **not** try to generalise `resolve_round`'s existing
branches. Add a third top-level branch (`v_game_type = 'manager'`) that shares
only the outer scaffolding — host check, locked check, the per-player loop
shape, and the final `update public.rounds ... status = 'revealed'`.

---

## 2. The secrecy problem (decided: private table, server-only)

**The hole.** `supabase/migrations/0002_rls.sql:87–89` and `:171`:

```sql
create policy sessions_select on public.sessions
  for select using (public.is_session_member(id));
grant select on public.sessions to authenticated;
```

Any student who has joined can run `supabase.from('sessions').select('*')` in
the console and read the entire `config` jsonb. That is correct and harmless for
the existing games — `good_prob` is meant to be visible. For this game it is
fatal: alpha, tracking error and the shuffle would all be one query away, and
`README.md` states the threat model explicitly as *"a curious CS student with
browser dev tools and the public anon key."*

**The fix.** A new table with RLS on and **no policies and no grants at all**, so
only `SECURITY DEFINER` functions can reach it:

```sql
create table if not exists public.session_secrets (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  secret     jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.session_secrets enable row level security;
-- Deliberately NO policies: RLS-on + zero policies = deny all, for every role,
-- including the host. The only readers are SECURITY DEFINER functions below.
revoke all on public.session_secrets from anon, authenticated;
```

**What goes where:**

| Public — `sessions.config.managers[i]` | Private — `session_secrets.secret.managers[i]` |
|---|---|
| `name`, `strategy_line` (the one-liner) | `beta` |
| `fee_type`, `mgmt_fee`, `perf_fee` | `alpha` |
| `track_record` (1y / 5y / 10y + the 10 yearly returns) | `tracking_error` |
| `vol_label` (`"Low" \| "Moderate" \| "High" \| "Very high"`) | — |

Fees are public on purpose: real prospectuses disclose them, and the fee counter
needs them client-side.

**Two acceptable, intentional leaks — do not "fix" these:**

- `sessions.config.managers[i].track_record.yearly` (10 numbers) lets a student
  estimate tracking error. It does **not** meaningfully reveal alpha: the
  standard error of a 10-year alpha estimate at TE = 5% is 5%/√10 ≈ **1.6%**,
  which cannot separate +2% from −2%. That is the lesson, rendered as data.
- `rounds.manager_returns` accumulates in the open as the game runs. After all
  25 years, a student who runs a regression against `rounds.market_return` gets
  an alpha standard error of 5%/√25 = **1%** — barely two sigma, after doing
  real econometrics on 25 observations. Also the lesson. Leave it.

**New RPC:**

```sql
-- Returns the true parameters. The host may call it at any time (they authored
-- the session and are not a competitor); students only once the game is over.
create or replace function public.get_manager_truth(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
```

Guard: `is_session_host(p_session_id)` OR
(`is_session_member(p_session_id)` AND `sessions.status = 'finished'`).
Raise otherwise. Grant execute to `authenticated` only.

**Add to `scripts/db_selftest.sql`** — this is a security assertion and belongs
with the others:

- a student **cannot** `select` from `session_secrets` (expect permission denied);
- a student **cannot** call `get_manager_truth` while the session is `active`;
- a student **can** call it once `status = 'finished'`;
- the host **can** call it at any status.

---

## 3. The maths (authoritative spec — mirror this in SQL *and* `lib/game/manager.ts`)

`MECHANICS.md` gets a new section carrying all of this. Write the section as
part of Stage 1, not at the end.

### 3.1 Per year

```
Market (the index):
  r_market ~ Normal(market_mean, market_sd)          defaults: 0.08, 0.16

Manager i, GROSS return:
  eps_i    ~ Normal(0, tracking_error_i)             independent across i and years
  r_i      = beta_i * r_market + alpha_i + eps_i

Total volatility (informational; used for the vol label):
  vol_i   ≈ sqrt((beta_i * market_sd)^2 + tracking_error_i^2)
```

Two independent volatility sources — **beta** (market exposure) and **tracking
error** (idiosyncratic noise). Keep them separate everywhere; never collapse to
one "vol" number in code.

### 3.2 Fees — exact order of operations

For each manager `i` with allocated dollars `a_i` at the start of the year:

```
gross_i = a_i * r_i                                   (signed; can be negative)
mgmt_i  = a_i * mgmt_fee_i                            always charged, even in down years
perf_i  = perf_fee_i * max(0, gross_i)                only in up years; 0 when perf_fee_i = 0
end_i   = a_i + gross_i - mgmt_i - perf_i
```

**Decision to record in `MECHANICS.md`:** the performance fee is charged on the
**gross** return, per the spec's *"20% of the fund's positive return that year"*.
Industry practice more often charges it on the return net of the management fee.
Implement gross; leave a one-line comment naming the alternative so it is a
one-token change if the professor asks.

**No high-water mark in v1.** A fund that loses 20% then gains 20% pays a
performance fee on the recovery. Say so on the reveal screen — it is a feature
of the lesson, not an omission. (Backlog item.)

### 3.3 Leverage, cash and the wealth update

```
W = wealth at the start of the year
A = Σ a_i                                             total allocated to managers
C = max(0, W - A)                                     uninvested cash
B = max(0, A - W)                                     borrowed

borrow_rate = risk_free_rate + borrow_spread          defaults: 0.03 + 0.05 = 0.08

W' = Σ end_i  +  C * (1 + risk_free_rate)  -  B * (1 + borrow_rate)
W' = max(0, W')                                       floor at zero — busted
```

Sanity checks to put in `manager.test.ts`:

- `A = 0` → `W' = W * (1 + rf)`.
- `A = W`, one manager, `fee = 0`, `r = 0.10` → `W' = W * 1.10`.
- `A = 2W` (fully levered), `r = 0.08`, `borrow_rate = 0.08`, `fee = 0` →
  `W' = 2W(1.08) − W(1.08) = W * 1.08`. **Leverage adds nothing at the default
  borrow rate** — that is the intended calibration, assert it.
- A −40% year at 2× leverage floors at exactly `0`, and the player is busted.

`borrow_rate` defaulting to exactly `market_mean` is deliberate: borrowing to buy
beta has zero expected edge. Only real alpha survives the carry.

### 3.4 The default 5 managers

Ships as `MANAGER_PRESETS.default` in `lib/game/manager.ts`.

| Slot | Name | β | α | TE | Fee | ≈ Vol | Label | Role |
|---|---|---|---|---|---|---|---|---|
| 0 | Meridian Alpha | 1.0 | +2% | 5% | 1% flat | 17% | Moderate | genuinely skilled; the only long-only fund worth hiring |
| 1 | Apex Capital | 1.0 | −2% | 5% | 1% flat | 17% | Moderate | negative skill; **indistinguishable from Meridian year to year** |
| 2 | Momentum Partners | 1.0 | 0% | 8% | 1% flat | 18% | Moderate | no skill, high noise — the "past performance" trap |
| 3 | Steady Harbor | 1.0 | 0% | 3% | 1% flat | 16% | Moderate | closet indexer, charges 1% for nothing |
| 4 | Titan Leveraged Growth | 1.5 | 0% | 10% | 1% flat | 26% | High | amplified market, no edge — genius in bull runs, blows up in crashes |

Slots 0 and 1 **must** stay parameter-identical apart from the sign of alpha.
That is what makes them unidentifiable, which is the entire point.

### 3.5 The market-neutral fund (its own preset)

```
Name:            Parity Absolute Return
Beta:            0.1          ← near-zero market correlation. Flat or up in a crash.
Alpha:           +3%
Tracking error:  6%
Fee:             2% management + 20% of positive gross return
≈ Vol:           sqrt((0.1*16)^2 + 6^2) ≈ 6.2%   → label "Low"
```

Gross, this is comfortably the best risk-adjusted product in the game. Net of
2-and-20, the manager captures most of the value. A player who correctly
identifies the best strategy **still underperforms** — because the fee
structure, not the strategy, is where the money goes.

The β = 0.1 is doing visual work: on the wealth chart this fund's line must look
plainly **uncorrelated** with the index ghost line, and must hold up or rise in
the years the index falls. That contrast is what makes it seductive on the way
in and makes the fee drag persuasive at the reveal. Verify it visually with a
seeded run before calling Stage 5 done.

### 3.6 The shuffle (default ON)

Permute **the alpha vector only** across manager slots. Names, one-liners,
betas, tracking errors and fees stay pinned to their slot, so the personalities
survive; only *who is actually skilled* moves. With the default alphas
`[+2%, −2%, 0, 0, 0]`, a permutation can put genuine skill behind any of the
five names — including "Steady Harbor", which is a delightful outcome.

Store the permutation in `session_secrets`. Never send it to any client before
`status = 'finished'`.

The **track records must be generated after the shuffle**, from each slot's
post-shuffle true parameters, or the histories will contradict the reveal.

### 3.7 Track records (the prospectus numbers)

**The single most common way to get this wrong is drawing the three numbers
independently. Do not.** Generate exactly one 10-year path per manager, then
read all three figures off that one path.

```
Draw an INDEPENDENT 10-year market path (this is the manager's history, before
the game starts — it must not reuse the live game's market draws).

For y in 0..9:
  net_y = beta*r_market_y + alpha + Normal(0, TE)     gross
  net_y = net_y - mgmt_fee - (perf_fee * max(0, net_y))   net of fees, as a real
                                                          prospectus reports

track_record = {
  yearly:  [net_0 .. net_9],
  one_yr:   net_9,
  five_yr:  (Π_{y=5..9} (1+net_y))^(1/5)  - 1,
  ten_yr:   (Π_{y=0..9} (1+net_y))^(1/10) - 1,
  vol_label: label(stdev(yearly)),
}

label(sd):  sd < 0.10 → "Low"; < 0.20 → "Moderate"; < 0.30 → "High"; else "Very high"
```

The label is computed from the **realised displayed path**, not from the true
parameters — so it can't be inverted back to beta.

Regenerate every session. The "obvious pick" must change run to run.

**Never display:** information ratio, Sharpe, beta, alpha, tracking error, or
any derived skill measure. Every card carries, verbatim:

> Past performance reflects both skill and luck and cannot reliably predict the future.

---

## 4. Schema changes — `supabase/migrations/0014_manager_game.sql`

One migration, following the header-comment style of `0010_portfolio.sql`.

```sql
-- rounds: the year's draws, written ONLY at reveal time (same rule as market_outcome)
alter table public.rounds add column if not exists market_return  numeric;
alter table public.rounds add column if not exists manager_returns jsonb;   -- [r0..rn-1] GROSS

-- allocations: fees are the one thing not derivable from the other columns
alter table public.allocations add column if not exists fees_paid     numeric;
alter table public.allocations add column if not exists fee_breakdown jsonb; -- [{mgmt, perf}, ...]

-- the index is a visible competitor; see § 6.3
alter table public.players drop constraint if exists players_strategy_chk;
alter table public.players add constraint players_strategy_chk
  check (strategy is null or strategy in
    ('all_safe','edge','fifty_fifty','all_risky',
     'concentrated','diversified','half_diversified',
     'index'));
```

**Reuse, do not add:**

- `allocations.risky_breakdown` → per-manager **dollar** amounts (already jsonb).
- `allocations.risky_amount` → the **sum** `A`.
- `allocations.safe_amount` → `W − A`, **negative when levered**.

That last one is deliberate and worth the comment in the migration: keeping the
invariant `risky_amount + safe_amount = W` means `AllocationsBreakdown`,
`playerDeltaChipsMap`, `SessionHistoryTable`, `WealthChart` and
`bustRoundByPlayer` all keep working with no changes. Borrowed is
`max(0, -safe_amount)` — derived, not stored.

**One thing this breaks:** `AllocationsBreakdown.tsx` computes
`pct = risky / wealth` and renders `style={{ width: `${pct}%` }}`. At 2× that is
`200%` and the risk meter overflows its container. Fixed in Stage 1c.

`market_scope` for manager games is **always `'shared'`** — one index path and
one set of manager returns for the whole class each year. Force it in
`create_session` the way `market_mode = 'manual'` already forces shared
(`0012_correlation.sql:63–65`). Independent scope would make the ghost line
meaningless and the leaderboard unfair; there is no v1 use case.

`market_mode = 'manual'` is **rejected** for manager games in v1. See Backlog.

### Normal draws in plpgsql

`random()` is uniform; there is no normal in core Postgres and `tablefunc` is not
guaranteed enabled. Write a Box–Muller helper in the migration:

```sql
create or replace function public._rand_normal(p_mean numeric, p_sd numeric)
returns numeric language plpgsql volatile set search_path = public, pg_temp as $$
declare u1 double precision; u2 double precision;
begin
  -- guard u1 > 0: ln(0) is -infinity
  u1 := greatest(random(), 1e-12);
  u2 := random();
  return p_mean + p_sd * (sqrt(-2 * ln(u1)) * cos(2 * pi() * u2));
end; $$;
```

`revoke all ... from public;` — it is an internal helper, grant execute to
nobody. `resolve_round` is SECURITY DEFINER and calls it as the owner.

---

## 5. Config surface

`lib/game/types.ts`:

```ts
export type GameType = "basic" | "portfolio" | "manager";
export type FeeType  = "flat" | "performance";

/** PUBLIC per-manager data. Everything a student is allowed to see.
 *  The true parameters live in session_secrets — see § 2. */
export interface ManagerPublic {
  name: string;
  strategy_line: string;
  fee_type: FeeType;
  mgmt_fee: number;              // 0.01 = 1%/yr on allocated assets
  perf_fee: number;              // 0.20 = 20% of positive gross return; 0 for flat
  track_record: {
    yearly: number[];            // exactly 10, net of fees
    one_yr: number;
    five_yr: number;
    ten_yr: number;
  };
  vol_label: "Low" | "Moderate" | "High" | "Very high";
}

// added to SessionConfig, all manager-game only:
  managers?: ManagerPublic[];    // length = num_managers; written by create_session
  num_managers?: number;         // 1..8, default 5
  market_mean?: number;          // default 0.08
  market_sd?: number;            // default 0.16
  borrow_spread?: number;        // default 0.05  → borrow_rate = rf + spread = 0.08
  leverage_cap?: number;         // default 2.0 (Reg-T); 1.0 disables leverage
  shuffle_skill?: boolean;       // default true
  manager_preset?: "default" | "hedge_fund" | "market_neutral";

export function isManager(config: SessionConfig): boolean {
  return config.game_type === "manager";
}
```

`risk_free_rate` is **reused** from the portfolio game (default `0.03` for
manager games rather than `0`).

Server-side validation in `create_session`, all of it:

| Key | Range |
|---|---|
| `num_managers` | 1..8 |
| `market_mean` | −0.5 .. 0.5 |
| `market_sd` | 0 .. 1 |
| `risk_free_rate` | 0 .. 0.5 (existing) |
| `borrow_spread` | 0 .. 0.5 |
| `leverage_cap` | 1.0 .. 3.0 |
| per manager `beta` | −2 .. 3 |
| per manager `alpha` | −0.5 .. 0.5 |
| per manager `tracking_error` | 0 .. 1 |
| per manager `mgmt_fee` | 0 .. 0.1 |
| per manager `perf_fee` | 0 .. 0.5 |

`create_session` is where the manager parameters arrive, where the shuffle
happens, where `session_secrets` is written, and where the track records are
generated — one transaction, because they must be mutually consistent.

---

## 6. Build order

Follow the user's five stages. Each is one commit; each ends playable or
verifiable. **Do not start a stage before the previous one runs end to end.**

---

### Stage 1 — Core engine

Everything needed to actually play a game: risk-free + 5 managers, continuous
returns, flat fees, leverage, wealth engine, leaderboard.

#### 1a. `supabase/migrations/0014_manager_game.sql`

- Schema from § 4, `_rand_normal`, `session_secrets` and its lockdown.
- `create_session`: `'manager'` joins the `game_type` check; the manager
  validation block; force `market_scope = 'shared'`; reject
  `market_mode = 'manual'`; generate the shuffle; generate track records; write
  `session_secrets`; strip the true parameters out of `config` before insert.

  Be careful with the strip: build the private jsonb **first**, then build the
  public `managers` array by projecting only the public keys. Do not build the
  public array by deleting keys from the private one — a missed key is a silent
  leak, and there is no test that will catch it. Add a `db_selftest.sql`
  assertion that `sessions.config::text` contains neither `'alpha'` nor
  `'tracking_error'` for a manager session.

- `submit_manager_allocation(p_round_id uuid, p_amounts numeric[])`:
  modelled on `submit_portfolio_allocation` (`0010_portfolio.sql:138`), with
  three changes — the cap is `leverage_cap * current_wealth` instead of
  `current_wealth`; `safe_amount` may be negative; the `game_type` check is
  `'manager'`.

- `resolve_round`: a third branch. Per year, once:
  1. `v_market := _rand_normal(market_mean, market_sd)`
  2. for each manager `i`:
     `v_ret[i] := beta_i * v_market + alpha_i + _rand_normal(0, TE_i)`
     — reading `beta/alpha/TE` from `session_secrets`, never from `config`.
  3. per player: apply § 3.2 and § 3.3; write `risky_breakdown`,
     `risky_amount`, `safe_amount`, `fees_paid`, `fee_breakdown`,
     `resulting_wealth`; update `players.current_wealth`.
  4. **Non-submitters carry forward** the previous round's `risky_breakdown`,
     rescaled proportionally to their current wealth so the *shares* persist
     rather than the dollar amounts. A player with no prior allocation at all
     defaults to 100% risk-free. This is the opposite of every other game —
     comment it loudly.
  5. write `rounds.market_return` and `rounds.manager_returns`, then the
     existing `status = 'revealed'` update **last** (the ordering matters — see
     `docs/IMPLEMENTATION-PLAN.md` § Task 3).

- `add_benchmark_bots`: for manager games insert exactly **one** row —
  `'The Index'`, `is_bot = true`, `strategy = 'index'`. See 6.3 below for why
  only one.

#### 1b. `lib/game/manager.ts` + `lib/game/manager.test.ts`

The TS mirror of the SQL, same contract as `lib/game/portfolio.ts`: used for
previews, the fee counter, the reveal and tests — **never** to write wealth.

```ts
export const MANAGER_PRESETS: Record<PresetKey, ManagerTruth[]>;
export function managerGrossReturn(m: ManagerTruth, rMarket: number, eps: number): number;
export function managerFees(m: ManagerPublic, allocated: number, grossDollars: number):
  { mgmt: number; perf: number; total: number };
export function resolveManagerYear(
  cfg: ManagerMathConfig,
  wealth: number,
  amounts: number[],
  managerReturns: number[],
): { endWealth: number; fees: number; feeBreakdown: {mgmt:number;perf:number}[];
     borrowed: number; cash: number };
export function totalVol(beta: number, marketSd: number, te: number): number;
export function borrowRate(cfg: ManagerMathConfig): number;
export function indexSeries(startWealth: number, marketReturns: number[]): number[];
```

Tests must include every sanity check in § 3.3, plus: a down year still charges
the management fee; a down year charges **zero** performance fee; a levered
wipeout floors at exactly 0; `resolveManagerYear` matches a hand-computed
2-and-20 example to the cent.

Add `lib/game/random.ts` with a seeded `gaussian(rng)` (Box–Muller over a small
LCG) so the tests are deterministic. Do **not** use it in the app — the SQL owns
the real draws.

#### 1c. Client wiring

- `lib/game/types.ts` — § 5.
- `lib/game/db.ts` — add the new row fields to `RoundRow` / `AllocationRow`.
- `components/student/ManagerAllocationInput.tsx` — **new**, see § 7.
- `components/student/StudentRound.tsx` — a third branch alongside
  `PortfolioAllocationInput`; call `submit_manager_allocation`; and **pre-fill
  from the previous round** instead of blanking. The current reset effect
  (blank every round, with the comment explaining why) must stay for basic and
  portfolio and be inverted only for manager games.
- `components/host/AllocationsBreakdown.tsx` — the risk meter breaks above 100%.
  For manager games, clamp the bar to 100% and render the overflow as a distinct
  **levered** segment plus a `2.0×` chip; keep the existing behaviour untouched
  for the other two games.
- `components/host/HostRoundControl.tsx` — hide `MarketOddsControl` (good_prob
  is meaningless here) and hide the luck chips and class-luck line (§ 8).
- `components/host/CreateSessionForm.tsx` — a third `GameCard` on the picker.
  Advanced panel comes in Stage 5; Stage 1 ships the default preset only.

**Stage 1 acceptance:** host a 25-year default game with 2 students and the
Index bot; play it to the end; wealth is plausible; no console errors; a
2× levered player can bust; `npm run test` green.

---

### Stage 2 — The two must-have visuals

#### 2a. Index ghost line

`components/host/WealthChart.tsx` takes a new optional prop:

```ts
benchmark?: { label: string; series: number[] };   // series[i] = value after round i
```

Render as a `<Line>` with `stroke={COLOR.ink}`, `strokeDasharray="6 4"`,
`strokeWidth={2}`, `dot={false}`, drawn **last** so it sits on top, and always
included in the tooltip even when `featured` culling is active (the culling
added in the previous plan must never hide the benchmark). Label it
`"The Index (no fees)"`.

Source the series from `rounds.market_return` via `indexSeries()` — the same
number the Index bot compounds, so the line and the bot can never disagree.

Wire it into all three chart call sites: `HostRoundControl`, `HostSummary`,
`HostPresent`.

#### 2b. Fee counter

`components/FeeCounter.tsx` — **new**, shared by student and host.

- Student: sum `fees_paid` across their own revealed allocations. Always visible
  on the round screen next to their wealth. Format: `Fees paid: $12.40`.
- Host: class total, plus per-player in the standings row.
- On the reveal screen it shows the year's fee as a delta: `+$1.90 this year`.

Give it the `bg-loss-soft` / `text-loss` treatment from `DESIGN.md` § 2 — fees
are a loss, and the colour should say so every single year.

**Stage 2 acceptance:** the ghost line renders from year 1 and is visually
distinct at projector distance; the fee counter is non-zero after year 1 and
matches a hand sum from the CSV.

---

### Stage 3 — Prospectus cards

`components/ManagerProspectus.tsx` — **new**. One card per manager, rendered
from `config.managers` (public data only).

Card contents, in order:

1. Manager name (`font-display`), fee line as a chip: `1% / yr` or `2% + 20%`.
2. The one-line strategy description (`font-editorial` italic).
3. Track record — three figures with clear labels: `1 yr`, `5 yr`, `10 yr`, all
   marked **annualized** for the 5/10 and all marked **net of fees**.
4. Volatility label.
5. The disclaimer, verbatim, in `text-ink-subtle text-xs`.

A ten-point sparkline of `track_record.yearly` is worth having and is a natural
`<svg>` inline (no new dependency; follow `DESIGN.md` § 6's inline-SVG style).

**Where it appears:**

- Student: on `StudentWaiting` (the lobby — this is the "read the prospectuses
  before the game starts" moment) and behind a disclosure on the round screen.
- Host: on `HostLobby`, and on `HostPresent` lobby so the class can read them off
  the projector.
- Use `CondensedList` if `num_managers > 5`.

**Guardrail:** add a test asserting that `ManagerProspectus` never receives or
renders `alpha`, `beta` or `tracking_error` — a shallow assertion that the
`ManagerPublic` type has no such keys and that `config.managers` from a real
`create_session` round-trip does not contain them.

**Stage 3 acceptance:** two sessions created back to back have visibly different
track records; the 5-year figure is always consistent with the last 5 entries of
`yearly` (assert this in a test — it is the one number most likely to be wrong).

---

### Stage 4 — Skill reveal

`components/host/ManagerReveal.tsx` — **new**, on `HostSummary` and mirrored on
`StudentFinished` and `HostPresent`'s finished state.

Calls `get_manager_truth(session_id)`. For each manager, one row:

| Name | True alpha | Tracking error | Beta | What it actually was |
|---|---|---|---|---|
| Meridian Alpha | **+2.0%** | 5% | 1.0 | Genuinely skilled |
| Apex Capital | **−2.0%** | 5% | 1.0 | Negative skill |

Sort by true alpha descending. Colour alpha with `gain`/`loss`. Add the realised
figure alongside the true one — *"advertised nothing, delivered +4.1% over 25
years, true alpha +2.0%"* — because the gap between true and realised is the
whole statistical lesson.

**Player-side reveal**, on `StudentFinished`:

```
Final wealth                       $214.30
If you had just held the index     $268.90
                                   ─────────
You paid in fees                    $31.70
You trailed the index by            $54.60
```

That block is the punchline of the module. Give it the full `Card` +
`shadow-lift` treatment, above the counterfactual strategy list.

**Stage 4 acceptance:** truth is unreachable before `status = 'finished'` (verify
in the browser console as a student, not just in tests); the shuffle actually
moves skill between names across sessions; the reveal's numbers reconcile with
the CSV.

---

### Stage 5 — Advanced panel and presets

`components/host/CreateSessionForm.tsx`, manager branch.

**Presets, one click then editable:**

| Preset | What it is |
|---|---|
| `default` | The 5-manager table in § 3.4. **This is the shipping default — a professor who wants it should never touch a dial.** |
| `hedge_fund` | Same 5 managers, fees swapped to 2% + 20% |
| `market_neutral` | Parity Absolute Return (§ 3.5), as the sole manager or alongside the long-only five |

**Global controls:** market mean, market sd, risk-free rate, borrow spread,
leverage cap, number of managers, number of years.

**Per manager:** beta, alpha, tracking error, mgmt fee, perf fee, fee type,
name, strategy line.

Guardrails matter more than flexibility here. Every numeric input gets `min`,
`max`, `step` and a `hint` naming the default. Show the derived
`≈ vol` and `information ratio = alpha / TE` **to the host, in the form only** —
the host needs to see that they have just built a manager with an IR of 3.0,
which would be the greatest investor who ever lived. Add a soft warning above
`|IR| > 1.0`: *"An information ratio above 1.0 is world-historically good — the
lesson lands better below 0.5."*

Reuse the existing advanced-panel patterns from the portfolio branch
(`Field` + `TextInput` + `Select`, `grid gap-4 sm:grid-cols-2`). With 5 managers
× 6 fields the form is long — put each manager in a `<details>` disclosure like
`OddsDisclosure` in `HostRoundControl.tsx`.

**Stage 5 acceptance:** all three presets create playable sessions; a professor
can run the default without opening Advanced; every out-of-range value is
rejected server-side with a readable message (test by editing the payload in
devtools, not just the form).

---

## 6. Cross-cutting details

### 6.1 The per-year reveal screen

New component `components/ManagerYearResult.tsx`, used by `StudentRound`'s
reveal branch and by `HostRoundControl`/`HostPresent`.

```
Year 7                                    The market: +14.2%

  Meridian Alpha        +18.1%   ↑     you held 40%   →  +$7.24
  Apex Capital           +9.6%   ↑     you held 20%   →  +$1.92
  Titan Leveraged       +26.7%   ↑     —
  ...
  Fees this year                                         −$1.90
  Borrowing cost                                         −$0.00
                                                       ─────────
  Your wealth       $102.30  →  $109.56       (+7.1%)
  The index                                    (+14.2%)
```

Every manager's return is shown to everyone, every year, held or not — inference
from results is the game. Show the market return prominently: relative
performance is the only thing that matters and students should be doing that
subtraction in their heads by year 5.

### 6.2 What the manager game does NOT use

Suppress these for `game_type === 'manager'`; do not delete them.

| Feature | Why |
|---|---|
| Luck chips, `classLuckSoFar`, `expectedGoodRate` | There are no good/bad draws to be lucky in. Replace the class line with `Market: +14.2% this year · +6.1%/yr over 7 years`. |
| `MarketOddsControl` | `good_prob` is meaningless. |
| Counterfactual strategy cards | Replaced by the index comparison + fee total (Stage 4). |
| `OutcomeChips` from `market_outcome` | Reuse `playerDeltaChipsMap` instead — it already produces gained/lost chips per round for the portfolio game and works unchanged here. |
| `show_odds_to_students` | No odds. Hide the toggle in the form. |

Sharpe **does** apply and should be kept — a per-year return series is exactly
what `perRoundReturns` + `sharpeRatio` want, and risk-adjusted return is the
sharpest possible framing for "Titan looked great." No changes needed;
`buildPlayerResults` already reads `risk_free_rate` for the excess return.

### 6.3 The Index as a competitor

Confirmed decision: **one** synthetic competitor, `'The Index'`, `is_bot = true`,
`strategy = 'index'`, compounding `rounds.market_return` with no fees and no
leverage. It appears in the standings and on the chart. Four strategy bots are
**not** in scope for this module — see Backlog.

One targeted change to `0013_student_rankings_exclude_bots.sql`'s functions:

- `get_leaderboard` — include bots whose `strategy = 'index'`, so students see
  the index sitting above them in the list. This is the whole point.
- `get_my_rank` — **unchanged**: rank and total stay among real humans, so
  "you finished 4th of 30" keeps meaning what it says. The index comparison is
  a separate, explicit line on the finish screen (Stage 4).

The existing `BotToggle` hides the index on host surfaces along with other bots —
that is fine and occasionally useful.

### 6.4 CSV

`buildResultsCsv` gains manager-game columns. Per player: final wealth, total
return, per-round return, Sharpe, **total fees paid**, **final wealth vs the
index**, then per-year `Y{n} $`, `Y{n} exposure %`, `Y{n} fees $`. Add a second
sheet-equivalent block (a blank line, then a header) carrying the per-year market
return and each manager's return — the professor will want that for a lecture.
Always include the Index row.

### 6.5 Documentation

- `MECHANICS.md` — a new top-level section, `Manager game`, carrying §§ 3.1–3.7
  verbatim: the return model, the fee order of operations, leverage and the
  wealth update, the shuffle, the track-record derivation, and the two
  intentional leaks. Add it to the contents list at the top.
- `DESIGN.md` § 11 file map — every new component.
- `CLAUDE.md` — one line under Mechanics naming the third game type.
- `README.md` — the game list, and `session_secrets` in the security model
  section (it is a new security-relevant table and belongs in the hardening
  checklist).

---

## 7. The allocation input (confirmed: percent-of-wealth per manager)

`components/student/ManagerAllocationInput.tsx`. Phone-first, `max-w-lg`, the
same shell as `PortfolioAllocationInput`.

```
Your wealth                                          $128.40

  Meridian Alpha        [  40 ] %          $51.36
  Apex Capital          [  20 ] %          $25.68
  Momentum Partners     [   0 ] %               —
  Steady Harbor         [   0 ] %               —
  Titan Leveraged       [  60 ] %          $77.04

  ├──────────────────────────────┼─────────┤
  0%                           100%      120%

  Invested       120%     Cash 0%     Borrowed  $25.68  at 8%
                                      ^^^^^^^^^^^^^^^^^^^^^^^ bg-loss-soft
```

Rules:

- One integer `%` field per manager, `inputMode="numeric"`, with the dollar
  equivalent to its right (grey, not editable).
- A single total meter, **not** per-manager bars. Green up to 100%, then a
  visually distinct `loss`-toned overflow segment out to `leverage_cap`. The
  100% mark is a hard tick on the track — crossing it must feel like crossing a
  line.
- Live borrowed line whenever total > 100%, always naming the rate:
  `Borrowed $25.68 at 8%/yr`. The cost of leverage should never be one click
  away.
- Quick buttons: `All cash`, `Equal split`, `100%`, `Max (2×)`.
- Clamp the total at `leverage_cap × 100`; clamp each field to `[0, cap×100]`.
  Mirror the server bound — never let the client submit something the RPC will
  reject.
- Persist between rounds (§ 1c). Show `Unchanged from last year` when the
  student has not touched anything, and keep the submit button enabled so they
  can confirm — do not make them re-enter numbers to hold a position.
- Percentages are of **current wealth**, so the dollar column moves every year
  while the percentages hold. That is the correct mental model for a portfolio
  and it is what makes "carry forward" meaningful.

At 8 managers on a 375px phone this is 8 rows of `label + field + dollars` —
budget for it: `w-28` label, `w-16` field, dollars `flex-1 text-right` and
`truncate` on the name.

---

## 8. Verification

Beyond the standard gates (`npm run test`, `npx tsc --noEmit`, `npm run build`,
`bash scripts/run-db-selftest.sh`):

**Statistical** — add `lib/game/manager.stats.test.ts`, seeded, not part of the
normal run if it is slow (`describe.skip` with a comment on how to run it):

- 10,000 simulated years: realised mean market return within 0.2% of
  `market_mean`; realised sd within 0.5% of `market_sd`.
- Per manager: realised mean of `r_i − beta_i·r_market` within 0.2% of `alpha_i`;
  realised sd of the residual within 0.3% of `tracking_error_i`.
- Realised correlation between Parity's returns and the market ≈ 0.1×16/6.2 ≈
  0.26. If this comes out near 1, the noise draw is being shared across managers
  — the single most likely implementation bug.
- **Each manager's `eps` must be drawn independently.** Assert pairwise
  correlation between two zero-alpha managers' residuals is ≈ 0. Getting this
  wrong makes every manager move together and quietly destroys the game.

**Pedagogical** — a seeded 25-year run of the default preset, asserted once as a
regression fixture:

- A player who holds 100% Meridian Alpha beats the index **less than ~70%** of
  the time across seeds. If it is 95%, alpha is too large and the lesson is
  gone.
- A player who holds 100% Parity Absolute Return **underperforms the index**
  after fees a meaningful share of the time, while beating it **gross**. This is
  the market-neutral lesson; if it does not reproduce, the fee maths is wrong.
- Titan Leveraged finishes first *or* last far more often than the middle.

**Manual, before calling it done** — run one full 25-year game with 3 browser
tabs (host, student, present). Watch for: the ghost line legible on the
projector; Parity's line visibly uncorrelated with the index; the fee counter
climbing every year; a levered player busting cleanly at $0.

**Security, in the browser as a joined student, mid-game:**

```js
await supabase.from('sessions').select('*')            // config must have no alpha/tracking_error
await supabase.from('session_secrets').select('*')     // must fail
await supabase.rpc('get_manager_truth', { p_session_id: '…' })  // must fail while active
```

Paste the three results into the PR body.

---

## 9. Order of work, and what it costs

```
Stage 1  Core engine          ← the migration is the bulk; everything depends on it
Stage 2  Ghost line + fees    ← small, high visual payoff, do it early for morale
Stage 3  Prospectus cards     ← pure presentation, no engine risk
Stage 4  Reveal + shuffle     ← needs get_manager_truth from Stage 1
Stage 5  Advanced + presets   ← largest form work; the market-neutral fee logic
                                 must already work from Stage 1
```

Stage 1 is roughly half the module. Do not let the migration sprawl — if it
passes 600 lines, split the manager branch of `resolve_round` into its own
`0015_manager_resolve.sql` rather than writing a file nobody can review.

---

## 10. Backlog — explicitly not v1

- Skill persistence / regime change (a manager's alpha flips mid-game).
- High-water marks on performance fees.
- Contributions and withdrawals.
- Manual market mode — the host types the year's index return, so they can force
  a crash on demand and show Parity holding up. High teaching value, ~15 lines
  of SQL plus one input; v1 rejects `market_mode = 'manual'` for manager games so
  there is no half-working path.
- The three extra bots that were considered and not chosen: a performance chaser
  (moves everything to last year's winner), all-cash, equal-weight, and
  max-leverage. The performance chaser is the strongest of these and is the
  first thing to add if the module wants more benchmarks.
- Margin calls / intra-year forced deleveraging.
- Manager capacity constraints (alpha decays as assets grow) — the natural
  sequel lesson.

---

## 11. Things to deliberately not do

- Do not put `alpha`, `beta` or `tracking_error` in `sessions.config`, ever, for
  any reason, including debugging. Use `get_manager_truth`.
- Do not draw the three track-record figures independently. One path, three
  reads.
- Do not share one noise draw across managers.
- Do not generalise the existing good/bad branches in `resolve_round`. Third
  branch.
- Do not compute returns or wealth on the client.
- Do not show information ratio, Sharpe, beta or alpha on a prospectus card.
  (The host's *setup form* is the one exception — § Stage 5.)
- Do not remove the "each round opens blank" behaviour from the basic and
  portfolio games while inverting it for this one.
- Do not add a charting or statistics dependency. Box–Muller is six lines.
