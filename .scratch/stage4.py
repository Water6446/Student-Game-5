import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentFinished.tsx", [
(
'''import { isPortfolio } from "@/lib/game/types";''',
'''import { isManager, isPortfolio } from "@/lib/game/types";
import { indexSeries } from "@/lib/game/manager";
import { sumFees } from "@/components/FeeCounter";'''
),
(
'''  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);

  const portfolio = isPortfolio(session.config);''',
'''  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [manager Summary, setManagerSummary] = useState<{
    indexWealth: number;
    fees: number;
  } | null>(null);

  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);'''
),
(
'''      const [res] = buildPlayerResults(session, [me], rounds, allocs);
      setResult(res ?? null);''',
'''      const [res] = buildPlayerResults(session, [me], rounds, allocs);
      setResult(res ?? null);

      // The punchline of the module: what the index did with no fees, and what
      // the manager fees actually cost. Both come from rows the student can
      // already read — no truth needed.
      if (isManager(session.config)) {
        const market = rounds
          .filter((r) => r.status === "revealed" && r.market_return != null)
          .sort((a, b) => a.round_number - b.round_number)
          .map((r) => Number(r.market_return));
        const series = indexSeries(session.config.starting_wealth, market);
        setManagerSummary({
          indexWealth: series.length > 0 ? series[series.length - 1] : session.config.starting_wealth,
          fees: sumFees(allocs.filter((a) => a.player_id === me.id)),
        });
      }'''
),
(
'''        {portfolio && pfCf ? (''',
'''        {/* The punchline: your wealth, the index you could not buy, and the
            gap — with the fee total sitting inside it. */}
        {manager && managerSummary ? (
          <div className="mt-6 rounded-2xl border-2 border-ink bg-surface p-4 text-left shadow-lift">
            <dl className="space-y-1 font-mono text-sm">
              <SumRow label="Final wealth" value={money(me.current_wealth)} />
              <SumRow
                label="If you had just held the index"
                value={money(managerSummary.indexWealth)}
              />
              <div className="!mt-2 border-t-2 border-ink pt-2">
                <SumRow
                  label="You paid in fees"
                  value={money(managerSummary.fees)}
                  tone="loss"
                />
                <SumRow
                  label={
                    me.current_wealth >= managerSummary.indexWealth
                      ? "You beat the index by"
                      : "You trailed the index by"
                  }
                  value={money(Math.abs(me.current_wealth - managerSummary.indexWealth))}
                  tone={me.current_wealth >= managerSummary.indexWealth ? "gain" : "loss"}
                  bold
                />
              </div>
            </dl>
          </div>
        ) : null}

        {portfolio && pfCf ? ('''
),
])
