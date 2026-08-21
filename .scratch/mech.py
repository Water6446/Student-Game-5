import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("MECHANICS.md", [
(
'''[Counterfactuals & benchmark bots](#counterfactuals--benchmark-bots) ·
[Standings](#standings) · [CSV export](#csv-export)''',
'''[Counterfactuals & benchmark bots](#counterfactuals--benchmark-bots) ·
[Manager game](#manager-game) ·
[Standings](#standings) · [CSV export](#csv-export)'''
),
(
'''## Standings''',
'''## Manager game

The third game type. Each round is **one year** (25 by default). Students split
wealth across a risk-free asset and N **portfolio managers**, may lever up to
`leverage_cap`, and are scored against a passive **index they cannot buy**.

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

Code: [lib/game/manager.ts](lib/game/manager.ts), mirrored by
`supabase/migrations/0015_manager_resolve.sql`.

## Standings'''
),
])
