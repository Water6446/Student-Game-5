# Implementation Plan — Student-Game-5

**Audience:** Claude Code, working in `Student-Game-5` on the user's machine.
**Written:** 2026-08-19. **Branch:** repo is on `main` with uncommitted churn — see Task 0.

Read this whole file before touching anything. Then read `CLAUDE.md`, `DESIGN.md`
and `MECHANICS.md` — they are binding, not background.

---

## 0. What this app is (so you don't re-derive it)

A Kahoot-style, in-class investment-risk simulation. A professor hosts a session;
students join from their phones with a 6-character code or QR. Each round every
student splits their **current wealth** between a **safe** pot and one or more
**risky** assets; the host locks submissions, the server draws the market, and
wealth is recomputed. After N rounds the class sees standings, counterfactuals
("what if you'd played one fixed strategy the whole game?") and a CSV export.

**Two game types**

| | Basic | Portfolio |
|---|---|---|
| Risky side | one risky bet | N risky assets (2–10), each with its own market |
| Safe side | flat | can pay `risk_free_rate` per round |
| Outcome per round | one | one per asset |
| Extra knob | — | correlation ρ (0 = independent, 1 = one market) |

**Market scope** — `shared` (one draw for the whole class = systematic risk) or
`independent` (every player draws their own = idiosyncratic risk). Per-player
"luck" chips only mean anything in `independent` scope.

**Benchmark bots** — 4 optional fake players that mechanically play fixed
strategies (basic: all-safe / edge / 50-50 / all-risky; portfolio: all-safe /
one-basket / half-&-half / diversified). They are real `players` rows with
`is_bot = true` and `auth_uid = null`. They are teaching props, not competitors:
excluded from student-facing rankings (`get_my_rank`, `get_leaderboard`), and
hideable on host surfaces via a localStorage-synced toggle.

### Stack and architecture

- **Next.js 14 App Router**, all game screens are `"use client"`. No API routes.
- **Supabase**: Postgres + RLS + Realtime + Auth (hosts = magic link, students =
  anonymous sign-in).
- **Tailwind** with semantic tokens only (`bg-surface`, `text-ink`, `text-gain`,
  `bg-brand`, `bg-play`, …). Raw `slate-*`/`indigo-*`/hex is a design-system
  violation — see `CLAUDE.md`.
- **Recharts** for the wealth chart, `qrcode.react` for the join QR.
- **Vitest** (`npm run test`) — currently only covers `lib/**/*.test.ts`, node
  environment, no component tests.

**The single most important architectural rule:** *all* wealth and market math is
computed by the SQL function `resolve_round`
(`supabase/migrations/0012_correlation.sql`, the current definition). The client
**never** writes `current_wealth`. `lib/game/math.ts`, `portfolio.ts` and
`counterfactual.ts` are a *mirror* of that SQL, used only for previews,
counterfactuals and tests. If you change one, you must change the other and say
so in `MECHANICS.md`.

### Surfaces

| Route | Component | Who / where |
|---|---|---|
| `/` | `app/page.tsx` | landing |
| `/join` | `components/JoinForm.tsx` | student, phone |
| `/play/[sessionId]` | `StudentWaiting` / `StudentRound` / `StudentFinished` | student, phone |
| `/host` | `HostSignIn`, `NewSessionPanel`, `SessionsList` | professor, laptop |
| `/host/[sessionId]` | `HostLobby` → `HostRoundControl` → `HostSummary` | professor, laptop |
| `/host/[sessionId]/present` | `HostPresent` | projector, read-only |

The `/host/[sessionId]` page switches on `session.status`
(`lobby` → `active` → `finished`).

### Realtime data flow (memorise this — three of the tasks depend on it)

Five hooks in `components/`, all the same shape: an initial `.select()` plus a
`postgres_changes` channel.

- `use-session.ts` — the session row (`status`, `current_round`).
- `use-round.ts` — **one** round, looked up by `(sessionId, roundNumber)`.
- `use-round-allocations.ts` — allocations for **one** `roundId`.
- `use-players.ts` — all players in the session.
- `use-session-history.ts` — host-only; every round + every allocation,
  refetched when a round flips to `revealed`. Paginates at 1000 rows because
  PostgREST silently truncates.

**Round lifecycle and the events it emits:**

```
host clicks "Lock & reveal"  (auto mode — components/host/HostRoundControl.tsx:138)
  RPC 1  lock_round      → rounds UPDATE  status: open → locked
  RPC 2  resolve_round   → allocations UPDATE ×players
                         → players      UPDATE ×players
                         → rounds       UPDATE  status: locked → revealed   (LAST write)

host clicks "Next round"
  RPC    next_round      → rounds  INSERT  (round N, status open)
                         → sessions UPDATE (current_round = N)
```

Two consequences that cause the bugs in Tasks 2 and 3:

1. `lock_round` and `resolve_round` are **two separate network round-trips**, so
   every client genuinely renders the `locked` phase for 100–400 ms even though
   the host pressed one button.
2. `useRound` keys off `session.current_round`, so when `next_round` lands the
   session updates *first* and the hook must do a fetch round-trip before it has
   round N. Neither `useRound` nor `useRoundAllocations` clears its state when
   its key changes, so during that window they serve **round N−1's data under a
   round N header**.

---

## 1. Ground rules for every task

1. **Design system is binding.** Read `DESIGN.md` before any UI change. Semantic
   Tailwind tokens only. Icons come from `components/icons.tsx` — never an icon
   library, never emoji. Build from `components/ui.tsx` primitives.
2. **`MECHANICS.md` is the master maths reference.** In-UI explanations stay to
   one line; detail goes in `MECHANICS.md`. Update it whenever a number's
   meaning or provenance changes.
3. **Never move wealth math to the client.** SQL is authoritative.
4. **Tests:** anything you add to `lib/game/**` needs a `*.test.ts` case.
   `npm run test` must pass. `npx tsc --noEmit` must pass. `npm run build` must
   pass.
5. **No new dependencies** without flagging it first.
6. **Scope discipline.** Task 4 in particular is explicitly *not* a feature
   request — see its note.
7. **One commit per task**, message = the task title. Do not bundle.

---

## Task 0 — Fix the line-ending churn (do this first, alone)

**Why first:** `git status` currently shows **48 modified files, 10,854
insertions and 10,854 deletions** — every one of them is a CRLF↔LF flip, not a
real edit. There is no `.gitattributes`. Until this is fixed, every diff you
produce is unreviewable and you risk clobbering real work.

**Steps**

1. `git stash` nothing — first confirm the churn is *only* line endings:
   `git diff --stat` and `git diff --ignore-all-space --stat`. The second should
   report **zero** changed lines. If it does not, STOP and report what differs.
2. Create `.gitattributes` at the repo root:

   ```gitattributes
   * text=auto eol=lf
   *.png binary
   *.jpg binary
   *.ico binary
   *.zip binary
   ```

3. `git add --renormalize .` then commit as
   `chore: normalise line endings to LF (.gitattributes)`.
4. Verify `git status --short` is clean apart from the untracked
   `.claude/skills/frontend-design` symlink (leave that alone — it errors on
   read and is not part of the app).
5. **Then branch:** `git switch -c feature/aug-2026-improvements`. Everything
   below lands on that branch.

**Acceptance:** `git status --short` is clean; `git diff HEAD~1 --stat` shows
only `.gitattributes` plus renormalisation.

---

## Task 1 — Universal collapse for every player-scaling list

> **User's words:** *"I don't want new features for this — rather almost all
> boxes with players or player wealth and such should be collapsed, so in cases
> with 100+ students the list isn't super long and only shows the top 5 and you
> can un-collapse it to see more. Just make sure that is the case for all lists
> of students and things that could scale with amount of students."*

**This is a consistency task, not a feature task.** The mechanism already
exists (`lib/game/condense.ts` + `condenseRanked`) and is already used on three
surfaces. Four more lists ignore it and render every player unbounded. Fix the
gaps and de-duplicate the markup. Do **not** invent new density modes, virtual
scrolling, pagination, or column layouts.

### 1a. Extract the expander markup into one component

Right now the "+N more ▾ / Show fewer ▴" pair is hand-written three times with
three slightly different implementations:

- `components/host/HostRoundControl.tsx:501–560` (`key="gap"`, own `showAll` state)
- `components/host/HostPresent.tsx:529–591` (`key="gap"`, own `showAll` state)
- `components/student/StudentRound.tsx:370–413` (`key={gap-${idx}}`, keeps the
  student's own row visible via `keepIndices`)

Create **`components/CondensedList.tsx`**:

```tsx
"use client";
// Renders a long, ranked list as top-N + "+N more ▾" + bottom-M, with a
// "Show fewer ▴" toggle. The single home for the collapse pattern used on every
// surface that lists players (see lib/game/condense.ts for the pure split).
export function CondensedList<T>({
  items,
  keyOf,
  renderItem,
  keepIndices,
  options,
  as = "ol",
  className,
  gapClassName,
  toggleClassName,
}: {
  items: T[];
  keyOf: (item: T, index: number) => string;
  /** index is the position in the ORIGINAL array, so ranks never renumber */
  renderItem: (item: T, index: number) => React.ReactNode;
  keepIndices?: number[];
  options?: CondenseOptions;
  as?: "ol" | "ul";
  className?: string;
  /** styling hook so the projector can use bigger type than the control panel */
  gapClassName?: string;
  toggleClassName?: string;
}): JSX.Element
```

Behaviour it must encapsulate:

- owns the `showAll` boolean;
- collapsed → `condenseRanked(items, options)`;
  expanded → `condenseRanked(items, { ...options, threshold: Infinity })`;
- renders a `<li>` with a button reading `+{hidden} more ▾` for every gap, with a
  **unique key** (`gap-${index}` — `HostRoundControl` and `HostPresent` currently
  use a constant `"gap"` key, which is a latent React bug if `keepIndices` ever
  produces two gaps);
- renders `Show fewer ▴` below the list **only** when expanded *and* the list
  would have been condensed;
- `aria-expanded` on both buttons, and the expander button gets an
  `aria-label` like `Show 92 more players`.

Then rewrite the three existing call sites to use it, byte-for-byte preserving
their current visual output (type sizes and colours differ per surface — that's
what `gapClassName` / `toggleClassName` are for).

**Do not change `lib/game/condense.ts`.** Its defaults (top 5, bottom 3,
threshold 10) stay as-is — they are documented in `MECHANICS.md` § Standings and
already match "shows the top 5 and you can un-collapse". Keeping the bottom-3
tail is deliberate: on a leaderboard the last places are as interesting as the
first, and changing it would silently invalidate `condense.test.ts` and the
docs.

### 1b. Apply it to the four lists that currently render every player

| # | File | What renders unbounded | Sort order (keep it) |
|---|---|---|---|
| 1 | `components/host/HostSummary.tsx:255–329` | "Final standings" — `visibleResults.map(...)`, each row an expandable accordion | final wealth desc |
| 2 | `components/host/HostSummary.tsx:383–417` | "Luck" card — `luck.map(...)` | luck delta desc |
| 3 | `components/host/FinalResults.tsx:38–98` | end-of-game panel inside `HostRoundControl` | pre-ranked by `buildPlayerResults` |
| 4 | `components/host/AllocationsBreakdown.tsx:113–157` | per-round allocations, shown at `locked` and `revealed` | risky amount desc |

For #1, `keepIndices` must include the currently-open accordion row (`openId`)
so expanding a player then collapsing the list doesn't hide the open panel.

For #4 the semantics read as "biggest gambler … smallest" — the top/bottom split
is still the right cut, so no special handling.

### 1c. Two bounded-scroll lists to convert

These are already length-limited by a `max-h`, which on a phone or projector
turns into a tiny scroll trap rather than a readable summary:

- `components/host/HostRoundControl.tsx:328–344` — the submitted-players
  checklist, `max-h-44 grid-cols-2`. Replace the `max-h` scroll with
  `CondensedList` (top 5 / bottom 3). **Important:** this list's *purpose* is
  spotting who hasn't submitted, so pass options that keep un-submitted players
  visible — sort un-submitted first, then submitted, and keep the default
  condense on top of that sort.
- `components/host/HostLobby.tsx:109–124` — the joining roster,
  `max-h-[42vh] overflow-y-auto`. **Leave the scroll**, but add a count badge
  cap: when `players.length > 24`, render via `CondensedList` instead, because
  the animated `animate-pop-in` rows at 100 players are a real jank source.
  (If you disagree after seeing it, leave the scroll and note why in the PR.)

### 1d. The wealth chart — flag, don't rebuild

`components/host/WealthChart.tsx` renders one `<Line>` per player from a
12-colour palette. At 100 students it is 100 overlapping lines in 12 repeated
colours: illegible and slow. This is a *chart*, not a list, so "collapse" does
not literally apply and the user asked for no new features.

**Do this much and no more:** when `players.length > 12`, render the top 8 by
final wealth plus the bottom 2 as coloured lines and every other player as a
single `stroke="rgb(var(--ink))" strokeOpacity={0.12}` line with no tooltip
entry, and put a one-line caption under the chart: *"Showing the top 8 and
bottom 2 by name; the rest are shown in grey."* No toggle, no legend, no new
state. If this feels like scope creep when you get there, skip it and raise it
in the PR body instead — it is the one genuinely optional item in this task.

### Acceptance criteria

- Every list of players on every surface either uses `CondensedList` or is
  explicitly justified in the PR body.
- With 100 players seeded, `/host/[id]` (active), `/host/[id]` (finished),
  `/host/[id]/present` and `/play/[id]` each fit their primary content without
  the page growing past ~2 screen-heights before expanding.
- Rank numbers never renumber across a gap (this is what `index` in
  `CondensedItem` is for — do not substitute the array position).
- `npm run test` passes; `condense.test.ts` is untouched.

---

## Task 2 — Bug: bots make the submission counter read "5/n" for a split second

**Symptom (user):** *"Bots show 5/n filled for split second."*

**Root cause — two compounding defects.** Both must be fixed.

**Defect A — stale allocations survive a round change.**
`components/use-round-allocations.ts:18–24`:

```ts
useEffect(() => {
  if (!roundId) { setAllocs([]); return; }   // ← only clears when roundId is NULL
  let active = true;
  supabase.from("allocations").select("*").eq("round_id", roundId).then(...)
```

When the host advances the round, `roundId` changes from N−1 to N but `allocs`
keeps holding **round N−1's rows** until the new fetch resolves. Round N−1 is
`revealed`, so those rows include an allocation for *every* player, bots
included (see below). Hence a fully-filled counter for one network round-trip.

**Defect B — the host control counter counts bots.**
`components/host/HostRoundControl.tsx:84–86`:

```ts
const submittedIds = useMemo(() => new Set(allocs.map((a) => a.player_id)), [allocs]);
const humanPlayers = useMemo(() => players.filter((p) => !p.is_bot), [players]);
```

Numerator includes bots, denominator does not. Bots never "submit" — their
allocation rows are **written by `resolve_round` at reveal time**
(`supabase/migrations/0012_correlation.sql`, the `if r.is_bot then …` branch and
the `insert into public.allocations` that follows). So with 4 bots and 1 human
who submitted, the stale set is size 5 against a denominator of 1 → "5 / 1".
`components/host/HostPresent.tsx:165–173` already gets this right; the control
screen was never updated to match.

### Fix

1. **`components/use-round-allocations.ts`** — clear on key change and expose
   loading state:

   ```ts
   export function useRoundAllocations(supabase, roundId): {
     allocations: AllocationRow[];
     loading: boolean;
   }
   ```

   In the effect, unconditionally `setAllocs([])` and `setLoading(true)` before
   the fetch; `setLoading(false)` in the `.then`. Keep the existing realtime
   merge logic. Update all three call sites
   (`HostRoundControl.tsx:52`, `HostPresent.tsx:161`, `StudentRound.tsx:29`).

   *Keep it a breaking signature change on purpose* — a silent shape change
   would let a call site keep reading a stale array.

2. **`components/host/HostRoundControl.tsx`** — mirror `HostPresent`'s
   human-only counting. Extract the shared logic so the two surfaces can never
   drift again; put it in `lib/game/results.ts` as a pure helper:

   ```ts
   /** Human players who have an allocation row this round. Bots never "submit":
    *  resolve_round writes their rows at reveal time, so counting them would
    *  show a full counter the instant the previous round resolved. */
   export function submittedHumanCount(
     players: PlayerRow[],
     allocations: AllocationRow[],
   ): { submitted: number; total: number }
   ```

   Use it in both components and in `AllocationsBreakdown.tsx:87–88`, which
   computes the same thing a third way.

3. While `loading` is true, render the counter as `—/{total}` rather than a
   number, so a slow fetch degrades to "unknown" instead of "wrong".

### Acceptance criteria

- Seed a session with bots + 3 humans. Reveal a round, then click **Next
  round** and watch the counter: it must go from the revealed panel straight to
  `0/3` (or `—/3` for one frame). It must never display a numerator above the
  number of humans who have actually submitted this round.
- Same check on `/host/[id]/present`.
- Unit test `submittedHumanCount` in `lib/game/results.test.ts`: bots with
  allocation rows are excluded from both numerator and denominator; humans
  without rows count toward the denominator only.

---

## Task 3 — Bug: the old screen shows for a few frames after lock / reveal

**Symptom (user):** *"For a split second after locking and revealing reveal
results, old screen shown for a few frames."*

**There are two independent mechanisms.** Fix both; they produce the same
symptom class and a fix for one will not hide the other.

### Mechanism A — a stale round row is served under a new round header

`components/use-round.ts:20–35` never resets `round` when `roundNumber` changes:

```ts
useEffect(() => {
  if (!roundNumber || roundNumber < 1) { setRound(null); return; }
  let active = true;
  supabase.from("rounds").select("*")
    .eq("session_id", sessionId).eq("round_number", roundNumber).maybeSingle()
    .then(({ data }) => { if (active) setRound((data as RoundRow) ?? null); });
```

When `next_round` lands, `session.current_round` updates first (its own realtime
channel), so `HostRoundControl` re-renders with `Round N` in the header at
`:244` while `round` is still round N−1 with `status === "revealed"` — so the
whole revealed panel (market up/down banner, allocations, or the `FinalResults`
block) renders under the new header until the refetch completes. On
`/play/[id]`, `StudentRound` gets the same stale round and briefly re-shows the
previous round's `Reveal` screen before flipping to the blank allocation input.

The realtime subscription can't save you here either: `use-round.ts:45` ignores
the `rounds` INSERT for round N whenever it arrives before the session UPDATE,
because `roundNumber` is still N−1 at that moment.

### Mechanism B — the transient `locked` phase in the one-click flow

`components/host/HostRoundControl.tsx:138–151`, `lockAndReveal`, issues
`lock_round` and then `resolve_round` as two awaited RPCs. Between them, every
connected client receives `rounds UPDATE status = locked` and dutifully renders
the locked phase:

- student: *"Nice. Now we wait. / Waiting for the reveal…"*
  (`StudentRound.tsx:110–141`)
- projector: *"Bets are locked / Revealing the market…"* (`HostPresent.tsx:243–251`)
- host: the manual-pick / "Auto market — the server will roll" panel
  (`HostRoundControl.tsx:348–416`)

In **manual** market mode this is correct — the host really does lock, review,
then reveal. In **auto** mode it is a 100–400 ms flash of a screen nobody asked
for.

### Fix — one shared hook

Create **`components/use-round-phase.ts`**:

```ts
"use client";
export type RoundPhase = "loading" | "open" | "locked" | "revealed";

/**
 * The round phase a screen should DISPLAY, as opposed to the raw row status.
 *
 *  - "loading" whenever the loaded round is not the session's current round
 *    (use-round needs a fetch round-trip after next_round; without this gate
 *    every surface renders round N-1's content under a round N header).
 *  - the "locked" phase is held back by `settleMs`: in auto market mode the
 *    host's single "Lock & reveal" click fires two sequential RPCs, so `locked`
 *    is a transient the class should never see. A genuine manual lock outlives
 *    the delay and shows normally.
 */
export function useRoundPhase(
  round: RoundRow | null,
  currentRoundNumber: number,
  opts?: { settleMs?: number },   // default 450
): { phase: RoundPhase; round: RoundRow | null };
```

Rules it must implement:

1. If `round == null` **or** `round.round_number !== currentRoundNumber` →
   `"loading"`, and return `round: null` so callers cannot read stale fields.
2. Else if `round.status === "locked"` and the phase has been `locked` for less
   than `settleMs` → keep returning the **previous** phase (`"open"`). Once
   `settleMs` elapses, return `"locked"`. If the row flips to `revealed` inside
   the window, go straight `open → revealed` and never emit `locked`.
3. `revealed` and `open` pass through immediately.
4. Reset all internal timers when `round.id` changes; clear timeouts on unmount.

Wire it into the three consumers:

- **`components/host/HostRoundControl.tsx`** — replace
  `const status = round?.status ?? "open"` (`:173`). While `phase === "loading"`,
  keep rendering the previous phase's panel but disable the primary button and
  show the existing `StatusBadge` in a neutral "…" state — do **not** flash a
  full-page "Loading…", the host is mid-click.
- **`components/student/StudentRound.tsx`** — switch on `phase` instead of
  `round.status` (`:71`, `:110`, `:144`). `"loading"` renders the `locked`
  waiting card (it is the honest "something is happening" state and is what the
  student was already looking at).
- **`components/host/HostPresent.tsx`** — replace
  `const status = round?.status ?? "open"` (`:200`). Also gate the reveal
  takeover effect (`:211–219`) on `phase === "revealed"` so the takeover can't
  fire off a stale round id.

### Also fix: the reveal renders before the allocation row catches up

`components/student/StudentRound.tsx:225–227`:

```ts
const resulting = mine?.resulting_wealth != null ? Number(mine.resulting_wealth) : me.current_wealth;
const before = mine ? Number(mine.safe_amount) + Number(mine.risky_amount) : me.current_wealth;
const delta = resulting - before;
```

If the `rounds` UPDATE is applied before this player's `allocations` UPDATE,
`delta` is 0 for a frame → the portfolio header renders **"Flat round"** on an
ink background and the `Confetti` never fires, then it snaps to the real result.
Guard it: while `phase === "revealed"` but `mine?.resulting_wealth == null`,
render the `locked` waiting card instead of `Reveal`. One extra frame of "waiting"
beats a wrong headline.

### Optional follow-up (do NOT do it in this pass — raise it in the PR)

Mechanism B could be removed at the source with a `lock_and_resolve_round`
SECURITY DEFINER RPC in a new `supabase/migrations/0014_*.sql`, so the auto path
is a single transaction and a single round-trip. That is the *correct* long-term
fix, but it needs a migration push (`npm run db:push`) plus a `db_selftest.sql`
update to keep asserting that `resolve_round` still refuses an unlocked round.
Mention it; don't build it now.

### Acceptance criteria

- Auto mode, host clicks **Lock & reveal**: no client ever renders a "locked" /
  "waiting for the reveal" state. Verify on host, student and present tabs
  simultaneously.
- Manual mode, host clicks **Lock allocations**: the locked state appears
  normally (after ≤ ~450 ms) on all three surfaces.
- Host clicks **Next round**: no surface renders round N−1's revealed content
  under a round N header, at any frame.
- Student reveal never shows "Flat round" / a $0 delta for a player who actually
  gained or lost.
- Record it: capture a screen recording of both transitions at 4× slowdown, or
  step through with React DevTools' "highlight updates".

---

## Task 4 — Sharpe ratio on the results page

**Current state (verified):** Sharpe is *already* computed and already rendered
in four places. This task promotes one of them and audits the maths.

- `lib/game/results.ts:157` `sharpeRatio(returns, riskFree)` — population stdev,
  unannualised, `null` when < 2 returns or stdev ≈ 0.
- `lib/game/results.ts:140` `perRoundReturns(startWealth, wealthByRound)` —
  stops the series after a wipeout.
- `lib/game/format.ts:27` `sharpeText()` → `"1.24"` / `"−0.33"` (U+2212) / `"—"`.
- Rendered: `HostSummary.tsx:317` (**hidden inside the click-to-expand row**),
  `FinalResults.tsx:73`, `StudentFinished.tsx:115`, and the CSV
  (`buildResultsCsv`, `results.ts:519`).

### 4a. Promote it on the host summary

In `components/host/HostSummary.tsx`, the "Final standings" list
(`:255–329`) currently shows rank · name · chevron · luck chip · total return ·
final wealth, and hides Sharpe in the expanded panel. Add Sharpe as a
**permanent column** between the luck chip and the total return:

```tsx
<span
  className="shrink-0 font-mono text-xs text-ink-muted"
  title="Sharpe ratio — return per unit of risk taken (see MECHANICS.md)"
>
  S {sharpeText(r.sharpe)}
</span>
```

Match the treatment already used in `components/host/FinalResults.tsx:69–74` so
the two host panels read identically. Keep the fuller sentence inside the
expanded panel (`:317–320`) — that's where the explanation belongs.

Because this row is already crowded and Task 5 has to make it work at 375 px,
do Task 5's row restructuring **after** this, not before.

Header hint: update the caption at `:254` from *"Click a player to see every
market they faced."* to *"S = Sharpe (return per unit of risk). Click a player
to see every market they faced."* — one line, per `CLAUDE.md`.

### 4b. Audit the existing Sharpe, with tests

Add each of these to `lib/game/results.test.ts` (the file already exists and
already covers `perRoundReturns` / `sharpeRatio` — extend it, don't replace it):

1. **Population, not sample, stdev.** Assert against a hand-computed value.
   `MECHANICS.md` promises population; `results.ts:161` divides by `n`. Lock it.
2. **The documented wipeout example.** `MECHANICS.md` § Sharpe ratio states:
   +10% then −100% → mean −0.45, stdev 0.55 → Sharpe ≈ **−0.82**. Assert
   `toBeCloseTo(-0.818, 3)`.
3. **Risk-free handling, portfolio.** With `risk_free_rate = 0.02`, an all-safe
   player's returns are all exactly `0.02` → stdev 0 → `null` → `"—"`. Assert.
4. **Risk-free handling, basic.** `buildPlayerResults` reads
   `session.config.risk_free_rate ?? 0` (`results.ts:368`) for *both* game
   types. Confirm a basic session never carries the key: `CreateSessionForm`
   sends `risk_free_rate: undefined` for basic (`:205`) and `JSON` drops
   undefined keys, and `create_session`'s `v_defaults` (0012, `:40–45`) does not
   include it. Add a regression test that a basic `SessionConfig` without the
   key produces `rf = 0`.
5. **`< 2` returns → null.** A 1-round game returns `null`, not `0`.
6. **Late join / missed round.** `wealthByRound` carries the last value forward
   (`results.ts:363–364`), so a missed round reads as a 0% return and drags
   stdev down. This is documented behaviour — assert it so it can't change
   silently, and add one line to `MECHANICS.md` § Sharpe ratio noting that a
   late joiner's leading rounds count as 0% returns.
7. **CSV column.** `buildResultsCsv` writes `round2(sharpe)` or `""`. Assert an
   all-safe player yields an empty cell, and that the header contains `Sharpe`
   at the expected index.
8. **`sharpeText` sign.** `format.test.ts` should assert the U+2212 minus
   (`"−0.33"`, not `"-0.33"`) and the `"—"` for null.

**Do not change the Sharpe formula.** If any test above fails, the *test* has
found a real bug — report it before "fixing" it, because `MECHANICS.md` is the
contract and changing the number changes what the professor teaches.

### Acceptance criteria

- Sharpe visible without clicking on `/host/[id]` when finished.
- All eight tests above exist and pass.
- `MECHANICS.md` § Sharpe ratio mentions the late-join caveat.

---

## Task 5 — Host screens on a phone

**Scope, confirmed with the user: host surfaces only.** The student screens are
already mobile-first (`max-w-lg`, no breakpoint prefixes) and are out of scope
for this task. `DESIGN.md` § 10 already sets the bar you're being held to:
*"Mobile-first: works at 375px, no horizontal scroll, `min-h-dvh`"* — the host
screens simply never got that pass. Responsive-prefix counts today:
`HostPresent` 16, `CreateSessionForm` 3, `HostSummary` 2, `HostLobby` 2,
`HostRoundControl` 1, and **zero** in `WealthChart`, `SessionHistoryTable`,
`SessionsList`, `MarketOddsControl`, `FinalResults`, `BotToggle`.

Test viewport: **375 × 667** (iPhone SE) and **390 × 844** (iPhone 14). Both
portrait. Chrome DevTools device emulation is sufficient.

### 5a. `app/host/page.tsx` (dashboard)

- `:29` `max-w-3xl px-6 py-12` → `px-4 py-8 sm:px-6 sm:py-12`.
- `:30` header is `flex items-center justify-between` with a title block and a
  Sign-out button → add `flex-wrap gap-3`.

### 5b. `components/host/HostRoundControl.tsx`

- `:235` `max-w-5xl px-6 py-8` → `px-4 py-6 sm:px-6 sm:py-8`.
- `:236–277` the header packs Dashboard link + `Round N / M` + StatusBadge +
  Present + Finish early + Delete into one non-wrapping row. Make it
  `flex-wrap gap-y-3`, and below `sm` render Present / Finish early / Delete as
  icon-only buttons with `aria-label` (icons already exist: `Monitor`, `Flag`;
  add nothing new — Delete can stay a text button, it's short).
- `:328` submitted checklist `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`
  (interacts with Task 1c — do them together).
- `:520–547` standings rows put name, luck chip, five `OutcomeChips` and the
  money value on one line. At 375 px that overflows. Restructure to a two-row
  layout below `sm`: name + money on the first line, luck + chips on the second,
  using `flex-wrap` (not a media-query component swap).
- `:138–141` the `w-16 sm:w-24` risk meter inside `AllocationsBreakdown` is
  fine; the `w-[88px]` numeric column next to it is the tight one — give it
  `w-20 sm:w-[88px]`.

### 5c. `components/host/HostSummary.tsx`

- `:136` `max-w-5xl px-6 py-8` → `px-4 py-6 sm:px-6 sm:py-8`.
- `:262–302` the standings button row is the worst offender: rank + name +
  chevron + luck chip + return + `font-mono text-2xl` money, and Task 4 adds a
  Sharpe column. Restructure to two rows below `sm` (name row / stats row), with
  the money value dropping to `text-xl sm:text-2xl`.
- `:383–417` Luck rows: `w-14` delta column plus a `{good}/{total} good` label —
  allow wrap.
- `:187` strategy cards `grid-cols-2 sm:grid-cols-4` — already fine, leave it.

### 5d. `components/host/HostLobby.tsx`

- `:65` `max-w-5xl px-6 py-10` → `px-4 py-6 sm:px-6 sm:py-10`.
- `:77` the QR is a hard `size={220}`. At 375 px the card interior is ~279 px so
  it fits, but only just. Make it responsive with a container measurement or
  simply `size={180}` below `sm` via a `useMediaQuery`-free approach: render the
  `QRCodeSVG` inside a `w-[180px] sm:w-[220px]` wrapper and pass
  `className="h-full w-full"` with `size={220}` — SVG scales.
- `:72` `text-6xl sm:text-7xl` join code — fine.
- `:82` the button row already wraps.

### 5e. `components/host/WealthChart.tsx`

- `:110` `h-72` → `h-56 sm:h-72`.
- `:124` `YAxis width={72}` eats 20% of a 375 px viewport. Use `width={52}` below
  `sm`; simplest correct approach is to read a `compact` prop from the parent
  rather than measuring — but a plain `width={56}` at all sizes is an acceptable
  and much simpler answer. Pick one and say which in the PR.

### 5f. `components/host/SessionHistoryTable.tsx`

Already wraps in `overflow-auto` with a sticky header — verify it actually
scrolls horizontally on a phone rather than forcing the page wide, and that the
sticky `<thead>` still sticks inside the scroller.

### 5g. Global check

Add a one-off verification pass, not a permanent test: at 375 px on every host
route, run in the console

```js
[...document.querySelectorAll('*')].filter(el => el.scrollWidth > document.documentElement.clientWidth)
```

and confirm it returns only intentional scrollers (the history table, the chart
container). Paste the result per route into the PR body.

### Out of scope

`HostPresent` is a **projector** view — it uses `px-[3vw]` and `clamp()` sizing
by design (`DESIGN.md` § 9). Do not "fix" it for phones; the `sm:` prefixes in
it exist for small projectors, not handsets.

### Acceptance criteria

- No horizontal page scroll on `/host`, `/host/[id]` (lobby, active, finished)
  at 375 px.
- Every interactive element ≥ 44 px touch target (`DESIGN.md` § 10).
- Desktop rendering at ≥ 1024 px is **pixel-identical** to before. Screenshot
  diff each host route before and after.

---

## Task 6 — Keyboard shortcuts

**Scope, confirmed with the user:** host round control and the student play
screen. Not the present view, not the summary.

### 6a. Shared guard hook

Create **`components/use-hotkeys.ts`**:

```ts
"use client";
/** True when the event target is somewhere a keystroke means text, not a command. */
export function isTypingTarget(el: EventTarget | null): boolean;
  // input, textarea, select, [contenteditable], and any element inside one

export function useHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  opts?: { enabled?: boolean },
): void;
```

Non-negotiable behaviour:

- attaches one `keydown` listener on `window`, cleaned up on unmount;
- **no-ops** when `isTypingTarget(e.target)` — except for keys explicitly
  allow-listed as submit keys (see 6c);
- **no-ops** when any of `e.metaKey`, `e.ctrlKey`, `e.altKey` is set, so browser
  and OS shortcuts are never shadowed;
- matches on `e.key` lower-cased, so Shift-holding doesn't break it;
- calls `e.preventDefault()` only when a handler actually ran (otherwise Space
  stops scrolling the page for no reason);
- respects `enabled: false` by not attaching at all.

### 6b. Host round control — `components/host/HostRoundControl.tsx`

| Key | Action | Enabled when |
|---|---|---|
| `Space` / `Enter` | fire the pinned primary button | `!busy` and a primary action is available |
| `g` | manual market → **good** | `isManual`, `status === "locked"` |
| `b` | manual market → **bad** | `isManual`, `status === "locked"` |

Details:

- The primary button is already pinned to a single place across all phases
  (`:281–313` — the comment there explains why). The shortcut targets whichever
  of `lockAndReveal` / `lock` / `reveal` / `next` / `finish` is currently
  rendered. Implement it by hoisting that choice into one
  `primaryAction: { label, run, disabled } | null` memo and having both the
  button and the hotkey consume it — do not duplicate the branching.
- In **manual portfolio** mode, `g` / `b` set the **next unset asset** in index
  order, so the host can type `g g b g` to resolve four assets. Once all assets
  are set, further `g`/`b` presses replace the last one. This is the only
  reasonable single-key mapping for N assets — do not add per-asset number keys.
- **No destructive shortcuts.** `Finish early` and `Delete` stay mouse-only;
  both are irreversible and both currently sit behind a `window.confirm`.
  Do not add `f`, `d`, or `Delete` bindings.
- **Discoverability, not a modal:** render a single `<kbd>`-styled legend line
  directly under the primary button, e.g.
  `Space — lock & reveal · G / B — set the market` (only showing the keys that
  currently apply). Style it with the existing
  `font-mono text-xs text-ink-subtle`; add a small `Kbd` helper to
  `components/ui.tsx` if you want the boxed look, following `DESIGN.md` § 7
  (`border-2 border-ink`, `rounded-lg`, `shadow-card` at a small scale).
  Hide the legend below `sm` — phones have no keyboard, and Task 5 needs that
  vertical space.

### 6c. Student play screen — `components/student/StudentRound.tsx`

| Key | Action | Enabled when |
|---|---|---|
| `Enter` | submit / update the allocation | `phase === "open"`, `touched`, `!busy` |
| `←` / `→` | nudge risky by ∓/±5% of wealth | basic game, `phase === "open"`, focus **not** in a field |

Details:

- `Enter` is the one key that **must** work while focus is inside a number
  input — that is the whole point. Allow-list it explicitly in `useHotkeys`
  rather than weakening `isTypingTarget`.
- The `←`/`→` nudge applies to the basic game only. The portfolio input has N
  fields where Tab already does the right thing; adding arrow semantics there
  would fight the native number-input stepper. Explicitly do not bind anything
  else on the portfolio screen.
- Clamp through the existing `clamp()` in
  `components/student/AllocationInput.tsx:34–38` — do not re-implement the
  bounds.
- No legend on the student screen. It's a phone; the keys are a convenience for
  the handful of students on laptops.

### Acceptance criteria

- Typing a name or an amount never triggers a shortcut.
- `Cmd/Ctrl + R`, `Cmd/Ctrl + L`, browser find, and tab-switching all still work
  on every screen with hotkeys attached.
- `Space` on the host screen does not scroll the page when it fires an action,
  and *does* scroll normally when no action is available.
- Every hotkey has a visible mouse equivalent — nothing is keyboard-only
  (`DESIGN.md` § 10).
- Listeners are removed on unmount (verify by navigating away and pressing keys).

---

## Task 7 — Spaghetti cleanup and phased-out features

Each item below is a concrete, verified finding. Do them as separate commits
inside the task branch so any one can be reverted.

### 7a. The testing-only host bypass (highest priority — it's a security hole)

`CLAUDE.md` flags this explicitly: *"The host **'Skip email — sign in for
testing'** bypass in `HostSignIn` is a temporary testing hack and must be gated
before a production deploy."*

Three coupled pieces:

- `components/host/HostSignIn.tsx:27` and `:76` — the anonymous sign-in button.
- `app/host/page.tsx:22–26` — the auth check reduced to `if (!user)`, with a
  comment saying the production form is `!user || isAnonymous(user)`.
- `supabase/migrations/0008_temp_allow_anon_host.sql` — the matching SQL relaxation.

**Do:** gate the client pieces behind an explicit env flag, defaulting to
**off**:

```ts
const ALLOW_ANON_HOST = process.env.NEXT_PUBLIC_ALLOW_ANON_HOST === "true";
```

Add `NEXT_PUBLIC_ALLOW_ANON_HOST=false` to `.env.example` with a comment. Restore
`!user || (isAnonymous(user) && !ALLOW_ANON_HOST)` in `app/host/page.tsx`, and
render the skip button only when the flag is on. **Do not touch migration
0008** — reverting it needs a DB push and a `db_selftest.sql` update; instead
open a note in the PR body that 0008 remains a live server-side relaxation and
should get its own migration before any public deploy.

This also revives `isAnonymous` (`components/use-supabase-user.ts:42`), which is
currently exported and referenced only in a comment.

### 7b. Duplicated `cents()` — three copies

`components/student/AllocationInput.tsx:8`,
`components/student/PortfolioAllocationInput.tsx:9`, and
`lib/game/portfolio.ts:91` each define an identical
`Math.round(n * 100) / 100`. `lib/game/results.ts:58` defines the same thing as
`round2`. Export one `roundCents` from `lib/game/math.ts`, delete the other
four, update imports.

### 7c. `WealthChart.tsx` — the worst file in the repo

Verified issues:

- **Raw hex everywhere** (`:20–21` palette, `:112`, `:115`, `:118`, `:123`,
  `:136`, `:137`) — a direct violation of the `CLAUDE.md` rule. Recharts needs
  real colour strings, not Tailwind classes, so add a small exported map in
  `app/globals.css`-adjacent TS (e.g. `lib/design/colors.ts`) that reads the
  same values once, and reference it from both `WealthChart` and
  `components/Confetti.tsx:8` (which has the same problem). Document the file in
  `DESIGN.md` § 11's file map.
- **Split imports** — `useMemo` at `:3` and `memo, useState, useEffect` at `:14`,
  below the type imports. Merge into one React import at the top.
- **Ad-hoc cross-tab localStorage** (`:40–57`) — reimplements exactly the
  pattern `components/use-show-bots.ts` already encapsulates (and which
  `DESIGN.md` § 11 names as *the* cross-tab preference pattern). Extract a
  generic `components/use-synced-preference.ts` and have both
  `use-show-bots.ts` and the chart's log-scale toggle use it.
- **`any` types** at `:139` (`_name: any, item: any`). Type them.
- **Broken JSX indentation** from `:113` to the closing tags — the `<XAxis>`
  onwards sit at the wrong depth and the closing `</div>` block at `:160–172` is
  misaligned. Reformat.

### 7d. Duplicated luck-chip markup

The same Clover-icon + `signedPct` + colour-by-sign + identical `title` string
is rebuilt three times:
`HostRoundControl.tsx:530–539`, `HostSummary.tsx:277–287`,
`FinalResults.tsx:57–67`. Extract `components/LuckChip.tsx` taking
`{ luck: LuckStats | null; expected: number; withWord?: boolean }` — two of the
three append `"lucky" / "unlucky"`, one doesn't; that's the only difference.

### 7e. The un-tokenised cream

`#F6EFDD` appears raw in `HostPresent.tsx:122, 123, 126, 132` and
`HostLobby.tsx:68, 69, 72, 80` as `text-[#F6EFDD]` / `text-[#F6EFDD]/70`. It is
the "cream on ink" pairing the design system uses for dark panels but never
tokenised. Add `--paper-inverse: 246 239 221;` to `app/globals.css` and a
`paper.inverse` colour in `tailwind.config.ts`, then replace all eight usages
with `text-paper-inverse` / `text-paper-inverse/70`. Document it in `DESIGN.md`
§ 2.

### 7f. Small hygiene

- `components/student/PortfolioAllocationInput.tsx:38` and `:102` — trailing
  whitespace on otherwise-blank lines.
- `components/host/HostRoundControl.tsx:40` — a 200-character single-line import
  of 13 icons; wrap it.
- `lib/game/results.ts:58` `round2` — fold into 7b's `roundCents`.

### Explicitly NOT dead — leave alone

Checked and confirmed live; don't "clean these up":

- `allow_late_join` — surfaced in `CreateSessionForm.tsx:521` and enforced in
  `join_session` (`0003_functions.sql:110`).
- `show_full_leaderboard_to_students` — read at `StudentRound.tsx:236` and
  gated server-side in `get_leaderboard`.
- `market_mode: "manual"` — fully implemented on both sides, including the
  per-asset portfolio path.
- `condense.ts` — the basis of Task 1.

### Acceptance criteria

- `npx tsc --noEmit` clean, `npm run test` green, `npm run build` green.
- `grep -rn '#[0-9A-Fa-f]\{6\}' components/ app/` returns nothing outside
  `lib/design/colors.ts` and `app/globals.css`.
- `grep -rn 'function cents' .` returns one result.
- Hosting still works with `NEXT_PUBLIC_ALLOW_ANON_HOST=true`, and is correctly
  blocked with it unset.

---

## Recommended order

Dependencies are real here; this sequence avoids rework.

```
0. Line endings + branch          ← blocks reviewable diffs; do alone
1. Task 3  Reveal/lock timing     ← touches use-round + use-round-allocations
2. Task 2  Bots 5/n counter       ← builds on Task 3's hook changes
3. Task 1  Universal collapse     ← extracts CondensedList, rewrites the lists
4. Task 4  Sharpe on the summary  ← adds a column to a list Task 1 just rewrote
5. Task 5  Host screens on phone  ← must lay out the row Task 4 just widened
6. Task 6  Keyboard shortcuts     ← wants Task 3's primaryAction consolidation
7. Task 7  Spaghetti cleanup      ← safest last; touches everything lightly
```

Tasks 2 and 3 share `use-round-allocations.ts`; do them back-to-back.
Tasks 1, 4 and 5 all edit the same `HostSummary` standings row; doing them out
of order means writing that row three times.

---

## Verification matrix

Run before opening the PR. Seed a session with **100 players + 4 bots** — write
a throwaway script against the local Supabase, don't click 100 times.

| Check | Command / method |
|---|---|
| Unit tests | `npm run test` |
| Types | `npx tsc --noEmit` |
| Production build | `npm run build` |
| DB security model unchanged | `bash scripts/run-db-selftest.sh` (needs Docker) |
| Round transitions | 3 tabs (host / student / present), auto **and** manual mode, screen-recorded |
| 100-player collapse | every host + student surface, expanded and collapsed |
| Phone layout | 375 px and 390 px on `/host`, `/host/[id]` × 3 states |
| Desktop regression | screenshot diff every host route at 1440 px |
| Keyboard | every binding, plus typing in every input on those screens |
| CSV | download from `/host/[id]` finished; confirm the `Sharpe` column and that bots are still included regardless of the bot toggle |

**Docs to update as part of the work, not after:**

- `MECHANICS.md` — the Sharpe late-join caveat (Task 4b.6). Nothing else in it
  should change; if you find yourself editing a formula, stop and ask.
- `DESIGN.md` — § 2 gets the `paper-inverse` token, § 11's file map gets
  `components/CondensedList.tsx`, `components/use-hotkeys.ts`,
  `components/use-round-phase.ts`, `components/use-synced-preference.ts`,
  `components/LuckChip.tsx` and `lib/design/colors.ts`.
- `CLAUDE.md` — once Task 7a lands, rewrite the "Notable" bullet about the
  `HostSignIn` bypass to describe the env flag instead of a raw hack.
- `README.md` — no change expected.

---

## Things to deliberately not do

- Don't move any wealth or market maths out of `resolve_round`.
- Don't change `condenseRanked`'s defaults or `condense.test.ts`.
- Don't change the Sharpe formula, even if a new test disagrees with it —
  report first.
- Don't make `HostPresent` phone-responsive; it's a projector view.
- Don't add virtual scrolling, pagination, or a table library for Task 1.
- Don't add destructive keyboard shortcuts.
- Don't revert migration `0008_temp_allow_anon_host.sql` in this pass.
- Don't add dependencies.
