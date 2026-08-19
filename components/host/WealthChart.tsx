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
import { memo, useState, useEffect } from "react";
import { Toggle } from "@/components/ui";

// Academy Arcade series palette — saturated, ink-legible on warm paper.
const COLORS = [
  "#2557E8", "#1F8A4C", "#F0A92B", "#DB3B2B", "#0E7490", "#7C3AED",
  "#211A12", "#15803D", "#E0961A", "#0891B2", "#9333EA", "#DB2777",
];

type ChartRow = { round: number } & Record<string, number>;

export const WealthChart = memo(function WealthChart({
  players,
  rounds,
  allocations,
  startingWealth,
  hideToggle,
}: {
  players: PlayerRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
  startingWealth: number;
  hideToggle?: boolean;
}) {
  const [useLogScale, setUseLogScale] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wealthChartLogScale");
    if (stored === "true") setUseLogScale(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "wealthChartLogScale") {
        setUseLogScale(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleToggle = (v: boolean) => {
    setUseLogScale(v);
    localStorage.setItem("wealthChartLogScale", String(v));
  };

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
        const realVal = last.get(p.id) ?? startingWealth;
        // Recharts log scale crashes on <= 0. Clamp to 1 for plotting.
        const plotVal = (useLogScale && realVal <= 0) ? 1 : realVal;
        row[p.id] = plotVal;
        row[`${p.id}_real`] = realVal;
      });
      rows.push(row);
    }
    return rows;
  }, [players, rounds, allocations, startingWealth, useLogScale]);

  // 100 students is 100 overlapping lines in a 12-colour palette: illegible and
  // slow. Above the palette size, only the top 8 and bottom 2 by final wealth
  // keep a colour and a tooltip entry; everyone else becomes quiet ink.
  const featured = useMemo<Set<string> | null>(() => {
    if (players.length <= COLORS.length || data.length === 0) return null;
    const last = data[data.length - 1];
    const finalOf = (id: string) => Number(last[`${id}_real`] ?? last[id] ?? 0);
    const ranked = [...players].sort((a, b) => finalOf(b.id) - finalOf(a.id));
    return new Set([...ranked.slice(0, 8), ...ranked.slice(-2)].map((p) => p.id));
  }, [players, data]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-ink bg-paper-2 font-editorial text-sm italic text-ink-subtle">
        The wealth chart appears after the first round is revealed.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#211A12" strokeOpacity={0.12} />
          <XAxis
            dataKey="round"
            stroke="#211A12"
            fontSize={12}
            fontFamily="var(--font-mono)"
            label={{ value: "Round", position: "insideBottom", offset: -2, fill: "#6B5C40", fontSize: 12 }}
          />
          <YAxis
            scale={useLogScale ? "log" : "linear"}
            domain={useLogScale ? ["auto", "auto"] : [0, "auto"]}
            stroke="#211A12"
            fontSize={12}
            fontFamily="var(--font-mono)"
            width={72}
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000) {
                const sign = v < 0 ? "-" : "";
                return sign + "$" + Math.abs(v).toExponential(1);
              }
              return money(v);
            }}
          />
          <Tooltip
            contentStyle={{ background: "#FFFDF6", border: "2px solid #211A12", borderRadius: 12, fontFamily: "var(--font-mono)" }}
            labelStyle={{ color: "#6B5C40" }}
            // Only swap in a custom body when there is something to filter out,
            // so the ordinary chart keeps Recharts' default tooltip exactly.
            content={featured ? <NamedTooltip players={players} featured={featured} /> : undefined}
            formatter={(value: number, _name: any, item: any) => {
              const realValue = item.payload[`${item.dataKey}_real`];
              const displayVal = realValue !== undefined ? realValue : value;
              return [money(displayVal), labelFor(players, item?.dataKey as string)];
            }}
            labelFormatter={(l) => `Round ${l}`}
          />
          {players.map((p, i) => {
            const named = featured == null || featured.has(p.id);
            return (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                name={p.display_name}
                stroke={named ? COLORS[i % COLORS.length] : "#211A12"}
                strokeOpacity={named ? 1 : 0.12}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
    {featured ? (
      <p className="text-center font-editorial text-xs italic text-ink-subtle">
        Showing the top 8 and bottom 2 by name; the rest are shown in grey.
      </p>
    ) : null}
    {!hideToggle && (
      <div className="flex justify-start">
        <Toggle
          label="Log scale"
          checked={useLogScale}
          onChange={handleToggle}
          className="w-auto gap-4"
        />
      </div>
    )}
    </div>
  );
});

function labelFor(players: PlayerRow[], id: string): string {
  return players.find((p) => p.id === id)?.display_name ?? id;
}

/**
 * Tooltip body for the crowded case: the grey "rest of the class" lines carry no
 * entry, so hovering a 100-player chart lists 10 names instead of 100. Styling
 * mirrors the default contentStyle/labelStyle above.
 */
function NamedTooltip({
  players,
  featured,
  active,
  payload,
  label,
}: {
  players: PlayerRow[];
  featured: Set<string>;
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number; color?: string; payload?: ChartRow }[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((e) => featured.has(String(e.dataKey)));
  if (rows.length === 0) return null;
  return (
    <div
      style={{
        background: "#FFFDF6",
        border: "2px solid #211A12",
        borderRadius: 12,
        fontFamily: "var(--font-mono)",
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#6B5C40", marginBottom: 4 }}>Round {label}</div>
      {rows.map((e) => {
        const key = String(e.dataKey);
        const real = e.payload?.[`${key}_real`];
        return (
          <div key={key} style={{ color: e.color }}>
            {labelFor(players, key)} : {money(real !== undefined ? real : e.value ?? 0)}
          </div>
        );
      })}
    </div>
  );
}
