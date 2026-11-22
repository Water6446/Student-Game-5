# Paper Trading Simulator: build spec

Written 2026-11-19 for Claude Code. This is the first game in a new section of
SharpSim (sharpesim.com), separate from the three classroom risk games. Read
this whole file before planning.

---

## 0. How to work on this

1. **Start in plan mode. Do not write code yet.** Read, in order: `CLAUDE.md`,
   `DESIGN.md`, `MECHANICS.md`, `docs/ACCOUNTS.md`, `docs/DEPLOYMENT.md`, then
   this file. Skim `app/host/*`, `app/play/*`, `components/host/*`,
   `components/student/*`, `lib/game/*`, `components/JoinForm.tsx`, and the
   highest-numbered migrations that define `create_session`, `join_session`,
   `start_round`, `lock_round`, `resolve_round` and `next_round`.
2. Produce a phased plan (section 14 has the phase order) that names the files and
   migrations each phase adds, the RPCs, the table shapes, and the
   test plan. Then bring every item in **section 13 (Open questions)** to Max with
   your proposed default, and wait for answers.
3. Build one phase at a time. After each phase run `npx tsc --noEmit`,
   `npm test`, and `npm run test:db`, then stop and summarize for Max before
   starting the next one.
4. Everything in `CLAUDE.md` still applies: the server owns every number, TS
   mirrors SQL, migrations are append-only, new RPCs get denial tests and go
   into the exact callable set in `scripts/accounts_selftest.sql`, and Academy
   Arcade is the only design system.

---

## 1. What this is and why

A **host-led, live, in-class paper trading game**. The host runs a session on
the projector, students join with a code on their phones, and the class trades
real historical US stocks (names hidden) through a brokerage-style interface
that looks and behaves like Robinhood and Fidelity. Each round advances the
market by one period (a year at most). After the last round, the real
companies, tickers and dates are revealed.

**The research purpose matters for the architecture.** Max is going to study how
behavior differs between investing apps and betting apps (sportsbooks, mobile
casinos, prediction markets), and how **adding or removing friction** changes
that behavior. The next builds are clones of **Kalshi, Polymarket and FanDuel**
inside this same section. So v1 must:

- log behavior at the interaction level (section 8),
- make friction a configurable experimental variable (section 8),
- keep the core engine (accounts, ledger, instruments, orders, fills, round
  clock, behavior log) generic enough that event contracts and sports bets can
  plug in later without a rewrite (section 10).

Do not build any betting or prediction-market features now. Just do not make
choices that block them.

---

## 2. Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| Format | Host-led live session, same pattern as the existing games (join code, lobby, host advances rounds, projector present mode). |
| Round length | Host picks a period per round in setup. **Maximum one year.** Offer: 1 year, 6 months, 1 quarter, 1 month, 1 week. Total window = rounds x period (25 rounds x 1 quarter = 6.25 years). |
| Rounds | Host-set, default 25 (existing `num_rounds` convention). |
| Data | **Real individual US stocks, 1962 onward.** Window chosen at random from the available history. |
| Data licensing | **Free source for development only.** Build against a free source now; a licensed source replaces it before real classes use it (section 5.1). |
| Delisted firms | **Must be supported.** Companies can go bankrupt or be acquired mid-game. |
| Dates | **Hidden during play, revealed at the end.** Students see "Year 3 · Mar 14", never the real year. |
| Identity | Company names and tickers obfuscated during play, revealed at the end. |
| Universe | About the 25 largest companies by market cap at the window start, plus an index fund and cash (confirm size, section 13). |
| v1 order features | Market, limit and stop orders; short selling; margin/leverage; dividends paid as cash; fractional shares; interest on cash. |
| Bots | **None in v1.** Do not build auto-trader bots. Do not preclude adding them later as player rows (the existing benchmark-bot pattern). |
| News | Market-level headlines per period, written from real history with no names, dates or era giveaways. Curated data file (section 5.6). |
| Scoring | Leaderboard ranks by **account value** (net liquidation value). Show Sharpe ratio and max drawdown beside it. |
| Design | **Academy Arcade**, the existing site design (`DESIGN.md`). Take the *layout and interaction patterns* from Robinhood and Fidelity, not their colors or dark mode. |
| Section | A new section of the site, separate from the current games in navigation and URLs, reachable from the existing hub (section 3). |

---

## 3. Where it lives (information architecture)

"New section" is about **navigation and URLs**, not a second backend. Proposed
layout (confirm in plan):

- **Section hub** at `/markets`: a short landing page for the new section. Today
  it lists one game (Paper Trading). Kalshi/Polymarket/FanDuel-style games
  will appear here later; do not show placeholders for them.
- **Game routes** under `/markets/trade/...`: host control screen, projector
  present screen, student play screen. These are full-screen game surfaces, so
  add them to the opt-out list in `lib/site-chrome.ts` the same way `/play/<id>`
  and `/host/<id>` are.
- **Joining stays at `/join`.** One join-code space for the whole site. After
  `join_session`, `JoinForm` currently pushes `/play/${session_id}`; route by
  game type instead (or have `/play/[sessionId]` redirect trading sessions).
- **Host dashboard (`/host`)**: add a clear way to start a paper trading
  session alongside the existing "new session" flow, and show trading sessions
  in the sessions list with a type badge. Sessions history, resume strip and
  delete must keep working for the new type.
- **Site header**: add a nav link to the new section. Header is mounted once in
  `app/layout.tsx`; follow DESIGN.md section 8 "Site header".
- **Homepage**: add a separate band announcing the new section (copy lives in
  `lib/marketing/content.ts`). Do not fold it into "The three game types".
  Homepage rules still hold: no testimonials, logos or usage stats.

**Backend reuse (recommended, confirm in plan):** reuse `sessions` (with
`config.game_type = 'trading'`), `players`, `rounds`, join codes, auth, and the
session-overview RPCs, so accounts, history and the dashboard work for free.
Add new tables only for what trading needs (section 9). Check every place that
assumes the existing three game types (`isPortfolio`, `isManager`,
`results.ts`, CSV export, session overview, `configForRerun`) and make each one
handle `trading` explicitly instead of falling through to `basic`.

---

## 4. Game flow

1. **Setup (host):** rounds, period per round, starting cash, trading window
   length, margin on/off and limits, shorting on/off, spread/commission,
   friction profile (section 8), headlines on/off, late join, era (random, or a
   host-picked start year that stays hidden from students).
2. **Session creation (server):** pick the window, select the universe (top N
   by market cap at window start among companies with data), assign each
   company a fake name and ticker (fresh random mapping per session so names
   cannot be learned across sessions), pick a display-price scale per company
   (section 5.4), and store all of this server-side and secret.
3. **Lobby:** as today. Students see the market already (prices and the
   pre-window history), so they can browse before round 1.
4. **Round loop:**
   - `open`: trading window (host timer, extend or close early). Students place
     and cancel orders. Prices shown are as of the end of the last revealed
     period.
   - `locked`: no new orders.
   - `resolve`: the server steps through **every trading day of the period**
     in order: market orders fill at the start, then each day it fills
     triggered limit/stop orders, pays dividends on ex-dates, accrues cash
     interest, margin interest and short borrow fees, checks margin and
     force-liquidates if needed, and applies delistings. It writes positions,
     fills and the new account value, then sets the round `revealed` last
     (the existing contract every client keys its reveal on).
   - `revealed`: the period's daily price path **animates** on every chart
     (projector and phones, a few seconds, reduced-motion respected), with the
     period headline, biggest movers, each student's fills ("Your stop on
     Ridgeline sold at $41.20 on Year 3 · Oct 19"), and the leaderboard.
   - `next_round`: as today.
5. **Finish:** the reveal (section 7.4).

Pre-window history: show some real history before Year 1 so charts have
context (proposed 5 years, section 13). This means a window cannot start
before 1962 + that history length.

---

## 5. Market data

### 5.1 Source, licensing and the dev boundary

- Free individual-stock daily data does not go back further than about 1962. CRSP has monthly data from 1925 and daily from 1962, but it is paid and its license does not allow showing the data on a public site. Paid APIs that permit display (for example Tiingo's commercial tier, about $250/month for startups) start around 1962. Free and personal tiers of Tiingo, Alpha Vantage and Yahoo do **not** allow showing data to other users.
- **Development:** build an offline importer against a free source (Yahoo via
  `yahoo-finance2` in Node is the natural fit, since `tsx` is already a dev
  dependency). Use it for local development and testing only.
- **Hide every vendor behind one adapter.** Write a small `PriceSource`
  interface (bars, dividends, splits, delisting events, shares or market cap)
  and a normalizer that turns any vendor's output into one internal format. The
  licensed source later is one new adapter plus a re-import, with no engine or
  UI changes.
- **Never commit vendor data.** The repo is on GitHub. Raw and normalized data
  go in gitignored folders (`data/raw/`, `data/normalized/`). Commit only the
  importer, the normalizer, the schema, small synthetic test fixtures, and
  curated files we write ourselves (headlines, universe lists, name pools).
- Record the data source on every session (`config.data_source`) and show a
  small "Development data" banner on host screens while the dev source is
  active, so a dev-data session is never mistaken for a real one.
- Before using any extra free dataset (Ken French data library, FRED), read its
  terms and note them in `docs/PAPER_TRADING_DATA.md`.

### 5.2 Survivorship and delistings

A 1970s window's real top 25 includes firms that later went bankrupt, merged or
were acquired. If only survivors are tradable, nearly everything goes up and
the lesson skews. So:

- The schema and engine must support **delisting events**: `bankruptcy` (price
  goes to its final value, then the position is worth 0 or a recovery value),
  `cash_acquisition` (cashed out at the deal price on the delist date), and
  `stock_merger` (v1 may simplify to cash at the final price; document it).
  Shorts in a bankrupt company are closed at 0.
- **Known gap:** free sources mostly cover companies still listed today, so the
  dev dataset will be survivor-heavy. Build and test the delisting paths with
  synthetic fixtures. The licensed source has to include delisted securities;
  list that as a hard requirement in `docs/PAPER_TRADING_DATA.md`.

### 5.3 Universe selection (top N by market cap)

Picking the largest companies at a historical date needs shares outstanding or
market cap history, which free price feeds usually lack. For dev, write a
curated `data/universe/top_by_year.csv` (year, rank, real ticker, name, sector,
source note), compiled from public historical rankings and marked approximate,
for Max to review. The licensed source may replace it with computed market
caps. A company is eligible for a window only if it has data from the start of
pre-window history (or is a known delisting inside the window).

### 5.4 Prices, obfuscation and display

- Use split-adjusted series for returns, and handle dividends separately as
  cash (section 6). Do **not** show adjusted historical prices raw: early
  adjusted prices for many companies are a few cents and would look broken,
  and absolute price levels can identify a company. Rescale each company's
  series by a per-session factor so its price at window start lands in a
  believable range (for example $15 to $250). Scale dividends by the same
  factor. Store the factor server-side.
- Fake names and tickers: draw from a curated name pool by sector (commit the
  pool), unique within a session, never a real ticker from our own dataset.
  Show a broad sector label and a generic, sector-level "About" line. Nothing
  that points to a specific real firm.
- Dates: show month and day with a game-relative year ("Year 3 · Mar 14").
  Before Year 1, show "Year -2 · Jun 3" or "5 yrs before start" (pick one in
  plan). Never send real dates to students before the session is `finished`.

### 5.5 Rates and the index fund

- **Cash interest and margin rate base:** historical 3-month Treasury bill rate
  (FRED: `DTB3` daily from 1954, `TB3MS` monthly). Margin rate = T-bill + spread
  (reuse the manager game's `borrow_spread` convention).
- **Index fund:** "Total Market Index" built from a total-return market series
  (the Ken French daily market return, Mkt-RF + RF, is a candidate; check its
  terms) or a cap-weighted index of our own dataset as the fallback. Its fee is
  close to zero, like the manager game's index fund.

### 5.6 Headlines

- `data/headlines/market_headlines.json`: one or more short headlines per month
  from 1957 to the present (cover pre-window history too), written in plain
  language from real events, with **no company names, people, places, years or
  era-specific terms** ("The central bank raises rates sharply to fight
  inflation", not "Volcker shock"). Every entry has `reviewed: false` until Max
  checks it. Draft them, then flag any you are unsure of instead of guessing.
- A round shows the headlines for its period (pick the most important one for
  the projector). For weekly or monthly rounds, reuse the containing month's
  entry. A news list on the student screens shows past headlines only.

### 5.7 Storage size

Supabase free tier has a database size cap (500 MB at last check; verify the
current limit). Daily bars for 100 to 150 companies from 1962 is roughly 2 to 3
million rows. Measure before committing to a layout, and propose one: compact
types (integer cents, small date keys), close-only history plus OHLC only where
fills need it, weekly bars for long chart ranges, or a per-session window copy
that is deleted when the session ends. The resolve step must stay fast (target
under a few seconds for 60 players and a one-year period).

---

## 6. Trading mechanics (v1)

All of this lives in one resolver (SQL) with a 1:1 TS mirror for tests and
previews, documented in a new "Paper trading" section of `MECHANICS.md`.

- **Account:** cash, long positions, short positions, margin loan. **Net
  liquidation value (NLV)** = cash + long market value - short market value -
  margin loan. NLV is the score and is written to `players.current_wealth`
  only by the resolver.
- **Shares:** fractional allowed. Students can enter dollars or shares
  (Robinhood lets you buy in dollar amounts; offer the toggle).
- **Orders:** market, limit, stop, stop-limit if cheap to add. Sides: buy,
  sell, sell short, buy to cover. Time in force: "this round only" or "good
  till canceled". Orders are placed and canceled only while the round is
  `open`; GTC orders persist across rounds.
- **Fill rules (daily bars):**
  - Market orders fill at the price students saw (the last close) plus or minus
    half the spread.
  - Limit buy fills on the first day low <= limit, at min(open, limit). Limit
    sell mirrors it.
  - Stop sell triggers on the first day low <= stop and fills at min(open,
    stop): **a gap down fills at the open**, which is how real stops behave in a
    crash. Buy stops mirror it.
  - If a source has close-only data for some dates, trigger and fill on close
    and document it.
  - No partial fills in v1.
- **Costs:** zero commission by default plus a small configurable spread
  (default 0.10%) so overtrading has a visible cost. Optional host-set
  per-trade commission.
- **Dividends:** cash on the ex-date to longs; shorts pay them.
- **Cash interest:** accrues daily on positive cash at the T-bill rate.
- **Margin (if enabled):** Reg-T style. 50% initial margin, 25% maintenance on
  longs, 30% on shorts, host-adjustable. Daily interest on the loan. Checked at
  each day's close in the replay. A breach force-liquidates at that close
  (largest position first, document the rule) and tells the student what
  happened and why.
- **Shorting (if enabled):** proceeds held as collateral, daily borrow fee
  (configurable, small default), same maintenance check. NLV below zero is
  possible only through gaps; decide the behavior in plan (section 13).
- **Non-traders** simply hold. **Late joiners** (if allowed) start with the
  starting cash at the current round.
- **Buying power** shown to students must match exactly what the server will
  accept. Validate every order server-side; the client preview only shows.

---

## 7. Screens

Design system: Academy Arcade, exactly as `DESIGN.md` specifies (tokens,
fonts, `components/ui.tsx` primitives, `icons.tsx`, motion rules, the
accessibility ship gate in section 10). `gain`/`loss` colors always come with
arrows or text. Charts use Recharts with colors from `lib/design/colors.ts`.
Add any new reusable pattern (price chart, trade ticket, position row) to
DESIGN.md.

Reference patterns to borrow (layout and behavior, not looks):
- **Robinhood:** big account value at top with change since start; one large
  line chart colored by up or down for the range; time-range tabs (1D to 5Y and
  MAX); press-and-drag scrubbing that shows the price and date under the
  finger; watchlist rows with mini sparklines; stock page with stats (market
  cap, dividend yield, 52-week range), about, news, and Buy/Sell buttons fixed
  at the bottom; order types market, limit, stop, stop-limit and trailing stop
  on its advanced platform.
- **Fidelity:** a stepwise trade ticket (symbol, action, quantity, order type,
  time in force) followed by a **separate review/verification page** before the
  order is placed; positions table with cost basis and gain/loss; orders page
  with statuses (open, pending cancel, filled).
- These two sit at **opposite ends of friction**: Robinhood is the low-friction
  reference, Fidelity the high-friction one. Section 8 turns that into the
  research variable.

### 7.1 Student (phone first)
- **Home / Portfolio:** account value (CountUp), change since start in $ and %,
  portfolio chart with range tabs limited to elapsed time, buying power, cash,
  positions list (fake name, ticker, shares, sparkline, price, change chip),
  open orders count.
- **Market:** all tradable companies plus the index fund, sortable (name,
  change this period, price), with sparklines. Optional "Top movers" list
  (controlled by the friction profile).
- **Stock page:** name, fake ticker, sector, big price and change, chart with
  range tabs and scrubbing, your position card (shares, average cost, market
  value, total return), stats we actually have (market cap if available,
  52-week range, dividend yield), generic about line, recent headlines,
  fixed Buy and Sell buttons (Buy is the gold primary action).
- **Trade ticket** (bottom sheet): buy / sell / short / cover, order type,
  dollars-or-shares toggle, limit/stop price, time in force, estimated cost,
  buying power after the trade, then a review step if the friction profile
  requires it. Clear, honest error states.
- **Orders:** open orders with cancel; filled and canceled history.
- **Reveal state:** the period replay animation, your fills, NLV change,
  headline, your rank.

### 7.2 Host control screen (laptop)
Round controls (start, extend timer, lock, resolve, next, finish), trading
countdown, how many students have placed orders, live leaderboard, friction
condition summary, data-source banner. The real era is hidden by default
behind a "Show real dates (host only)" control, because the host's laptop is
often mirrored. Never show it on the projector.

### 7.3 Projector / present mode
Follow DESIGN.md section 9. "Year 3 of 25" (or "Quarter 7 of 25") period clock,
trading countdown, join code during lobby, the index chart, the period
headline, then the reveal as a full-screen moment: index path animation,
biggest gainers and losers (fake names), class activity (orders placed, most
bought stock), leaderboard movers.

### 7.4 End-of-game reveal
- Real company names, tickers, and the real date window, revealed together as
  the finale.
- Each student's trades placed on the real timeline, with the real events.
- Their result against buying and holding the index fund, plus Sharpe, max
  drawdown, turnover.
- A class-wide **turnover vs. return scatter** with a one-line takeaway. Barber
  and Odean (2000) found the most active trading households earned 11.4% a
  year while the market returned 17.9%; let the class see whether they
  reproduced that.
- Host CSV export (follow the `lib/game/csv.ts` pattern).
- Keep in-UI explanations to one line, with details in MECHANICS.md (CLAUDE.md
  rule).

---

## 8. Research layer: behavior logging and friction

This is not decoration. It is the reason the section exists.

### 8.1 Behavior event log
- Table `behavior_events`: session_id, player_id, round_number, event_type,
  client timestamp, server timestamp, payload (jsonb). Event types (start
  here, keep them generic): `screen_view`, `instrument_view`,
  `chart_range_change`, `chart_scrub`, `ticket_open`, `ticket_field_change`,
  `ticket_review_view`, `order_submit`, `order_cancel`, `ticket_abandon`,
  `confirm_shown`, `confirm_accepted`, `confirm_declined`, `cooldown_blocked`,
  `celebration_shown`, `app_background`, `app_foreground`.
- Clients batch events and send them through one rate-limited SECURITY DEFINER
  RPC (cap the batch size and the rate per player). No direct table writes. Add
  denial tests and update the exact callable set.
- Pure TS derived metrics in `lib/`, tested: trades per round, turnover,
  time from ticket open to submit, abandonment rate, review-screen dwell time,
  concentration (HHI), leverage and short usage, selling after a losing period
  ("panic"), buying last period's top gainers ("chasing").
- A host/researcher export (CSV) that uses pseudonymous player IDs only.

### 8.2 Friction as a variable
- A `friction_profile` in session config with presets plus individual knobs:
  - **Low** (Robinhood-like): one-tap buy from lists, dollar-amount preset
    chips, no review step, celebration animation on fills (`Confetti.tsx`
    exists), "Top movers" and "Popular in your class" lists shown.
  - **Standard:** ticket, then review step, no celebration.
  - **High** (Fidelity-like and beyond): full ticket, separate review page,
    typed confirmation of quantity, a short cooldown between orders, a
    risk disclosure before margin or short orders, no social or mover lists.
- Assignment: one profile for the whole session in v1. Build the data model so
  per-player random assignment (balanced, stored server-side, hidden from
  students, visible to host) can be switched on, because between-subjects
  experiments will need it.
- Name things generically ("friction profile", "confirmation step"), since the
  same knobs will apply to the betting and prediction-market clones.

### 8.3 Consent
If this data is used for research, Max needs WPI IRB approval. Build a
`research_mode` flag that, when on, shows a consent screen before play (text is
`TODO(max)` until the IRB process sets it) and records consent per player.
Export only consenting players' events when research mode is on.

---

## 9. Architecture and security

- **Server owns every number.** Orders are validated, filled and settled only
  in SQL (SECURITY DEFINER RPCs). No service_role key in the app. If you
  believe a part of the resolver needs to run outside Postgres, say so in the
  plan with reasons before building it.
- **Single wealth writer:** keep the CLAUDE.md invariant literally true, for
  example by having `resolve_round` dispatch to a `_resolve_trading` branch.
- **Secrecy:** future price bars, real tickers, real names, real dates, the
  price scale factors and friction assignments are server-only (the
  `session_secrets` pattern: RLS on, no policies, no grants). Price reads go
  through an RPC that returns only bars up to the session's last revealed date,
  already rescaled and with obfuscated dates. Add a selftest proving a student
  cannot read a single bar past the current round, or any real identity,
  before `finished`.
- **Proposed new tables** (names generic on purpose, adjust in plan):
  `market_instruments` (reference data, kind = 'equity' | 'index_fund' now),
  `market_bars`, `market_corporate_actions` (dividends, splits, delistings),
  `market_rates`, `session_instruments` (per-session fake identity and scale,
  secret), `market_orders`, `market_fills`, `market_positions`,
  `market_ledger` (every cash movement as a row: trade, dividend, interest,
  fee, forced liquidation), `behavior_events`.
- **Loading reference data** is not a migration (migrations are schema). Write a
  documented loader script that uses the database connection string from
  `.env.local` (never exposed to the browser) and document it in
  `docs/DEPLOYMENT.md`.
- Hooks follow the `components/use-*.ts` pattern (initial select plus a
  realtime subscription); RLS decides what each caller sees.

---

## 10. Build for what comes next (without building it)

The next games are Kalshi- and Polymarket-style event contracts and a
FanDuel-style sportsbook, in the same section, compared against this game under
different friction settings. So:
- `market_instruments.kind` is an enum that can grow (`event_contract`,
  `sports_bet` later). The ledger, orders, fills and positions should not
  assume an instrument is a stock where that is cheap to avoid.
- The round clock, behavior log, friction profile, research export and consent
  flow are section-level modules, not trading-specific code.
- Do not add any betting, contract, odds or sportsbook UI or tables now.

---

## 11. Testing and docs

- Vitest (pure TS in `lib/`): fill rules including gap-through stops, margin
  math and forced liquidation, short P&L and borrow fees, dividends long and
  short, interest accrual, every delisting type, NLV, Sharpe and drawdown, and
  the behavior metrics. Use small synthetic fixtures, never vendor data.
- DB selftests: every new RPC has a denial test; the future-data secrecy test
  from section 9; no direct writes to any trading table; the exact callable set
  updated for both roles.
- Docs: a "Paper trading" section in `MECHANICS.md`; new patterns in
  `DESIGN.md`; game-type and invariant updates in `CLAUDE.md`;
  `docs/PAPER_TRADING_DATA.md` (sources, terms, dev boundary, licensed-source
  requirements: daily OHLC, dividends, splits, delisted securities with
  delisting reason and price, shares outstanding or market cap, display
  license).

---

## 12. Out of scope for v1

Bots, options, trailing stops (unless trivial), partial fills, intraday data,
live current market data, multi-week leagues, any betting or prediction-market
feature, real money, paid data integration (the adapter only), dark mode.

---

## 13. Open questions to confirm with Max (propose a default for each)

1. Starting cash: $100,000 (the Investopedia-style convention) or less?
2. Trading window per round: 90 seconds default, host-adjustable?
3. Pre-window history shown before Year 1: 5 years?
4. Universe size: 25 companies plus the index fund?
5. Period options: 1 year, 6 months, 1 quarter, 1 month, 1 week. Keep all five?
6. How pre-Year-1 dates read on charts.
7. Section name and URL (`/markets` hub, `/markets/trade` game), and the header
   label.
8. NLV below zero after a gap: freeze the account at zero, or let it go
   negative and show it?
9. Spread default 0.10% and zero commission?
10. Host sees the real era during play only behind a click: agreed?
11. Friction: session-wide preset in v1, with per-player randomization built
    but switched off?
12. Headline granularity: one per month drafted for Max to review?
13. Confirm `yahoo-finance2` (or another free source) for dev only.
14. Anything about the research design (which behaviors matter most) that
    should change what the event log captures.

---

## 14. Phases and definition of done

Phase order: (1) data importer, normalizer, adapter interface, universe and
headline files, size measurement; (2) schema, RPCs, secrecy, selftests; (3)
engine in SQL plus TS mirror, with tests; (4) student screens, with event
logging wired in from the start; (5) host control and present screens; (6)
section hub, navigation, join routing, dashboard integration, homepage band;
(7) friction profiles, research export, consent; (8) end-of-game reveal and
CSV.

Done when: a host can run a full 25-round session from `/host` with students on
phones joined through `/join`; every number comes from the server; no student
can read future data or real identities before the end; the existing three
games behave exactly as before; `tsc`, `npm test` and `npm run test:db` pass;
DESIGN.md section 10 accessibility checks pass on every new screen; and the docs
listed in section 11 are updated.
