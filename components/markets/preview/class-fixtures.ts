// DEV ONLY: a synthetic class around the preview student, for the host and
// projector previews. Each classmate's account follows the preview market with
// their own invented beta and luck; the preview student's own figures come from
// the engine (fixtures.ts). Never shipped to students.

import type { AllocationRow, PlayerRow, RoundRow } from "@/lib/game/db";
import type { RoundStatus } from "@/lib/game/types";
import type { TradingStandingRow } from "@/lib/markets/db";
import { seededRandom } from "@/lib/markets/data/fixtures";
import { annualizedSharpe } from "@/lib/markets/trading/stats";
import { PREVIEW_CONFIG, type PreviewWorld } from "./fixtures";

const SESSION = "preview-session";
const NAMES = ["Ava", "Ben", "Chloé", "Dev", "Emeka", "Farah", "Gus", "Hana", "Iris", "Jonah", "Kemi", "Luca"];
const ME = { id: "preview-me", name: "Preview Student" };

const iso = (n: number) => new Date(Date.UTC(2026, 0, 1, 9, 0, n)).toISOString();

export interface PreviewClass {
  players: PlayerRow[];
  standings: TradingStandingRow[];
  rounds: RoundRow[];
  allocations: AllocationRow[];
}

/**
 * The class after `revealed` periods, with round `current` in `status` (null
 * in the lobby). `joined` players have joined so far (the lobby fills up).
 */
export function previewClass(
  world: PreviewWorld,
  revealed: number,
  current: number,
  status: RoundStatus | null,
  joined = NAMES.length + 1,
): PreviewClass {
  const start = PREVIEW_CONFIG.starting_wealth;
  const people = [...NAMES.map((name, k) => ({ id: `p${k}`, name })), ME].slice(0, joined);
  const players: PlayerRow[] = people.map((p, k) => ({
    id: p.id,
    session_id: SESSION,
    display_name: p.name,
    current_wealth: start,
    is_active: true,
    is_bot: false,
    strategy: null,
    joined_at: iso(k),
  }));

  // account value after each revealed period, per player
  const paths = new Map<string, number[]>();
  people.forEach((p, k) => {
    if (p.id === ME.id) {
      paths.set(p.id, world.accountRounds.slice(0, revealed).map((r) => r.nlv_end));
      return;
    }
    const rand = seededRandom(500 + k);
    const beta = 0.4 + rand() * 1.4;
    let v = start;
    const path: number[] = [];
    for (let r = 1; r <= revealed; r++) {
      const market = Number(world.periods[r - 1]?.index_return ?? 0);
      v *= 1 + market * beta + (rand() - 0.5) * 0.08;
      path.push(Math.round(v * 100) / 100);
    }
    paths.set(p.id, path);
  });

  const rounds: RoundRow[] = [];
  for (let n = 1; n <= current; n++) {
    rounds.push({
      id: `r${n}`,
      session_id: SESSION,
      round_number: n,
      status: n < current ? "revealed" : (status ?? "open"),
      market_outcome: null,
      revealed_at: n <= revealed ? iso(100 + n) : null,
      closes_at: null,
    });
  }

  const allocations: AllocationRow[] = [];
  for (const p of people) {
    const path = paths.get(p.id) ?? [];
    path.forEach((end, i) => {
      const before = i === 0 ? start : path[i - 1];
      allocations.push({
        id: `a${p.id}${i + 1}`,
        round_id: `r${i + 1}`,
        player_id: p.id,
        risky_amount: before * 0.7,
        safe_amount: before * 0.3,
        market_outcome: null,
        resulting_wealth: end,
        submitted_at: iso(200 + i),
      });
    });
  }

  const rfs = world.periods.slice(0, revealed).map((p) => Number(p.rf_return ?? 0));
  const rows = people.map((p) => {
    const path = paths.get(p.id) ?? [];
    const nlv = path.length > 0 ? path[path.length - 1] : start;
    let peak = start;
    let dd = 0;
    for (const v of path) {
      peak = Math.max(peak, v);
      dd = Math.max(dd, 1 - v / peak);
    }
    return {
      player_id: p.id,
      display_name: p.name,
      nlv,
      sharpe: annualizedSharpe([start, ...path], rfs, PREVIEW_CONFIG.period),
      max_drawdown: Math.round(dd * 1e4) / 1e4,
      is_me: false,
    };
  });
  rows.sort((a, b) => b.nlv - a.nlv);
  const standings: TradingStandingRow[] = rows.map((r) => ({
    ...r,
    rank: rows.findIndex((x) => x.nlv === r.nlv) + 1,
  }));
  for (const pl of players) pl.current_wealth = rows.find((r) => r.player_id === pl.id)?.nlv ?? start;

  return { players, standings, rounds, allocations };
}
