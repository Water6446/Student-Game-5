import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/HostRoundControl.tsx", [
(
'''import { isPortfolio } from "@/lib/game/types";''',
'''import { isManager, isPortfolio } from "@/lib/game/types";
import { ManagerYearResult } from "@/components/ManagerYearResult";'''
),
(
'''  const portfolioGame = isPortfolio(session.config);''',
'''  const portfolioGame = isPortfolio(session.config);
  // The manager game has no good/bad draws, so there is nothing to be lucky in
  // and no odds to tune. Those surfaces are suppressed, not deleted.
  const managerGame = isManager(session.config);'''
),
(
'''  const luckByPlayer = useMemo(() => {
    const m = new Map<string, LuckStats | null>();
    if (!independent) return m;''',
'''  const luckByPlayer = useMemo(() => {
    const m = new Map<string, LuckStats | null>();
    if (!independent || managerGame) return m;'''
),
(
'''  }, [independent, players, portfolioGame, session, history.rounds, history.allocations, outcomesByPlayer, expected]);''',
'''  }, [independent, managerGame, players, portfolioGame, session, history.rounds, history.allocations, outcomesByPlayer, expected]);'''
),
(
'''  const classLuck = useMemo(
    () => (independent ? null : classLuckSoFar(session.config, history.rounds)),
    [independent, session.config, history.rounds],
  );''',
'''  const classLuck = useMemo(
    () => (independent || managerGame ? null : classLuckSoFar(session.config, history.rounds)),
    [independent, managerGame, session.config, history.rounds],
  );

  // The manager game's class line is the market itself: this year's index
  // return and the annualized rate so far.
  const marketLine = useMemo(() => {
    if (!managerGame) return null;
    const revealed = history.rounds
      .filter((r) => r.status === "revealed" && r.market_return != null)
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return null;
    const cum = revealed.reduce((acc, r) => acc * (1 + Number(r.market_return)), 1);
    return {
      latest: Number(revealed[revealed.length - 1].market_return),
      annualized: Math.pow(Math.max(cum, 0), 1 / revealed.length) - 1,
      years: revealed.length,
    };
  }, [managerGame, history.rounds]);'''
),
(
'''              {!isManual ? <OddsDisclosure supabase={supabase} session={session} /> : null}
              <CondensedList''',
'''              {!isManual && !managerGame ? (
                <OddsDisclosure supabase={supabase} session={session} />
              ) : null}
              <CondensedList'''
),
(
'''              <AllocationsBreakdown
                players={visiblePlayers}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
                portfolio={portfolioGame}
              />
              {!isManual ? <OddsDisclosure supabase={supabase} session={session} /> : null}
            </>
          )}''',
'''              <AllocationsBreakdown
                players={visiblePlayers}
                allocations={allocs}
                goodProb={session.config.good_prob ?? 0.6}
                portfolio={portfolioGame}
                levered={managerGame}
              />
              {!isManual && !managerGame ? (
                <OddsDisclosure supabase={supabase} session={session} />
              ) : null}
            </>
          )}'''
),
(
'''              {portfolioGame && round?.market_outcomes ? (''',
'''              {managerGame && round ? (
                <ManagerYearResult
                  config={session.config}
                  round={round}
                  allocation={null}
                  startWealth={0}
                />
              ) : portfolioGame && round?.market_outcomes ? ('''
),
(
'''                <AllocationsBreakdown
                  players={visiblePlayers}
                  allocations={allocs}
                  goodProb={session.config.good_prob ?? 0.6}
                  portfolio={portfolioGame}
                />
              )}''',
'''                <AllocationsBreakdown
                  players={visiblePlayers}
                  allocations={allocs}
                  goodProb={session.config.good_prob ?? 0.6}
                  portfolio={portfolioGame}
                  levered={managerGame}
                />
              )}'''
),
(
'''          {classLuck ? (''',
'''          {marketLine ? (
            <p className="mb-3 font-editorial text-sm italic text-ink-muted">
              Market: <span className={marketLine.latest >= 0 ? "text-gain" : "text-loss"}>
                {signedPct(marketLine.latest * 100, 1)}
              </span>{" "}
              this year ·{" "}
              <span className={marketLine.annualized >= 0 ? "text-gain" : "text-loss"}>
                {signedPct(marketLine.annualized * 100, 1)}
              </span>
              /yr over {marketLine.years} year{marketLine.years === 1 ? "" : "s"}
            </p>
          ) : null}
          {classLuck ? ('''
),
])
