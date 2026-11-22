# Game Mechanics Reference

The master document for how every number in the game is computed — for explaining
to students, checking a value by hand, or finding the code that produces it.
UI copy stays short on purpose; the detail lives here.

**Contents:**
[Game flow](#game-flow) · [Payoffs](#payoffs) · [Market odds & scope](#market-odds--scope) ·
[Luck](#luck) · [Luck dispersion](#luck-dispersion-why-the-spread-is-so-big) ·
[Returns](#returns) · [Sharpe ratio](#sharpe-ratio) · [Correlation ρ](#correlation-ρ-portfolio) ·
[Counterfactuals & benchmark bots](#counterfactuals--benchmark-bots) ·
[Manager game](#manager-game) · [Paper trading](#paper-trading) ·
[Standings](#standings) · [Writing the numbers](#writing-the-numbers) ·
[CSV export](#csv-export)

---

## Game flow

Each round: **open** (students submit an allocation) → **locked** (no more
submissions) → **revealed** (server draws the market, computes wealth). All wealth
math runs in one place — the `resolve_round` SQL function
([supabase/migrations/0012_correlation.sql](supabase/migrations/0012_correlation.sql)) —
never on the client. Non-submitters default to all-safe.

- **Basic game**: one risky bet vs. a safe pot, one market outcome per round.
- **Portfolio game**: wealth split across N risky assets (each with its own
  market) plus a safe asset that can pay a per-round risk-free rate.

## Payoffs

A risky dollar is multiplied by the round outcome:

| Mode | GOOD | BAD |
|---|---|---|
| Moderate | ×1.1 | ×0.9 |
| Extreme | ×2 | ×0 (wiped out) |

Safe dollars are unchanged (basic) or grow by `risk_free_rate` per round
(portfolio). Portfolio assets can override payoff mode individually.

`result = safe·(1 + rf) + Σ riskyᵢ·multiplierᵢ`

## Market odds & scope

- `good_prob` (default 0.6) is the chance a market comes up GOOD. Portfolio
  assets can each override it (`assets[i].good_prob`).
- **Shared scope**: one draw for the whole class per round (per asset in
  portfolio). Everyone faces the same market — *systematic* risk.
- **Independent scope**: every player draws their own outcome(s) —
  *idiosyncratic* risk. This is the only scope where per-player luck varies.
- The host can retune `good_prob` mid-game (Adjust market odds). Luck benchmarks
  use the *current* odds, so early draws under old odds are approximated.
- **Hidden odds** (`show_odds_to_students` not on): while the game runs, the
  server keeps `good_prob` and every `assets[i].good_prob` out of the session
  row students can read, in `session_secrets` (0029). The host still sees and
  retunes them; `resolve_round` plays them; everyone sees them once the game
  finishes. Hiding them only in the UI would leave them in the network tab.

## Luck

**What it shows:** how a player's actual GOOD-draw rate compares to what the odds
predict — signed, so ± reads as "luckier/unluckier than expected."

```
delta = observed − expected
observed = (# GOOD draws) / (total draws)
expected = good_prob                    (basic)
         = mean of per-asset good_prob  (portfolio)
```

- A **draw** is one round (basic) or one round × one asset (portfolio). 25
  portfolio rounds with 4 assets = 100 draws.
- Example: 18/25 good at 60% odds → 72% − 60% = **+12% lucky**. Portfolio with
  2 of 4 assets up when the mean asset odds are 64% → 50% − 64% = **−14%**.
- Per-player luck chips only appear in **independent** scope (in shared scope
  everyone's draws are identical). In shared scope the class gets one line
  instead: "Markets: 7/10 good · +10% vs 60% expected."
- Luck updates live as rounds reveal (host control + projector), and appears on
  every final screen and in the CSV.
- Code: `luckStats`, `expectedGoodRate`, `classLuckSoFar` in
  [lib/game/results.ts](lib/game/results.ts).

## Luck dispersion (why the spread is so big)

Draw counts are binomial, so the standard deviation of the observed rate is:

```
σ = sqrt(p·(1−p)/n)
```

At n = 25 draws, p = 0.6 → σ ≈ **±9.8%**. About a third of students land outside
±10%, and a class of 25 will usually span ±20% or more. This is not a bug — it's
the sample-size lesson. The portfolio game shrinks it (n = rounds × assets:
100 draws → σ ≈ ±4.9%). The Luck card prints this ±1σ band.

## Returns

Both are computed from starting wealth `W₀` and final wealth `W`:

- **Total return** = `W/W₀ − 1`. Wiped out → −100%.
- **Per-round (geometric) return** = `(W/W₀)^(1/n) − 1` where n = revealed
  rounds. This is the constant per-round rate that compounds to the total:
  `(1+g)ⁿ = W/W₀`. Example: $100 → $121 over 2 rounds → +21% total, +10%/round.
- Code: `buildPlayerResults` in [lib/game/results.ts](lib/game/results.ts)
  (`totalReturn`, `perRoundReturn`).

## Sharpe ratio

**What it shows:** reward per unit of risk taken — did a player's return come
from skillful sizing or from swinging wildly?

```
rᵢ = wᵢ / wᵢ₋₁ − 1          (per-round returns from the wealth series)
Sharpe = (mean(rᵢ) − rf) / stdev(rᵢ)
```

- `rf` = `risk_free_rate` (portfolio) or 0 (basic — the safe pot pays nothing).
- Population standard deviation; **unannualized** (rounds are the natural
  period, so don't compare against real-market Sharpe values).
- **"—"** means undefined: fewer than 2 rounds, or zero variance (an all-safe
  player took no risk — there is no "per unit of risk").
- **Wipeout**: the −100% round is included, then the series stops (0/0 is
  undefined once wealth is $0). Example: +10% then −100% → mean −0.45,
  stdev 0.55 → Sharpe ≈ **−0.82**.
- A missed round reads as a 0% return (wealth carries forward) — so a late
  joiner's leading rounds count as 0% returns and pull their stdev down.
- Code: `perRoundReturns`, `sharpeRatio` in [lib/game/results.ts](lib/game/results.ts).

### Why the manager game's Sharpe values cluster

Expect a **narrow band** — roughly 0.45 to 0.60 across a class whose finals
range from +587% to +837%. That is not the metric failing; it is forced:

- **Sharpe is invariant to position size.** A player fully invested and a
  player half in cash hold the same mix, so their excess return and their
  standard deviation scale by the same factor and cancel. Identical Sharpe,
  very different finals. Pinned by a test in
  [lib/game/results.test.ts](lib/game/results.test.ts).
- **Leverage only lowers it**, because borrowing is charged at
  `risk_free_rate + borrow_spread`, above the rate the excess return is
  measured against.
- **One market path for the whole class.** Scope is forced to `shared`, so
  everyone's returns load on the same factor and everyone is anchored near that
  path's realised Sharpe. A 25-year realised Sharpe has a standard error of
  about `sqrt((1 + S²/2)/n)` ≈ 0.2, so the path's own value routinely lands
  well above the 0.31 the default parameters imply in expectation.

What is left to vary is **which managers a player held** — the only lever that
moves Sharpe once size cancels. That is the lesson: total return ranks players
by how much they bet, Sharpe ranks them by what they bet on.

## Correlation ρ (portfolio)

**What it teaches:** diversification buys independence, not headcount. Holding
4 assets at ρ = 1 is just 4 bets on one market.

**The knob:** advanced portfolio setup, 0 → 1 (default 0). Creation-time only.

**How draws work** (in `resolve_round`): per round (shared scope) or per player
per round (independent scope), draw one common uniform `U`. For each asset:

```
with probability √ρ:  use U            (the common market factor)
otherwise:            use a fresh uniform
outcome = GOOD iff (chosen uniform) < that asset's good_prob
```

Properties:
- Every asset's **marginal odds stay exactly `good_prob` at any ρ** — the luck
  benchmark and expected-count math need no adjustment.
- Pairwise correlation between equal-odds assets = **ρ** (both copy U with
  probability √ρ·√ρ).
- **ρ = 0**: fully independent. **ρ = 1**: all assets driven by one U — they
  move together every round, and Diversified finishes identical to One-basket.
- In independent scope, correlation applies *within* each player's assets,
  never across players.
- Sweeping ρ across sessions (0 → 0.5 → 1) traces out how the optimal risky
  share and growth rate fall as diversification stops working.

## Counterfactuals & benchmark bots

**Counterfactual cards** ("If everyone had picked one strategy…") replay each
player's *actual* draws under fixed strategies — only the strategy changes, so
they hold luck constant. Basic: all-safe / edge / 50-50 / all-risky (edge = the
Kelly-style share `max(2p−1, 0)`). Portfolio: all-safe / one-basket /
half-&-half / diversified. Shared scope shows exact finals (same draws for
everyone); independent scope shows the class average.

**Benchmark bots** (optional, on by default) are live players that mechanically
play those same strategies each round. When bots are in the game the strategy
cards show the bots' actual finals so the numbers match the standings exactly.
Code: [lib/game/counterfactual.ts](lib/game/counterfactual.ts),
[lib/game/portfolio.ts](lib/game/portfolio.ts), bot play in `resolve_round`.

## Manager game

The third game type. Each round is **one year** (25 by default). Students split
wealth across a risk-free asset, N **portfolio managers** and (by default) an
**index fund**, may lever up to `leverage_cap`, and are scored against the
passive **index** itself.

Returns here are **continuous normals**, not good/bad draws — none of the
payoff, luck or odds machinery above applies.

### Per year

```
r_market ~ Normal(market_mean, market_sd)              defaults: 0.08, 0.16

eps_i    ~ Normal(0, tracking_error_i)                 independent across
                                                       managers AND years
r_i      = beta_i * r_market + alpha_i + eps_i         GROSS

vol_i   ≈ sqrt((beta_i * market_sd)^2 + tracking_error_i^2)
```

Volatility has **two independent sources** — beta (market exposure) and tracking
error (idiosyncratic noise). They are kept separate everywhere in code; the
combined figure is informational only and drives the displayed vol label.

### Fees — exact order of operations

For manager `i` holding `a_i` dollars at the start of the year:

```
gross_i = a_i * r_i                     signed; can be negative
mgmt_i  = a_i * mgmt_fee_i              ALWAYS charged, including in down years
perf_i  = perf_fee_i * max(0, gross_i)  up years only; 0 for a flat-fee fund
end_i   = a_i + gross_i - mgmt_i - perf_i
```

The performance fee is charged on the **gross** return. Industry practice more
often charges it on the return net of the management fee; that is a one-line
change in both `resolveManagerYear` and the SQL, flagged in each.

**No high-water mark in v1.** A fund that loses 20% and then gains 20% charges a
performance fee on the recovery. That is a feature of the lesson, not an
omission.

### Leverage, cash and the wealth update

```
W = wealth at the start of the year
A = Σ a_i                              total allocated to managers
C = max(0, W - A)                      uninvested cash
B = max(0, A - W)                      borrowed

borrow_rate = risk_free_rate + borrow_spread     defaults: 0.03 + 0.05 = 0.08

W' = Σ end_i + C*(1 + risk_free_rate) - B*(1 + borrow_rate)
W' = max(0, W')                        floored at zero — busted
```

`borrow_rate` defaulting to exactly `market_mean` is deliberate: **borrowing to
buy beta has zero expected edge**, so only real alpha survives the carry. At 2×
into an 8% year: `2W(1.08) − W(1.08) = W(1.08)` — identical to being unlevered.
The bust threshold at 2× is a **−46%** year (`2W(1+r) = W(1.08)`).

`safe_amount` on the allocation row is `W − A` and goes **negative** when
levered; borrowed is `max(0, −safe_amount)`, derived rather than stored. Keeping
`risky_amount + safe_amount = W` is what lets every existing host surface work
unchanged.

### Non-submitters carry forward

The **opposite** of the other two games. A portfolio you did not touch this year
is one you still hold: the previous year's *shares* persist, rescaled to current
wealth. A player who has never allocated at all sits 100% in the risk-free asset.

### The skill shuffle

The **alpha vector only** is permuted across manager slots each session. Names,
one-liners, betas, tracking errors and fees stay pinned to their slot, so the
personalities survive and only *who is actually skilled* moves. The permutation
lives in `session_secrets` and is never sent to a client before the game ends.
It covers the host's managers only — never the index fund.

### The index fund

The passive option a student can actually buy. `config.index_fund` (default
**on**; the host can switch it off for the classic "index you cannot buy" game)
makes `create_session` append one more slot, **last**, **after** the shuffle:

```
beta = 1, alpha = 0, tracking_error = 0      so r = r_market exactly
mgmt_fee = 0.0005 (0.05%/yr), perf_fee = 0   charged through the normal fee path
```

- Appended rather than written into a preset so the shuffle can never hand it
  an active manager's alpha, and the hedge-fund preset (2-and-20 on every slot)
  cannot put it on 2-and-20.
- Its gross return each year **is** the market return; net of fees it trails
  the index by 0.05% a year. The Index bot still pays no fee at all, so a
  student 100% in the index fund finishes just behind the bot — by exactly the
  fee drag.
- Its prospectus history is drawn like every other track record (its own
  pre-game market path, net of the fee) and rolls forward the same way.
- `num_managers` counts it: the host picks 1–8 active managers, and the
  line-up can reach 9.
- Its public entry carries `index_fund: true` (and, like every public entry, no
  beta, alpha or tracking error). The reveal labels it "index fund".
- The permutation in `session_secrets` stays the length of the active line-up.

Code: `INDEX_FUND` in [lib/game/manager.ts](lib/game/manager.ts), mirrored by
`create_session` in `supabase/migrations/0026_index_fund.sql`.

### Track records

One 10-year path per manager, drawn against its **own** market path (this is
history from before the game started). All three headline figures are read off
that single path — never drawn independently, or the numbers would contradict
each other:

```
net_y   = beta*r_market_y + alpha + Normal(0, TE)      gross
net_y  := net_y - mgmt_fee - perf_fee * max(0, net_y)  net, as a prospectus reports

one_yr  = net_9
five_yr = (Π_{y=5..9} (1+net_y))^(1/5)  - 1
ten_yr  = (Π_{y=0..9} (1+net_y))^(1/10) - 1
vol_label from stdev(yearly): <10% Low, <20% Moderate, <30% High, else Very high
```

The label is computed from the **realised displayed path**, so it cannot be
inverted back into beta. Track records regenerate every session, and are
generated *after* the shuffle.

**The window rolls as the game runs.** Each revealed year's return joins the
track record and the oldest year drops off, so the card always shows the last
ten years and always ends with the year the class just watched; `one_yr`,
`five_yr`, `ten_yr` and the vol label are all recomputed off the new window. The
game years are netted with the same arithmetic the SQL uses
(`gross − mgmt_fee − perf_fee·max(gross, 0)`), so the two halves of the window
are measured identically. After ten played years the pre-game decade is gone and
the card is entirely in-game history — which is the honest version of the
lesson, not a leak: ten fresh years still cannot separate skill from luck, and a
student who wants the raw series already has `rounds.manager_returns`.

Rolling happens **client-side** from public rows; nothing is rewritten in
`sessions.config`. Code: `rollingProspectus`, `rollingProspectuses`, `netReturn`
in [lib/game/manager.ts](lib/game/manager.ts). The lobby surfaces (host lobby,
present mode, the student waiting screen) pass no game years and so show the
fund's original decade.

**Never displayed to students:** information ratio, Sharpe, beta, alpha or
tracking error for a manager. The host's setup form is the one exception.

### Secrecy, and two intentional leaks

`sessions.config` is readable by any session member, so it carries public data
only — names, fee terms, track records, the vol label. `beta`, `alpha` and
`tracking_error` live in **`session_secrets`**, a table with RLS on and *no
policies and no grants*: deny-all for every role including the host, reachable
only through `get_manager_truth()` (host any time; students once the session is
`finished`).

Two leaks are deliberate and should not be "fixed":

- The 10 yearly track-record numbers let a student estimate tracking error. They
  do **not** reveal alpha: the standard error of a 10-year alpha estimate at
  TE = 5% is 5%/√10 ≈ **1.6%**, which cannot separate +2% from −2%. That is the
  lesson, rendered as data.
- `rounds.manager_returns` accumulates in the open. After 25 years a regression
  against `rounds.market_return` gives an alpha standard error of 5%/√25 = **1%**
   — barely two sigma, after real econometrics on 25 observations. Also the lesson.

### Sharpe, luck and counterfactuals

Sharpe **applies** and is kept: a per-year return series is exactly what
`perRoundReturns` + `sharpeRatio` want, and `buildPlayerResults` already reads
`risk_free_rate` for the excess return. Luck chips, `classLuckSoFar` and
`expectedGoodRate` do **not** — there are no good/bad draws to be lucky in, so
the class line becomes the market's return instead.

The Sharpe is shown **while the game runs**, from year 2 (one return has no
spread): on the student's round screen, on their year result, and as `S` on
each row of the host's live standings. All of them use the same wealth series
and formula as the end screen (`managerRunningStats` / `buildPlayerResults`),
so the live figure and the final one are the same number.

**The year result appends its own year.** A student's running figures are
fetched when a year opens, so they cannot contain that year's result; the
reveal adds it (`managerRunningStats` over the fetched years plus this one)
before quoting "total" and "/yr over N yrs". The fetch always excludes the live
year, so a reload mid-reveal cannot count it twice.

The good/bad **counterfactual** does not apply either, and
`buildPlayerResults` leaves `counterfactual` **undefined** for a manager game
rather than degenerate. It replays market draws, and there are none: run it here
and all four strategies come back at the starting wealth. Leaving it undefined is
what stops a screen rendering four identical $100 cards. The manager game's
counterfactual is the **index**, compounded from `rounds.market_return`
(`indexSeries`), shown as the ghost line, the "if you had just held the index"
row on the student end screen, and the class-vs-index cards on the host summary.

Code: [lib/game/manager.ts](lib/game/manager.ts), mirrored by `resolve_round`
(written in `supabase/migrations/0015_manager_resolve.sql`; its current
definition is in `0029_hidden_odds.sql`, which changed only the odds merge and a
row lock).

## Paper trading

The Markets section's game (`game_type: 'trading'`; spec in
[docs/PAPER_TRADING.md](docs/PAPER_TRADING.md)). Students trade real historical
US stocks with the names, tickers and dates hidden until the end, or, until real
prices are licensed, a simulated market (below). The engine is
`_resolve_trading` (`supabase/migrations/0034_trading_engine.sql`), mirrored by
[lib/markets/trading/engine.ts](lib/markets/trading/engine.ts); a "golden"
session in both test suites pins the two to the same numbers.

### Which market: real history or simulated (0037)

`config.market_data` is `'historical'` or `'simulated'`. The host picks it on
the setup form when the database holds both (`get_market_data_options`);
absent, the server plays real history when any is loaded, else the simulated
market, and writes the choice into `config`. A simulated game has no era to
pick. Both run through the same engine, clock and screens.

The **simulated market** is generated once by migration 0037 into the same
reference tables, in the calendar years 2100–2134 so it never meets real
history (a real-history game cannot start there, and the loader replaces only
the years before 2100). Every draw is `md5(seed, what, where)`, not `random()`,
so every database holds the same market whatever its query plans.

- **Days.** Weekdays, closed Jan 1 and Dec 25.
- **The market factor** (the index fund's daily log return): calm spells drift
  11% a year with 13% volatility; stressed spells drift −45% with 35%. A stressed
  spell starts with probability 0.0012 a day (about once every 3 years) and ends
  with 0.03 (about 33 trading days). The seed (`sharpesim-137`) was picked for a
  plausible run: the index averages 9.6% a year (sd 15.8%), 9 down years in 34,
  worst −38%.
- **30 companies**, round-robin over the name pool's 11 sectors. Each day:
  `alpha/252 + beta × market − idio²/504 + idio/√252 × z`, plus an earnings jump
  (probability 1/63 a day, sd 5%). Beta 0.6–1.4, own volatility 15–35%, alpha
  −2% to +3% a year, start price $10–$100. Half pay a 1.5–4% yield in quarterly
  dividends (Feb, May, Aug, Nov), which come off the price on the ex-day.
- **Delistings.** One cash acquisition at a 25% premium (2116) and one
  bankruptcy worth nothing (2125), after a year-long slide.
- **Bars.** Open = previous close × a small gap; high and low spread from
  open/close by the company's own volatility.
- **T-bill rate.** Starts at 4% and mean-reverts toward 4.5% (0.2% of the gap
  a day, 0.06% daily noise), held within 0.1%–12%.
- **Universe and headlines.** A universe anchor every 5 years ranks the living
  companies by size; one headline a month is worded from the index's move that
  month (the bands of `generatedHeadline`).

At the end a simulated game reveals no era or companies: the student sees how
each company did under its game name, and their trades in game time ("Year 3 ·
Mar 14", `gameCalendar` in reveal.ts); the projector's second finale screen is
"The companies"; the host's real-dates panel is hidden.

### The window and the clock

- **Era.** A session starts on the first trading day of a January (Year 1) and
  shows 5 years of real history before it, so the earliest start is 1967. The
  host picks the year or the server draws one at random from the years with
  enough data for the session's length and size. The year is stored only in
  `market_session_secrets`.
- **Rounds.** Round k covers 12, 6, 3 or 1 calendar months, or 7 days, counted
  from Jan 1 of Year 1 (`_trading_period_range`, mirrored by `periodRange` in
  [lib/markets/clock.ts](lib/markets/clock.ts)). 25 quarterly rounds = 6.25 years.
- **Game dates.** Every date leaves the server as `[game_day, year, month, day]`:
  `game_day` counts calendar days from Jan 1 of Year 1, and `year` is "Year N"
  with no Year 0 (the year before Year 1 is Year −1). Students read "Year 3 ·
  Mar 14". Two small deliberate leaks: Feb 29 and the weekday pattern of trading
  days narrow the year a little. Neither gives a future price.
- **Visibility.** Every read (`get_market_snapshot`, `get_price_history`,
  `get_period_replay`) stops at the last revealed day: the end of the latest
  revealed round, or the last trading day before Year 1 in the lobby. The host
  is held to the same line.
- **Trading window.** A round opens with `rounds.closes_at` = now + 90 s (host
  sets 30–600 s; `extend_round` adds time). Orders and cancels are refused after
  it; the host then locks and reveals.

### What students see

- **Companies.** The ~25 largest by market cap at the session's 5-year anchor
  (`data/universe/top_by_year.csv`), skipping any without 5 years of history or
  data through the window (a delisting inside the window is fine). Each gets a
  fake name and ticker from its sector's pool and a random slot number, so slot
  order does not leak size. Slot 0 is the index fund.
- **Prices** are split-adjusted, not dividend-adjusted, and rescaled per session
  so each start price lands between $15 and $250 (the index fund $40–$160).
  Dividends and spin-off distributions are scaled the same way.

### Placing an order (place_order; mirrored by [lib/markets/trading/orders.ts](lib/markets/trading/orders.ts))

Marks are the last revealed close p. Equity `E = cash + LMV − SMV`, where cash is
one signed balance (negative = margin loan; short-sale proceeds sit in it).

```
im   = initial_margin (0.5) when margin is on, else 1 (fully cash-backed)
IR   = im × (LMV + SMV)                       requirement of what is held
free = E − IR − (reserves of open orders)

an order that ADDS exposure (buy, sell short) reserves
     qty × ref × (im + spread/2) + commission
ref  = p (market), the limit (limit buy), max(stop, p) (stop buy),
       max(limit, p) (limit or stop-limit short)
accepted only if free ≥ that reserve
```

- **Buying power** shown to students is `free / (im + spread/2)`, minus the
  commission: about 2× equity with margin, 1× without. An open order keeps its
  reserve until it fills, is cancelled or expires, so the same buying power
  cannot be spent twice.
- **Closing orders** (sell a long, buy to cover a short) reserve nothing. They
  are capped at the shares held minus shares already in open closing orders, so
  a protective stop can only be placed once the position exists (the round
  after the opening order fills). A buy on a short position, or a short on a
  long one, is refused: close first.
- **Dollar orders** are market orders only, converted to shares at
  `p × (1 ± spread/2)`. Fractional shares to 6 decimals.
- **Time in force:** "this round only" or "good till cancelled"; market orders
  are always this round.
- **Frozen accounts** (value at or below zero) may only close positions.
- Every fill is re-checked against the account when the engine runs it.

Defaults: $100,000, 0.10% spread, $0 commission, margin on (50% initial, 25%
long / 30% short maintenance), shorting on (0.3%/yr borrow fee), margin loans
at T-bill + 5%. All host-adjustable (`_trading_config_defaults`, mirrored by
[lib/markets/trading/config.ts](lib/markets/trading/config.ts)).

### The student's screens (display only; [lib/markets/trading/view.ts](lib/markets/trading/view.ts))

- **Change** on the market board is over the last revealed period, or over the
  past year before Year 1. **52-week range** is the high and low of the past
  365 days; **dividend yield** is the past year's dividends over the last price.
- **The ticket's estimate** fills at `p × (1 ± spread/2)` for a market order,
  `stop × (1 ± spread/2)` for a stop and the limit for a limit or stop-limit:
  what the order would cost if it filled at once. "Buying power after" is the
  place_order mirror with this order's reserve added, so the ticket refuses
  exactly what the server would, in the server's words.
- **Positions** show value and unrealized gain at the last close; a short's value
  is negative. The account value shown is always the server's, never summed in
  the browser.
- **Friction knobs** decide how much each order costs in taps, time and
  attention; see "Friction and research" below.
- **The behaviour log** (research): screen and stock views, chart ranges and
  scrubs, every ticket step (open, changes, review, back, submit, abandon), order
  results, the round phases each student saw, reveal views, tab visibility.
  Batches of at most 50 go to `log_behavior_events` every 10 s and when the tab
  hides; the server caps each payload at 2 KB and each player at 30 calls and
  600 events a minute, and stamps its own time and round. Each placed order also
  carries its decision context (what the student could see: value, buying power,
  position, last price and change, rank, seconds left, time spent in the ticket).
  With research mode on and no consent, nothing is logged.

### Friction and research (0035; [lib/research/](lib/research/))

Friction is the experiment's independent variable, so every knob is a named
switch (`lib/research/friction.ts`, mirrored by `_friction_preset` and
`_friction_knobs`), never an ad-hoc condition in a screen.

| knob | low | standard | high | what it does |
|---|---|---|---|---|
| `one_tap_buy` | on | off | off | a Buy button on every market row (and the index fund) places a market buy for 1%, 5% or 10% of the starting cash, with no ticket |
| `amount_chips` | on | on | off | 25% / 50% / Max (All when closing) in the ticket |
| `review_step` | off | on | on | a review screen between the ticket and Place order |
| `typed_confirmation` | off | off | on | the amount typed again on the review screen; it brings the review screen even when `review_step` is off |
| `risk_disclosure` | off | off | on | a warning to accept before a short sale, or a buy whose estimated cost is more than the cash (a margin buy) |
| `cooldown_seconds` | 0 | 0 | 30 | seconds between orders, counted from the last placed order |
| `celebrate_fills` | on | off | off | confetti on a winning period with fills |
| `show_movers` | on | on | off | the biggest risers and fallers on the market board |
| `show_class_popular` | on | off | off | what the class is buying this round, live |

- **Overrides.** `config.friction_overrides` sets single knobs on top of the
  preset (the setup form's "Customize each setting"; it stores only the knobs
  that differ). Cooldown is a whole number of seconds, 0–300.
- **Fixed at creation.** A trigger refuses any change to the friction or
  research settings once the session exists; a changed treatment mid-game would
  break the comparison.
- **Per-player arms** (`friction_assignment: 'per_player'`, built and tested, not
  offered in the form yet): each student is assigned one of `friction_arms`
  (default low and high) when they join, to the arm with the fewest students so
  far, ties broken at random (permuted blocks). The assignment lives in
  `player_conditions`, which no client can read; a student gets only the
  resolved knobs (`get_my_conditions`), never the arm's name. The host sees
  students per arm. The projector then follows the standard preset, so no arm
  sees another's treatment on the shared screen. Overrides apply to every arm.
- **The cooldown is a rule:** `place_order` refuses an order sooner than
  `cooldown_seconds` after the last one ("wait N more seconds"), except a retry
  of the same order (same `client_ref`). The ticket and the one-tap Buy only
  count it down.
- **The other steps are screens,** each logged: `confirm_shown` /
  `confirm_accepted` / `confirm_declined`, `risk_shown` / `risk_accepted` /
  `risk_declined`, `cooldown_blocked`, `quick_buy`, `celebration_shown`. The
  order's decision context adds `confirm_ms`, `risk` and `risk_ms`, and a
  one-tap order says `from: "quick_buy"`.

**Research mode** (`config.research_mode`): each student sees a consent screen
before play (both answers look the same and both lead into the game; wording in
`lib/research/consent.ts`, a draft until the study's approval). Until they agree,
`log_behavior_events` stores nothing and `place_order` drops the decision
context. Changing the answer to no deletes their behaviour log and every
order's context. Outside research mode every student is logged.

**The export** (`export_research_data`, host only): one call for the tables and
pages of 5,000 behaviour events. Students appear only as `P` + 8 hex characters
(md5 of session and player), with their arm, knobs, final value, drawdown and
Sharpe; no names, accounts or the host's label. In research mode only students
who agreed are in it at all. Rounds carry their phase times (opened, closes,
locked, revealed) and every instrument's close at the end of each revealed
period, so the metrics below are computed from the export alone.

**Metrics** ([lib/research/metrics.ts](lib/research/metrics.ts)), per student:

- **Activity:** orders and fills per round played; annualized turnover (as on
  the student's finished screen); final return.
- **The ticket:** median time from opening the ticket to Place (`ticket_ms`) and
  on the review screen (`review_ms`); abandonment = tickets closed without an
  order ÷ tickets opened.
- **Holdings at each round's end**, rebuilt from fills at average cost and
  valued at the export's closes: concentration as the Herfindahl index of the
  companies' absolute values (the index fund excluded), the index fund's share of
  gross holdings, leverage = gross holdings ÷ account value, and the share of
  rounds ending with a short.
- **Selling after a loss / a gain:** of the rounds after one where the account
  lost (did not lose) value, the share in which the student placed a sell order.
- **Chasing:** the share of buying (dollars) that went into the previous
  round's three biggest risers.
- **Disposition (Odean):** on each round with a sale, every company held at the
  start is a gain or a loss against its average cost at the previous close;
  PGR = gains sold ÷ gains held, PLR = losses sold ÷ losses held, disposition =
  PGR − PLR (positive: winners sold sooner).
- **Doubling down:** of the companies bought more of while held at a gain or
  a loss (against average cost at the previous close), the share held at a loss.

A ratio with no cases is left empty, not zero. The "By friction condition" file
averages each metric over the students it is defined for.

### The host and the projector (display only; [lib/markets/trading/host.ts](lib/markets/trading/host.ts))

- **Standings** are the server's (`get_trading_standings`): rank by account
  value, ties share a place.
- **Change last period** is `resulting_wealth − (risky_amount + safe_amount)`
  from the latest revealed period's `allocations` rows: the account's value at
  the period's end minus its value at the start. The projector shows it as a
  percentage of the start value.
- **Places moved** compares each player's rank by value at the end of the
  latest period with their rank at its start, among the players who played it
  (a late joiner starts at the starting cash). Nothing is shown for the first
  period, where everyone started level.
- **"N / M have placed an order"** is `get_class_activity`: students with at
  least one order this round (open, filled or cancelled), out of the active
  students. The host's screen polls it every 3 s while trading is open.
- **The index fund line** on the class wealth chart compounds each period's
  `index_return` from the starting cash.
- **What the projector never shows:** any student's orders or names on the
  turnover chart, the real era or companies before the game ends (the host's
  "Show real dates" is on the control screen only), or "most bought" unless
  the students' own friction knob shows it to them. Its finale, once the game
  is over, steps through the podium, the real era and companies, and the
  class's turnover against return. Confetti on
  the projector's reveal follows the same knob as the students' confetti. With
  per-player arms both follow the standard preset (off).
- **The clock:** when it runs out the server refuses new orders; nothing
  reveals until the host presses the button. Adding 30 s after it ran out
  reopens trading from now.
- **Run again** (dashboard) creates a new session with the same settings and a
  new hidden era: the era lives only in the server's secrets, so even a
  host-picked Year 1 is not carried over. The universe size asked for is the
  one the old game actually got.

### Resolving a period (the engine)

Each account resolves alone: there is no order book, so no student's trade
moves a price another student sees. In this order:

1. **Market orders** fill before day 1 at the close students saw, `p × (1 ±
   spread/2)` (buys and covers pay up, sells and shorts receive less), in the
   order they were placed. A dollar order becomes `dollars ÷ fill price` shares.
2. **Each trading day:**
   - **At the open:** dividends and distributions (a spin-off's value, paid as
     cash) go to whoever held the shares overnight: `shares × amount`, so a
     short pays it. An ex-date on a closed day counts at the next open.
   - **Intraday,** resting orders in the order they were placed, against the
     day's bar (a close-only bar has open = high = low = close):

     | order | fills when | at |
     |---|---|---|
     | limit buy / cover | low ≤ limit | min(open, limit) |
     | limit sell / short | high ≥ limit | max(open, limit) |
     | stop buy / cover | high ≥ stop | max(open, stop) × (1 + spread/2) |
     | stop sell / short | low ≤ stop | min(open, stop) × (1 − spread/2) |
     | stop-limit | the stop is hit; then as a limit | the trigger price if inside the limit, else the limit if reached |

     A gap through a stop fills at the **open**, the way a real stop behaves in a
     crash. A stop-limit that triggers but cannot fill stays open as a limit
     (`triggered`). No partial fills.
   - **Every fill is re-checked** when it happens: shares still held, long and
     short kept apart, a frozen account opens nothing, and an opening fill must
     leave `equity ≥ im × (long + short value)` at the previous close.
     Otherwise the order is **rejected** with a reason.
   - **At the close,** in this order:
     1. **delistings** settle: bankruptcy at the recovery value (usually $0; a
        short keeps the whole fall), a cash acquisition at the deal price, a
        stock merger at the final price (cashed out in v1); open orders on the
        company are cancelled;
     2. **interest**, per calendar day since the last trading day, at the T-bill
        rate in force: positive interest on `cash − short value` (cash that backs
        a short earns nothing), margin interest at T-bill + `borrow_spread` on a
        negative cash balance, and `borrow_fee` a year on the value of shorts;
     3. **maintenance:** if `equity < 25% × long value + 30% × short value`, the
        largest position (by value) is closed at the close ± half the spread, and
        the check repeats until the account complies or holds nothing; the
        ledger notes each forced sale;
     4. the day's **account value** is recorded (the student's chart), with the
        running peak and the largest drop from it.
3. Orders for "this round only" that are still open **expire**; good-till-
   cancelled ones carry into the next round with their reserve.

Rounding is Postgres's numeric rounding throughout: prices to 4 decimals,
shares and dollars to 6. **An account at or below $0** (a gap past the margin
call, or a short that runs away) is shown negative and **frozen**: it can
only close positions.

### The score and its companions

- **Account value** (net liquidation value) = cash + long value − short value at
  the last revealed close. It ranks the class and is written to
  `players.current_wealth` by `resolve_round` alone. Each round also writes an
  `allocations` row (exposure after the market orders, and the resulting value)
  so the existing wealth charts work unchanged.
- **Sharpe (annualized):** per-round returns `V_k / V_(k−1) − 1` (floored at
  −100%, and stopping once an account is wiped out), minus that period's T-bill
  return compounded daily the way cash accrues (`rf_return`), averaged and
  divided by their population standard deviation, times √(rounds per year):
  1, 2, 4, 12 or 52. Undefined ("—") with fewer than two rounds or a standard
  deviation under 0.0001% (an all-cash account takes no risk). Mirrored by
  `annualizedSharpe` in [lib/markets/trading/stats.ts](lib/markets/trading/stats.ts).
  Unlike the classroom games' Sharpe this one is annualized, because rounds
  here are real calendar time.
- **Max drawdown:** the largest fall from a running peak of the daily account
  value, capped at 100%.
- **Turnover** (for the end-of-game reveal): half the dollars traded, over the
  average account value, per year of market time. 1.0 means the whole
  portfolio was replaced once a year. Exactly: `Σ traded ÷ 2 ÷ mean(start
  value of each round, where > 0) ÷ (rounds ÷ rounds per year)`, where `traded`
  is the round's filled dollars, buys and sells both (`_trading_turnover` in
  0036, mirrored by `annualTurnover`). 0 with no rounds.

### The end-of-game reveal (0036; [lib/markets/trading/reveal.ts](lib/markets/trading/reveal.ts))

`get_trading_reveal` opens only once the session is `finished`, to its host and
its students (an outsider, or anyone mid-game, is refused). It returns:

- **The era:** Year 1, the window's first and last real dates, and the last
  date actually played (a game finished early names the years it played).
- **The companies:** each fake name and ticker beside the real ones (and the
  company's name today if it changed), and its price change over the game:
  the last close before Year 1 to the last close played.
- **The periods:** each played round's real first and last trading days, the
  index fund's return, and the top two headlines of each of its months (the
  timeline shows the top one per month).
- **Your fills** (students only; the host gets none): each one's real date,
  which is Jan 1 of Year 1 plus its `game_day`. The timeline writes them by
  dollar amount ("Bought $5,000 of …"), not shares, because per-share prices
  were rescaled for the game and would mislead beside a real name.
- **The class:** account value, return, turnover, Sharpe, drawdown and fill
  count for every student, ordered by value. A **student sees no names and no
  ids**, only their own row marked (`is_me`) and named; the host sees every
  name. The projector draws dots only.

**Against the index fund.** "Buy and hold" is the index fund's period returns
compounded over the rounds played, the return a student would have had by
putting everything in the index fund on day one and never trading. The
student's line is "You beat / trailed buying and holding the index fund by X
points" (or "matched" within 0.05 points).

**The Barber & Odean takeaway.** Barber and Odean (2000) found the fifth of
households that traded most earned 11.4% a year against the market's 17.9%.
The class version sorts students by turnover and compares the mean return of
the busiest group with the quietest: a **fifth** each with 10 or more students
(n/5 rounded, at least 1), a **half** each (⌊n/2⌋) with 4 to 9. The verdict is "Like
Barber and Odean's households, the busiest traders earned less" when the
busiest group trails by more than 0.05 points, "Unlike …" when it leads by more,
and "made no difference" between. Fewer than 4 students, or everyone on the
same turnover, says there is nothing to compare. One class is a small sample;
the line says what happened this time, not that it always will.

**The host's CSV** (`revealCsv`): one row per student by final value (ties
share a rank) with name, final value, return, turnover, Sharpe, drawdown and
trades, through `toCsv`, which defuses names a spreadsheet would read as a
formula.

## Standings

- **Ranking**: final wealth, descending; competition ranking for ties (1, 2, 2, 4).
- **Bust ordering**: players tied at $0 order by *when* they busted — the first
  to bust sits last (`bustRoundByPlayer` + `compareStandings` in results.ts).
  (Student-screen tie order still comes from the server; bust-order there needs
  a `get_leaderboard` tweak — deferred.)
- **Condensation**: lists over 10 participants show the **top 5**, a
  "+N more ▾" expander, and the **bottom 3**. The student's own row always
  stays visible on their screen. Rank numbers never renumber across the gap.
  Code: [lib/game/condense.ts](lib/game/condense.ts).
- **Bot toggle**: hides benchmark bots from standings, luck, and the chart on
  every host surface (synced across tabs via localStorage). Hiding bots
  re-ranks the list; the strategy cards and the CSV always keep everyone.

## Writing the numbers

Presentation rules that a beta host tripped over, kept here so they do not drift
back:

- **Cents are all-or-nothing.** `money` prints `$100` or `$33.60`, never
  `$33.6` — a lone tenth reads as truncation and invites doubt about the
  arithmetic behind it.
- **A cost is written as a cost.** Fees and borrowing charges render through
  `cost` as `$2.56`, never `−$2.56`; the loss colour carries the direction. A
  minus sign in front of a fee reads as a rebate, and did.
- **Fees stay quiet until the end.** That fees eat investor return is part of
  the reveal, so students get each year's fee as one line of their year result
  ("Fees this year") and the game-long total once, on the end screen. There is
  no running fee counter on a student screen — a total climbing beside their
  wealth gave the punchline away, and a total next to a yearly figure was read
  as one being subtracted from the other. The host keeps a class total
  ("Class fees so far") and a per-player figure on the standings.
- **Fees live in the description.** A prospectus card ends its strategy line
  with the terms in words — "Fee: 1% of your money a year." — the way a real
  prospectus discloses them, not as a badge beside the fund's name.
- **Never orphan a number.** Every figure says what it is: the host's
  allocation rows read `$67.52 risky / $22.52 safe` rather than a bare pair
  joined by a middot.
- **A levered position says "borrowed".** `safe_amount` goes negative under
  leverage; no surface shows that raw — they show `$102.09 borrowed`.
- **Match the units you are asking to be compared.** Wherever the index or
  market is quoted as a percentage, the player figures beside it carry a
  percentage too (`returnSummary` / `returnSummaryByPlayer` in
  [lib/game/results.ts](lib/game/results.ts)). Dollars alone next to an index
  percentage is the comparison the manager game exists to teach, made
  impossible to do by eye.

## CSV export

One row per player: rank, name, final wealth, good/total draws, good %, avg bet,
**total return %**, **per-round %**, **Sharpe**, **luck vs expected %**, then
per-round wealth and risk-% columns. Always includes bots regardless of the
toggle. Blank cells = undefined (e.g. all-safe Sharpe).
Code: `buildResultsCsv` in [lib/game/results.ts](lib/game/results.ts).
