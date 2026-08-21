import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/HostRoundControl.tsx", [
(
'''  const deltaChipsByPlayer = useMemo(
    () => (portfolioGame ? playerDeltaChipsMap(history.rounds, history.allocations) : null),
    [portfolioGame, history.rounds, history.allocations],
  );''',
'''  // The manager game has no per-round market outcome either, so it reuses the
  // portfolio game's gained/lost chips unchanged.
  const deltaChipsByPlayer = useMemo(
    () =>
      portfolioGame || managerGame
        ? playerDeltaChipsMap(history.rounds, history.allocations)
        : null,
    [portfolioGame, managerGame, history.rounds, history.allocations],
  );'''
),
(
'''            {portfolioGame
              ? "Last 5 rounds per player (up = gained, down = lost)"
              : "Last 5 markets per player"}''',
'''            {managerGame
              ? "Last 5 years per player (up = gained, down = lost)"
              : portfolioGame
                ? "Last 5 rounds per player (up = gained, down = lost)"
                : "Last 5 markets per player"}'''
),
(
'''              const last5 = (
                (portfolioGame ? deltaChipsByPlayer?.get(p.id) : outcomesByPlayer.get(p.id)) ?? []
              ).slice(-5);''',
'''              const last5 = (
                (portfolioGame || managerGame
                  ? deltaChipsByPlayer?.get(p.id)
                  : outcomesByPlayer.get(p.id)) ?? []
              ).slice(-5);'''
),
])
