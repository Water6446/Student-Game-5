import sys
sys.path.insert(0, ".scratch")
from edit import patch

BENCH = '''  // The index ghost line, sourced from rounds.market_return — the same number
  // the Index bot compounds, so the line and the bot can never disagree.
  const benchmark = useMemo(() => {
    if (!managerGame) return null;
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
  }, [managerGame, history.rounds, session.config.starting_wealth]);
'''

patch("components/host/HostRoundControl.tsx", [
(
'''import { assetName, numAssets } from "@/lib/game/portfolio";''',
'''import { assetName, numAssets } from "@/lib/game/portfolio";
import { indexSeries } from "@/lib/game/manager";
import { FeeCounter, feesByPlayer, sumFees } from "@/components/FeeCounter";'''
),
(
'''  // The manager game's class line is the market itself''',
BENCH + '''
  // Fees are a loss, and the class total should climb in front of the room.
  const classFees = useMemo(
    () => (managerGame ? sumFees(history.allocations) : 0),
    [managerGame, history.allocations],
  );
  const feesFor = useMemo(
    () => (managerGame ? feesByPlayer(history.allocations) : null),
    [managerGame, history.allocations],
  );

  // The manager game's class line is the market itself'''
),
(
'''        <WealthChart
          players={visiblePlayers}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
        />''',
'''        <WealthChart
          players={visiblePlayers}
          rounds={history.rounds}
          allocations={history.allocations}
          startingWealth={session.config.starting_wealth}
          benchmark={benchmark}
        />'''
),
(
'''            </p>
          ) : null}
          {classLuck ? (''',
'''            </p>
          ) : null}
          {managerGame ? (
            <p className="mb-3">
              <FeeCounter total={classFees} label="Class fees paid" />
            </p>
          ) : null}
          {classLuck ? ('''
),
(
'''                    <LuckChip luck={rowLuck} expected={expected} />
                    <OutcomeChips outcomes={last5} />''',
'''                    <LuckChip luck={rowLuck} expected={expected} />
                    {feesFor ? (
                      <span
                        className="shrink-0 font-mono text-xs text-loss"
                        title="fees paid to managers so far"
                      >
                        −{money(feesFor.get(p.id) ?? 0)}
                      </span>
                    ) : null}
                    <OutcomeChips outcomes={last5} />'''
),
])
