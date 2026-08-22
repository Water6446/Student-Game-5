"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AllocationRow, PlayerRow, RoundRow } from "@/lib/game/db";
import { money } from "@/lib/game/format";
import { COLOR, SERIES_COLORS } from "@/lib/design/colors";
import { Toggle } from "@/components/ui";
import { useSyncedPreference } from "@/components/use-synced-preference";

type ChartRow = { round: number } & Record<string, number>;

/**
 * Reserved series key for the benchmark line. Not a player id, so it is never
 * culled by the crowded-chart logic and never appears in the players map.
 */
const BENCHMARK_KEY = "__benchmark";

/** The subset of a Recharts tooltip entry this chart reads. */
interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: ChartRow;
}

export const WealthChart = memo(function WealthChart({
  players,
  rounds,
  allocations,
  startingWealth,
  hideToggle,
  benchmark,
  unitLabel = "Round",
}: {
  players: PlayerRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
  startingWealth: number;
  hideToggle?: boolean;
  /** manager game: the index students are measured against. series[i] = value
   *  after round i+1. Drawn last, dashed, and never culled. */
  benchmark?: { label: string; series: number[] } | null;
  /** what one step on the X axis is called — "Year" in the manager game */
  unitLabel?: string;
}) {
  const [useLogScale, setUseLogScale] = useSyncedPreference("wealthChartLogScale", false);

  // A 72px Y axis eats a fifth of a 375px viewport. Narrow it on phones only —
  // false on the server and on first paint, so desktop renders unchanged.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // The Index bot IS the benchmark: its dashed ghost line is already drawn
  // from rounds.market_return, which is the exact series the bot compounds. A
  // second, solid, palette-coloured copy of the same line only duplicated it —
  // and, worse, toggling bots re-indexed every other player's colour, so the
  // one student on the chart flipped hue whenever the toggle moved. Solid
  // lines are for competitors; the benchmark is always and only dashed ink.
  const linePlayers = useMemo(
    () => (benchmark ? players.filter((p) => p.strategy !== "index") : players),
    [players, benchmark],
  );

  const data = useMemo<ChartRow[]>(() => {
    const revealed = rounds
      .filter((r) => r.status === "revealed")
      .sort((a, b) => a.round_number - b.round_number);
    if (revealed.length === 0) return [];

    const roundNumberById = new Map(rounds.map((r) => [r.id, r.round_number]));
    // key `${roundNumber}:${playerId}` -> resulting wealth
    const wealth = new Map<string, number>();
    for (const a of allocations) {
      const rn = roundNumberById.get(a.round_id);
      if (rn == null || a.resulting_wealth == null) continue;
      wealth.set(`${rn}:${a.player_id}`, Number(a.resulting_wealth));
    }

    const maxRound = revealed[revealed.length - 1].round_number;
    const rows: ChartRow[] = [];
    // Round 0 = everyone at the starting wealth.
    const start: ChartRow = { round: 0 };
    linePlayers.forEach((p) => (start[p.id] = startingWealth));
    if (benchmark) start[BENCHMARK_KEY] = startingWealth;
    rows.push(start);

    // carry the last known wealth forward for players missing a round (late join).
    const last = new Map<string, number>(linePlayers.map((p) => [p.id, startingWealth]));
    for (let rn = 1; rn <= maxRound; rn++) {
      const row: ChartRow = { round: rn };
      linePlayers.forEach((p) => {
        const w = wealth.get(`${rn}:${p.id}`);
        if (w != null) last.set(p.id, w);
        const realVal = last.get(p.id) ?? startingWealth;
        // Recharts log scale crashes on <= 0. Clamp to 1 for plotting.
        const plotVal = (useLogScale && realVal <= 0) ? 1 : realVal;
        row[p.id] = plotVal;
        row[`${p.id}_real`] = realVal;
      });
      if (benchmark) {
        const realVal = benchmark.series[rn - 1] ?? startingWealth;
        row[BENCHMARK_KEY] = useLogScale && realVal <= 0 ? 1 : realVal;
        row[`${BENCHMARK_KEY}_real`] = realVal;
      }
      rows.push(row);
    }
    return rows;
  }, [linePlayers, rounds, allocations, startingWealth, useLogScale, benchmark]);

  // 100 students is 100 overlapping lines in a 12-colour palette: illegible and
  // slow. Above the palette size, only the top 8 and bottom 2 by final wealth
  // keep a colour and a tooltip entry; everyone else becomes quiet ink.
  const featured = useMemo<Set<string> | null>(() => {
    if (linePlayers.length <= SERIES_COLORS.length || data.length === 0) return null;
    const last = data[data.length - 1];
    const finalOf = (id: string) => Number(last[`${id}_real`] ?? last[id] ?? 0);
    const ranked = [...linePlayers].sort((a, b) => finalOf(b.id) - finalOf(a.id));
    return new Set([...ranked.slice(0, 8), ...ranked.slice(-2)].map((p) => p.id));
  }, [linePlayers, data]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-ink bg-paper-2 font-editorial text-sm italic text-ink-subtle">
        The wealth chart appears after the first round is revealed.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="h-56 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR.ink} strokeOpacity={0.12} />
            <XAxis
              dataKey="round"
              stroke={COLOR.ink}
              fontSize={12}
              fontFamily="var(--font-mono)"
              label={{
                value: unitLabel,
                position: "insideBottom",
                offset: -2,
                fill: COLOR.inkMuted,
                fontSize: 12,
              }}
            />
            <YAxis
              scale={useLogScale ? "log" : "linear"}
              domain={useLogScale ? ["auto", "auto"] : [0, "auto"]}
              stroke={COLOR.ink}
              fontSize={12}
              fontFamily="var(--font-mono)"
              width={compact ? 52 : 72}
              tickFormatter={(v: number) => {
                if (Math.abs(v) >= 1_000_000) {
                  const sign = v < 0 ? "-" : "";
                  return sign + "$" + Math.abs(v).toExponential(1);
                }
                return money(v);
              }}
            />
            <Tooltip
              contentStyle={{
                background: COLOR.surface,
                border: TOOLTIP_BORDER,
                borderRadius: 12,
                fontFamily: "var(--font-mono)",
              }}
              labelStyle={{ color: COLOR.inkMuted }}
              // Only swap in a custom body when there is something to filter out,
              // so an ordinary chart keeps the default Recharts tooltip exactly.
              content={
                featured ? (
                  <NamedTooltip
                      players={players}
                      featured={featured}
                      benchmark={benchmark}
                      unitLabel={unitLabel}
                    />
                ) : undefined
              }
              formatter={(value: number, _name: string, item: TooltipEntry) => [
                money(realValueOf(item, value)),
                String(item.dataKey) === BENCHMARK_KEY
                  ? benchmark?.label ?? "Benchmark"
                  : labelFor(players, String(item.dataKey)),
              ]}
              labelFormatter={(l) => `${unitLabel} ${l}`}
            />
            {linePlayers.map((p, i) => {
              const named = featured == null || featured.has(p.id);
              return (
                <Line
                  key={p.id}
                  type="monotone"
                  dataKey={p.id}
                  name={p.display_name}
                  stroke={named ? SERIES_COLORS[i % SERIES_COLORS.length] : COLOR.ink}
                  strokeOpacity={named ? 1 : 0.12}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              );
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
          </LineChart>
        </ResponsiveContainer>
      </div>

      {featured ? (
        <p className="text-center font-editorial text-xs italic text-ink-subtle">
          Showing the top 8 and bottom 2 by name; the rest are shown in grey.
        </p>
      ) : null}

      {!hideToggle ? (
        <div className="flex justify-start">
          <Toggle
            label="Log scale"
            checked={useLogScale}
            onChange={setUseLogScale}
            className="w-auto gap-4"
          />
        </div>
      ) : null}
    </div>
  );
});

/** Recharts needs a real colour string here, not a Tailwind class. */
const TOOLTIP_BORDER = "2px solid " + COLOR.ink;

function labelFor(players: PlayerRow[], id: string): string {
  return players.find((p) => p.id === id)?.display_name ?? id;
}

/** The plotted value is clamped for the log scale; the tooltip shows the real one. */
function realValueOf(item: TooltipEntry, fallback: number): number {
  const real = item.payload?.[`${String(item.dataKey)}_real`];
  return real !== undefined ? real : fallback;
}

/**
 * Tooltip body for the crowded case: the grey "rest of the class" lines carry no
 * entry, so hovering a 100-player chart lists 10 names instead of 100. Styling
 * mirrors the default contentStyle/labelStyle above.
 */
function NamedTooltip({
  players,
  featured,
  benchmark,
  unitLabel = "Round",
  active,
  payload,
  label,
}: {
  players: PlayerRow[];
  featured: Set<string>;
  benchmark?: { label: string; series: number[] } | null;
  unitLabel?: string;
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // The benchmark is never culled — it is the point of comparison.
  const rows = payload.filter(
    (e) => featured.has(String(e.dataKey)) || String(e.dataKey) === BENCHMARK_KEY,
  );
  if (rows.length === 0) return null;
  return (
    <div
      style={{
        background: COLOR.surface,
        border: TOOLTIP_BORDER,
        borderRadius: 12,
        fontFamily: "var(--font-mono)",
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: COLOR.inkMuted, marginBottom: 4 }}>
        {unitLabel} {label}
      </div>
      {rows.map((e) => (
        <div key={String(e.dataKey)} style={{ color: e.color }}>
          {String(e.dataKey) === BENCHMARK_KEY
            ? benchmark?.label ?? "Benchmark"
            : labelFor(players, String(e.dataKey))}{" "}
          : {money(realValueOf(e, e.value ?? 0))}
        </div>
      ))}
    </div>
  );
}
