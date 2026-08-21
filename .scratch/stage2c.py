import sys
sys.path.insert(0, ".scratch")
from edit import patch

BENCH = '''  // The index ghost line, sourced from rounds.market_return — the same number
  // the Index bot compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!isManager(session.config)) return null;
    const revealed = rounds
      .filter((r) => r.status === "revealed" && r.market_return != null)
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return null;
    return {
      label: "The Index (no fees)",
      series: indexSeries(
        session.config.starting_wealth,
        revealed.map((r) => Number(r.market_return)),
      ),
    };
  }, [session.config, rounds]);
'''

patch("components/host/HostSummary.tsx", [
(
'''import { isPortfolio } from "@/lib/game/types";''',
'''import { isManager, isPortfolio } from "@/lib/game/types";
import { indexSeries } from "@/lib/game/manager";'''
),
(
'''  function downloadCsv() {''',
BENCH + '''
  function downloadCsv() {'''
),
(
'''        <WealthChart
          players={visiblePlayers}
          rounds={rounds}
          allocations={allocations}
          startingWealth={session.config.starting_wealth}
        />''',
'''        <WealthChart
          players={visiblePlayers}
          rounds={rounds}
          allocations={allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
        />'''
),
])

patch("components/host/HostPresent.tsx", [
(
'''import { assetName } from "@/lib/game/portfolio";''',
'''import { assetName } from "@/lib/game/portfolio";
import { indexSeries } from "@/lib/game/manager";'''
),
(
'''import { isPortfolio, type MarketOutcome, type SessionConfig } from "@/lib/game/types";''',
'''import { isManager, isPortfolio, type MarketOutcome, type SessionConfig } from "@/lib/game/types";'''
),
(
'''  const portfolio = isPortfolio(session.config);
  // basic: each player's market draws; portfolio: gained/lost chips per round''',
'''  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);

  // The index ghost line, from the same rounds.market_return the Index bot
  // compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!manager) return null;
    const revealed = history.rounds
      .filter((r) => r.status === "revealed" && r.market_return != null)
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return null;
    return {
      label: "The Index (no fees)",
      series: indexSeries(
        session.config.starting_wealth,
        revealed.map((r) => Number(r.market_return)),
      ),
    };
  }, [manager, history.rounds, session.config.starting_wealth]);

  // basic: each player's market draws; portfolio: gained/lost chips per round'''
),
(
'''      portfolio
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : playerOutcomesMap(session, players, history.rounds, history.allocations),
    [portfolio, session, players, history.rounds, history.allocations],
  );''',
'''      portfolio || manager
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : playerOutcomesMap(session, players, history.rounds, history.allocations),
    [portfolio, manager, session, players, history.rounds, history.allocations],
  );'''
),
(
'''            allocations={history.allocations}
            startingWealth={session.config.starting_wealth}
            hideToggle={true}
          />''',
'''            allocations={history.allocations}
            startingWealth={session.config.starting_wealth}
            hideToggle={true}
            benchmark={benchmark}
          />'''
),
])
