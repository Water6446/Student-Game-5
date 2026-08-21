import sys
sys.path.insert(0, ".scratch")
from edit import patch

BT = chr(96); DL = chr(36)

patch("components/host/WealthChart.tsx", [
(
'''type ChartRow = { round: number } & Record<string, number>;''',
'''type ChartRow = { round: number } & Record<string, number>;

/**
 * Reserved series key for the benchmark line. Not a player id, so it is never
 * culled by the crowded-chart logic and never appears in the players map.
 */
const BENCHMARK_KEY = "__benchmark";'''
),
(
'''  startingWealth,
  hideToggle,
}: {
  players: PlayerRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
  startingWealth: number;
  hideToggle?: boolean;
}) {''',
'''  startingWealth,
  hideToggle,
  benchmark,
}: {
  players: PlayerRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
  startingWealth: number;
  hideToggle?: boolean;
  /** manager game: the index students are measured against. series[i] = value
   *  after round i+1. Drawn last, dashed, and never culled. */
  benchmark?: { label: string; series: number[] } | null;
}) {'''
),
(
'''    const start: ChartRow = { round: 0 };
    players.forEach((p) => (start[p.id] = startingWealth));
    rows.push(start);''',
'''    const start: ChartRow = { round: 0 };
    players.forEach((p) => (start[p.id] = startingWealth));
    if (benchmark) start[BENCHMARK_KEY] = startingWealth;
    rows.push(start);'''
),
(
'''        row[p.id] = plotVal;
        row[BTDLOPENp.idCLOSE_realBT] = realVal;
      });
      rows.push(row);'''.replace("BT", BT).replace("DLOPEN", DL + "{").replace("CLOSE", "}"),
'''        row[p.id] = plotVal;
        row[BTDLOPENp.idCLOSE_realBT] = realVal;
      });
      if (benchmark) {
        const realVal = benchmark.series[rn - 1] ?? startingWealth;
        row[BENCHMARK_KEY] = useLogScale && realVal <= 0 ? 1 : realVal;
        row[BTDLOPENBENCHMARK_KEYCLOSE_realBT] = realVal;
      }
      rows.push(row);'''.replace("BT", BT).replace("DLOPEN", DL + "{").replace("CLOSE", "}")
),
(
'''  }, [players, rounds, allocations, startingWealth, useLogScale]);''',
'''  }, [players, rounds, allocations, startingWealth, useLogScale, benchmark]);'''
),
(
'''              content={featured ? <NamedTooltip players={players} featured={featured} /> : undefined}''',
'''              content={
                featured ? (
                  <NamedTooltip players={players} featured={featured} benchmark={benchmark} />
                ) : undefined
              }'''
),
(
'''                money(realValueOf(item, value)),
                labelFor(players, String(item.dataKey)),
              ]}''',
'''                money(realValueOf(item, value)),
                String(item.dataKey) === BENCHMARK_KEY
                  ? benchmark?.label ?? "Benchmark"
                  : labelFor(players, String(item.dataKey)),
              ]}'''
),
(
'''              );
            })}
          </LineChart>''',
'''              );
            })}
            {/* Drawn LAST so it sits on top of the class, and dashed so it reads
                as "the thing you are measured against", not another player. */}
            {benchmark ? (
              <Line
                key={BENCHMARK_KEY}
                type="monotone"
                dataKey={BENCHMARK_KEY}
                name={benchmark.label}
                stroke={COLOR.ink}
                strokeDasharray="6 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ) : null}
          </LineChart>'''
),
(
'''function NamedTooltip({
  players,
  featured,
  active,
  payload,
  label,
}: {
  players: PlayerRow[];
  featured: Set<string>;
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((e) => featured.has(String(e.dataKey)));''',
'''function NamedTooltip({
  players,
  featured,
  benchmark,
  active,
  payload,
  label,
}: {
  players: PlayerRow[];
  featured: Set<string>;
  benchmark?: { label: string; series: number[] } | null;
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // The benchmark is never culled — it is the point of comparison.
  const rows = payload.filter(
    (e) => featured.has(String(e.dataKey)) || String(e.dataKey) === BENCHMARK_KEY,
  );'''
),
(
'''        <div key={String(e.dataKey)} style={{ color: e.color }}>
          {labelFor(players, String(e.dataKey))} : {money(realValueOf(e, e.value ?? 0))}
        </div>''',
'''        <div key={String(e.dataKey)} style={{ color: e.color }}>
          {String(e.dataKey) === BENCHMARK_KEY
            ? benchmark?.label ?? "Benchmark"
            : labelFor(players, String(e.dataKey))}{" "}
          : {money(realValueOf(e, e.value ?? 0))}
        </div>'''
),
])
