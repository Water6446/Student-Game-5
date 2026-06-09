"use client";

import { useMemo } from "react";
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

// A distinct, readable palette tuned for the light parchment background.
const COLORS = [
  "#A16207", "#047857", "#7C3AED", "#BE123C", "#0E7490", "#B45309",
  "#1D4ED8", "#15803D", "#9333EA", "#0891B2", "#CA8A04", "#DB2777",
];

type ChartRow = { round: number } & Record<string, number>;

export function WealthChart({
  players,
  rounds,
  allocations,
  startingWealth,
}: {
  players: PlayerRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
  startingWealth: number;
}) {
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
    players.forEach((p) => (start[p.id] = startingWealth));
    rows.push(start);

    // carry the last known wealth forward for players missing a round (late join).
    const last = new Map<string, number>(players.map((p) => [p.id, startingWealth]));
    for (let rn = 1; rn <= maxRound; rn++) {
      const row: ChartRow = { round: rn };
      players.forEach((p) => {
        const w = wealth.get(`${rn}:${p.id}`);
        if (w != null) last.set(p.id, w);
        row[p.id] = last.get(p.id) ?? startingWealth;
      });
      rows.push(row);
    }
    return rows;
  }, [players, rounds, allocations, startingWealth]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-line bg-paper-2 text-sm text-ink-subtle">
        The wealth chart appears after the first round is revealed.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E0D2" />
          <XAxis
            dataKey="round"
            stroke="#78716C"
            fontSize={12}
            label={{ value: "Round", position: "insideBottom", offset: -2, fill: "#78716C", fontSize: 12 }}
          />
          <YAxis
            stroke="#78716C"
            fontSize={12}
            width={56}
            tickFormatter={(v: number) => money(v)}
          />
          <Tooltip
            contentStyle={{ background: "#FFFEFB", border: "1px solid #D6CCB8", borderRadius: 12 }}
            labelStyle={{ color: "#57534E" }}
            formatter={(value: number, _name, item) => [money(value), labelFor(players, item?.dataKey as string)]}
            labelFormatter={(l) => `Round ${l}`}
          />
          {players.map((p, i) => (
            <Line
              key={p.id}
              type="monotone"
              dataKey={p.id}
              name={p.display_name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function labelFor(players: PlayerRow[], id: string): string {
  return players.find((p) => p.id === id)?.display_name ?? id;
}
