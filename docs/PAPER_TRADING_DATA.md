# Paper trading: market data

Sources, terms, the development boundary, what the dev data can and cannot do,
and what a licensed source must provide before real classes use the game.
Companion to [PAPER_TRADING.md](./PAPER_TRADING.md) (the build spec) and
[../MECHANICS.md](../MECHANICS.md) (how the numbers are used).

Terms below were read on **2026-11-19**. Re-read them before relying on any of
this; vendors change terms.

---

## 1. The rule

**Every source in use today is development-only.** Its data may be fetched to a
developer's machine and loaded into the **separate dev Supabase project**. It
must never be loaded into the production project (the one behind
www.sharpesim.com), never committed, and never shown to anyone outside
development. Until a licensed source replaces it, production plays only the
simulated market that migration 0037 generates (ours, so nothing to license;
MECHANICS.md "Which market"), and `create_trading_session` finds no real
history there.

Every session records its source in `config.data_source`, and host screens show
a "Development data" banner while a dev source is active.

| Committed (ours) | Never committed (vendor) |
| --- | --- |
| `lib/markets/data/*` (adapter interface, normalizer, rules, tests) | `data/raw/` (responses as fetched) |
| `scripts/market-data/*` (importer, adapters, measurement) | `data/normalized/` (internal format, manifest, size report) |
| `data/universe/top_by_year.csv`, `data/names/name_pool.json`, `data/headlines/market_headlines.json` | anything else downloaded |
| synthetic fixtures (`lib/markets/data/fixtures.ts`) | |

Both vendor folders are in `.gitignore`.

---

## 2. Sources

| Use | Source | Licence / terms as read | Status |
| --- | --- | --- | --- |
| Stock prices, dividends, splits | Yahoo Finance, through the unofficial `yahoo-finance2` package (4.0.5, MIT; pinned) | No official API and no data licence. Yahoo's API terms bar redistribution, commercial use and storage beyond 24 hours. The package's own README says it is unofficial and comes with no guarantees. | **Dev only** |
| Cash interest, margin base rate | 3-month Treasury bill, secondary market, discount basis (**DTB3**), fetched from FRED's CSV endpoint | The series is "Public Domain: Citation Requested" (source: Federal Reserve Board, H.15). **But FRED's own terms prohibit storing, caching, archiving or building a database from FRED content**, which is what an importer does. | **Dev only via FRED.** For production, take H.15 straight from the Federal Reserve Board's Data Download Program: the Board's site says its information is in the public domain unless marked otherwise, with credit requested. One new `RateSource` adapter. |
| Index fund | Ken French data library, daily Fama/French factors (Mkt-RF + RF) | The page carries a copyright line for Fama and French, states no terms of use, and says the US returns are built from **CRSP**, whose licence does not allow public display. | **Dev only.** Production needs the licensed source's own market index. |

Citation for the rate series, if it is ever displayed:
Board of Governors of the Federal Reserve System (US), 3-Month Treasury Bill
Secondary Market Rate, Discount Basis [DTB3].

### What the dev data actually looks like (checked 2026-11-19)

- **Split-adjusted, dividends separate.** Yahoo's `chart()` OHLC are
  split-adjusted (AAPL around its 2020 4:1 split), and its dividend amounts are
  split-adjusted too (KO's 2012 2:1 split: $0.255 a quarter, not $0.51).
  `adjclose` also folds dividends in; the game pays dividends as cash, so it is
  ignored.
- **Spot checks against history:** the index's 1987-10-19 return is −17.4% and
  2020-03-16 is −12.0%; DTB3 is 14.67% in May 1981; IBM falls 23.5% on
  1987-10-19.
- **Coverage.** Daily history begins 1962-01-02 for about two dozen of the
  curated symbols (IBM, GE, XOM, KO, PG, MRK, JNJ, MMM, CAT, BA, …); many others
  begin 1972-06-01, and later listings begin at their IPO. DTB3 runs from
  1954-01-04; the index from 1926-07-01.
- **Survivors only.** Yahoo returns nothing at all for a delisted symbol (a
  probe of Eastman Kodak's old ticker: "No data found"). It also reuses tickers:
  Yahoo `T` is SBC's history, not the pre-1984 AT&T. The curated list maps a row
  to a Yahoo symbol only when that symbol's history is the same company.
- **Spin-offs are not adjusted.** A spin-off shows as an unexplained overnight
  drop: Altria (MO) falls to 0.30× on 2008-03-31 when it spun off Philip Morris
  International. A holder in the game would lose that value with nothing in
  return. Smaller spin-offs (GE, 3M, J&J, Merck and others) do the same below the
  normalizer's ×3 flag. See §5.
- **Berkshire Hathaway** uses `BRK-A` (history from 1980) rather than `BRK-B`
  (from 1996). It pays no dividends. Bars are stored as 4-byte floats, so a
  $700,000 price carries about 4 cents of rounding before the per-session
  rescale, which is harmless.
- **DTB3 is a discount-basis rate.** It is used as published (a few basis points
  below the bond-equivalent yield).

---

## 3. Pipeline

```
vendor ──adapter──▶ SourceSecurity ──normalizeSecurity()──▶ NormalizedSecurity ──loader──▶ dev DB
          (scripts/market-data/sources/*)   (lib/markets/data/normalize.ts)      (Phase 2)
```

- `lib/markets/data/price-source.ts`: the `PriceSource`, `RateSource` and
  `IndexSource` interfaces. A licensed vendor is one new adapter plus a
  re-import; nothing downstream knows which vendor it was.
- Internal format: dates are **day keys** (calendar days since 1962-01-01),
  prices split-adjusted and not dividend-adjusted, dividends as cash events per
  adjusted share, close-only bars flagged, delistings as
  `{day, type: bankruptcy | cash_acquisition | stock_merger, value}`.
- The index fund is built from daily total returns as a close-only security
  with its 0.05%/yr fee spread over trading days (`indexFundFromReturns`).

```bash
npx tsx scripts/market-data/import.ts --symbols IBM,KO,GE   # a few symbols
npx tsx scripts/market-data/import.ts --universe            # every Yahoo symbol in the curated list
npx tsx scripts/market-data/import.ts --rates --index       # DTB3 and the market index
npx tsx scripts/market-data/import.ts --report              # eligibility only, no fetching
npx tsx scripts/market-data/import.ts --source fixture --symbols SYN0,SYNBK,SYNCA,SYNSM
npx tsx scripts/market-data/measure.ts                      # size of each storage layout
```

The importer caches raw responses (`--refresh` to refetch), waits 400 ms between
Yahoo calls, writes `data/normalized/manifest.json` with every warning, prints a
name check (vendor name vs curated name) and the eligibility report below.

**Loading** (`scripts/market-data/load.ts`) writes the reference tables of
migration 0031 in one transaction: instruments upserted by key (ids stay fixed,
because sessions reference them), bars as one row per instrument-year,
dividends/splits/distributions, the trading calendar (every day any loaded
history traded), the T-bill series, the universe list with each era's name and
ticker, the headlines, and the name pool. It refuses the production project
while any row is dev-only. `--pglite` loads into an in-process Postgres with
every migration and smoke-tests the trading RPCs instead, then plays a whole
25-quarter session for three students on the real data. On 2026-11-20 that was
90 instruments in about 10 s, 23 MB of market tables (the index runs from
1926), every read RPC under 260 ms, and all 25 rounds resolved in 3.3 s (the
slowest 187 ms). Setup steps: DEPLOYMENT.md Part D.

---

## 4. Size and speed (measured 2026-11-19)

Measured in PGlite (real Postgres) with 6 real and 20 synthetic instruments
(441,535 bars, 1,708 instrument-years), projected to 150 instruments:

| Layout | Per bar | 150 × 45 yrs | 150 × 65 yrs | Of 0.5 GB |
| --- | --- | --- | --- | --- |
| A: row per instrument-day (OHLC `real`) | 82.8 B | 138 MB | 199 MB | 40% |
| **B: row per instrument-year, `real[]` OHLC + day offsets** | **21.4 B** | **36 MB** | **51 MB** | **10%** |
| B2: B aligned to a shared calendar | 22.7 B | 38 MB | 55 MB | 11% |
| C: close only, row per day (floor for any row layout) | 66.9 B | 111 MB | 161 MB | 32% |

**Decision: layout B.** A year-row is about 5.4 KB, there are about 10,000 of
them for the whole dataset, and a period resolve reads at most two per
instrument: 26 instruments × one year took **23 ms** in PGlite against 95 ms for
layout A. Free-tier Supabase allows 0.5 GB per active project (Supabase
changelog, 2025); the existing game tables are a few MB.

Time budget for the resolver: Supabase's default `statement_timeout` is **8 s**
for the `authenticated` role (Supabase timeouts guide), and `resolve_round` runs
under it. Phase 3 carries a timing test.

---

## 5. Known gaps in the dev data, and what each needs

| Gap | Effect in dev | Needed before real classes |
| --- | --- | --- |
| **Survivorship.** No delisted companies. | Early windows are short of companies and nothing in them goes bankrupt or gets acquired. The delisting paths are built and tested with synthetic fixtures only. | Licensed source **with delisted securities**. |
| **Early coverage.** | Windows starting 1967–1985 have 13–23 eligible companies of the 25 wanted (report below); the random era draws only from years with 25. | Licensed source back to 1962. |
| **Spin-offs unadjusted.** | Fixed for the cases in `data/universe/distributions.csv`: a `distribution` corporate action pays the spun-off shares' value as cash on the ex-date (ratio × the child's first close, adjusted for both sides' later splits; `lib/markets/data/distributions.ts`). MO 2008 comes out at $50.58 a share. T→WBD (2022) cannot be valued: Yahoo now holds a single 2026 bar for WBD. Older spin-offs are not listed yet. | Distributions with their cash value from the licensed source. |
| **No shares outstanding or market cap.** | Universe ranks come from the curated list; the stock page cannot show market cap; the index fallback would be equal-weight. | Shares outstanding or market cap history. |
| **Rates via FRED.** | Fine for local development. | H.15 from the Federal Reserve Board directly (public domain). |

### Dev eligibility (5 years of history, 25 quarterly rounds)

```
start  eligible   skipped
1967   15/25      no history 28, starts too late 7
1970   13/25      no history 26, starts too late 11
1975   14/25      no history 25, starts too late 11
1980   22/25      no history 25, starts too late 3
1985   23/25      no history 22, starts too late 5
1990   25/25      no history 19
1995+  25/25
```

"No history" is a curated company Yahoo has no symbol for (almost always one
that was later delisted); "starts too late" is a symbol whose Yahoo history
begins after the first pre-window year.

---

## 6. Hard requirements for the licensed source

1. Daily OHLC for US common stocks from **1962**, split-adjusted or with split
   factors to adjust them.
2. Cash dividends with ex-dates, and **other distributions (spin-offs,
   special dividends) with their cash value**.
3. Splits.
4. **Delisted securities**, with the delisting date, the reason (bankruptcy,
   cash acquisition, stock merger, other) and the final price or deal terms.
5. Shares outstanding or market cap history, to rank the universe by size.
6. A total-return market index series.
7. A licence that **allows display to students on a public website**, and
   storage in our database.

---

## 7. Curated files

All three are drafts for Max to review; `lib/markets/data/curated.test.ts`
checks their shape on every `npm test`.

- `data/universe/top_by_year.csv`: the ~50 largest US companies by market cap at
  each 5-year anchor, 1965–2025 (650 rows), compiled from general knowledge of
  public historical rankings. **Approximate**: each row has a `confidence`
  (top ranks are fairly sure; ranks past ~30 in the early anchors are rough) and
  `verified: false`. `yahoo_symbol` is filled only where Yahoo's history is that
  company. Enron is in the 2000 list at rank 50 for the bankruptcy case,
  probably a few places too high (noted on the row).
- `data/names/name_pool.json`: 24 invented names and tickers per sector, the
  index fund's name, and a sector-level "About" line. No name, ticker or symbol
  from the universe list is reused (tested).
- `data/headlines/market_headlines.json`: 204 curated headlines covering 195
  months with notable real events, 1957–2025, every one `reviewed: false`, the
  10 unsure ones `flag`ged. Months without one get a generated line from the market's return
  (`generatedHeadline`). The wording check blocks years, decades and a list of
  names, places and dated terms; subtler era giveaways are for the review.
