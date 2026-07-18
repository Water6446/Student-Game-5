# Game Mechanics Reference

The master document for how every number in the game is computed — for explaining
to students, checking a value by hand, or finding the code that produces it.
UI copy stays short on purpose; the detail lives here.

**Contents:**
[Game flow](#game-flow) · [Payoffs](#payoffs) · [Market odds & scope](#market-odds--scope) ·
[Luck](#luck) · [Luck dispersion](#luck-dispersion-why-the-spread-is-so-big) ·
[Returns](#returns) · [Sharpe ratio](#sharpe-ratio) · [Correlation ρ](#correlation-ρ-portfolio) ·
[Counterfactuals & benchmark bots](#counterfactuals--benchmark-bots) ·
[Standings](#standings) · [CSV export](#csv-export)

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
- A missed round reads as a 0% return (wealth carries forward).
- Code: `perRoundReturns`, `sharpeRatio` in [lib/game/results.ts](lib/game/results.ts).

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

## CSV export

One row per player: rank, name, final wealth, good/total draws, good %, avg bet,
**total return %**, **per-round %**, **Sharpe**, **luck vs expected %**, then
per-round wealth and risk-% columns. Always includes bots regardless of the
toggle. Blank cells = undefined (e.g. all-safe Sharpe).
Code: `buildResultsCsv` in [lib/game/results.ts](lib/game/results.ts).
