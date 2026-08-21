import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''const PORTFOLIO_BASE_SETUP: SessionConfig = {''',
'''// The manager game: 25 YEARS, a risk-free asset and 5 managers, 2x leverage
// available, scored against an index you cannot buy. Skill is real but tiny; the
// defaults are calibrated so the lesson lands without the host touching a dial.
const MANAGER_BASE_SETUP: SessionConfig = {
  ...DEFAULT_CONFIG,
  game_type: "manager",
  market_scope: "shared",
  market_mode: "auto",
  num_rounds: 25,
  num_managers: 5,
  market_mean: 0.08,
  market_sd: 0.16,
  risk_free_rate: 0.03,
  borrow_spread: 0.05,
  leverage_cap: 2,
  shuffle_skill: true,
  manager_preset: "default",
  // one synthetic competitor: 'The Index'
  add_benchmark_bots: true,
};

const PORTFOLIO_BASE_SETUP: SessionConfig = {'''
),
(
'''          <GameCard
            title="Portfolio Risk Game"
            tagline="Spread wealth across independent assets"
            lines={[
              "Several risky assets, each with its own market",
              "You pick how many assets are in play",
              "Diversification vs. one big basket",
            ]}
            icon={<TrendUp />}
            onClick={() => setGameType("portfolio")}
          />
        </div>''',
'''          <GameCard
            title="Portfolio Risk Game"
            tagline="Spread wealth across independent assets"
            lines={[
              "Several risky assets, each with its own market",
              "You pick how many assets are in play",
              "Diversification vs. one big basket",
            ]}
            icon={<TrendUp />}
            onClick={() => setGameType("portfolio")}
          />
          <GameCard
            title="The Manager Game"
            tagline="Active vs. passive, over a career"
            lines={[
              "Each round is a year — hire from 5 fund managers",
              "Borrow up to 2× if you back your judgement",
              "Skill is real, tiny, and nearly invisible; fees are not",
            ]}
            icon={<Trophy />}
            onClick={() => setGameType("manager")}
          />
        </div>'''
),
(
'''  const portfolio = gameType === "portfolio";
  const [cfg, setCfg] = useState<SessionConfig>(
    portfolio ? { ...PORTFOLIO_BASE_SETUP } : { ...BASE_SETUP },
  );''',
'''  const portfolio = gameType === "portfolio";
  const manager = gameType === "manager";
  const [cfg, setCfg] = useState<SessionConfig>(
    manager
      ? { ...MANAGER_BASE_SETUP }
      : portfolio
        ? { ...PORTFOLIO_BASE_SETUP }
        : { ...BASE_SETUP },
  );'''
),
(
'''    const payload: SessionConfig = {
      ...cfg,
      market_scope: cfg.market_mode === "manual" ? "shared" : cfg.market_scope,
      ...(portfolio
        ? {
            num_assets: n,
            risk_free_rate: cfg.risk_free_rate ?? 0,
            correlation: cfg.correlation ?? 0,
            assets: cleanedAssets,
          }
        : { num_assets: undefined, risk_free_rate: undefined, correlation: undefined, assets: undefined }),
    };''',
'''    const payload: SessionConfig = {
      ...cfg,
      market_scope: cfg.market_mode === "manual" ? "shared" : cfg.market_scope,
      ...(portfolio
        ? {
            num_assets: n,
            risk_free_rate: cfg.risk_free_rate ?? 0,
            correlation: cfg.correlation ?? 0,
            assets: cleanedAssets,
          }
        : { num_assets: undefined, correlation: undefined, assets: undefined }),
      // The manager line-up is built SERVER-side from the preset: alpha never
      // travels through the client, and the skill shuffle has to happen in the
      // same transaction that writes session_secrets.
      ...(manager ? {} : { managers: undefined, num_managers: undefined }),
      ...(portfolio || manager ? {} : { risk_free_rate: undefined }),
    };'''
),
(
'''      <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
        {portfolio ? "New portfolio session" : "New basic session"}
      </h2>''',
'''      <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
        {manager ? "New manager session" : portfolio ? "New portfolio session" : "New basic session"}
      </h2>'''
),
(
'''import { ArrowLeft, Coins, TrendUp } from "@/components/icons";''',
'''import { ArrowLeft, Coins, TrendUp, Trophy } from "@/components/icons";'''
),
])
