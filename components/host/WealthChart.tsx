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

// A distinct, readable palette; players cycle through it.
const COLORS = [
  "#818cf8", "#34d399", "#f472b6", "#fbbf24", "#22d3ee", "#a78bfa",
  "#f87171", "#4ade80", "#e879f9", "#60a5fa", "#facc15", "#2dd4bf",
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
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-800/40 text-sm text-slate-500">
        The wealth chart appears after the first round is revealed.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="round"
            stroke="#64748b"
            fontSize={12}
            label={{ value: "Round", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 12 }}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            width={56}
            tickFormatter={(v: number) => money(v)}
          />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}
            labelStyle={{ color: "#94a3b8" }}
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
