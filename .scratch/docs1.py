import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("CLAUDE.md", [
(
'''**[MECHANICS.md](./MECHANICS.md)** is the master reference for how every game
number works (luck, Sharpe, returns, correlation ρ, counterfactuals, standings).''',
'''**[MECHANICS.md](./MECHANICS.md)** is the master reference for how every game
number works (luck, Sharpe, returns, correlation ρ, counterfactuals, standings).

There are **three game types**: `basic` (one risky bet), `portfolio` (N risky
assets) and `manager` (active vs. passive — continuous normal returns, fees,
leverage, and a secret alpha held in `session_secrets`; each round is a year).'''
),
])

patch("DESIGN.md", [
(
'''components/LuckChip.tsx           signed luck vs the expected GOOD rate (clover + ± percentage)''',
'''components/LuckChip.tsx           signed luck vs the expected GOOD rate (clover + ± percentage)
components/ManagerYearResult.tsx  manager game: one year's market + every manager's return'''
),
])
