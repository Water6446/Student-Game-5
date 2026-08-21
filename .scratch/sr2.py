import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentRound.tsx", [
(
'''        {portfolio ? (
          <PortfolioAllocationInput
            config={session.config}
            wealth={me.current_wealth}
            amounts={amounts}
            onChange={setAmounts}
            disabled={busy}
          />
        ) : (
          <AllocationInput
            wealth={me.current_wealth}
            risky={risky}
            onChange={setRisky}
            disabled={busy}
          />
        )}''',
'''        {manager ? (
          <ManagerAllocationInput
            config={session.config}
            wealth={me.current_wealth}
            percents={percents}
            onChange={setPercents}
            disabled={busy}
          />
        ) : portfolio ? (
          <PortfolioAllocationInput
            config={session.config}
            wealth={me.current_wealth}
            amounts={amounts}
            onChange={setAmounts}
            disabled={busy}
          />
        ) : (
          <AllocationInput
            wealth={me.current_wealth}
            risky={risky}
            onChange={setRisky}
            disabled={busy}
          />
        )}'''
),
(
'''          {busy ? "Saving…" : mine ? "Update allocation" : portfolio ? "Lock in my portfolio" : "Lock in my bet"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))}{" "}
            {portfolio ? "invested" : "risky"} — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center font-editorial text-sm italic text-ink-subtle">
            {portfolio
              ? "Spread your wealth across the assets, then lock it in."
              : "Choose how much to put at risk, then lock it in."}
          </p>
        )}''',
'''          {busy
            ? "Saving…"
            : mine
              ? "Update allocation"
              : manager
                ? unchanged
                  ? "Hold this portfolio"
                  : "Confirm my portfolio"
                : portfolio
                  ? "Lock in my portfolio"
                  : "Lock in my bet"}
        </Button>
        {mine ? (
          <Banner kind="success">
            Submitted {money(Number(mine.risky_amount))}{" "}
            {portfolio || manager ? "invested" : "risky"} — you can still edit until it locks.
          </Banner>
        ) : (
          <p className="text-center font-editorial text-sm italic text-ink-subtle">
            {manager
              ? unchanged
                ? "Unchanged from last year — you keep this portfolio unless you change it."
                : "Set your percentages, then confirm."
              : portfolio
                ? "Spread your wealth across the assets, then lock it in."
                : "Choose how much to put at risk, then lock it in."}
          </p>
        )}'''
),
(
'''  const portfolio = isPortfolio(session.config);
  // per-player outcome (independent scope) falls back to the shared round outcome
  const outcome = mine?.market_outcome ?? round.market_outcome;''',
'''  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);
  // per-player outcome (independent scope) falls back to the shared round outcome
  const outcome = mine?.market_outcome ?? round.market_outcome;'''
),
(
'''        {portfolio && assetOuts.length > 0 ? (''',
'''        {manager ? (
          <ManagerYearResult
            config={session.config}
            round={round}
            allocation={mine}
            startWealth={before}
          />
        ) : null}

        {portfolio && assetOuts.length > 0 ? ('''
),
])
