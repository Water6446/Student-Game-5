// DEV ONLY: the end-of-game reveal for the preview's synthetic session, shaped
// like get_trading_reveal (0036). The era is made up, so showing it is fine.

import type { TradingReveal } from "@/lib/markets/db";
import { seededRandom } from "@/lib/markets/data/fixtures";
import { annualTurnover } from "@/lib/markets/trading/stats";
import { PREVIEW_CONFIG, PREVIEW_INSTRUMENTS, PREVIEW_START_YEAR, type PreviewWorld } from "./fixtures";

const realDate = (gameDay: number) =>
  new Date(Date.UTC(PREVIEW_START_YEAR, 0, 1) + gameDay * 86_400_000).toISOString().slice(0, 10);

const seeded = (k: number) => seededRandom(7000 + k)();

/** The reveal as a student (`forHost` false: classmates unnamed) or the host would get it. */
export function previewReveal(world: PreviewWorld, forHost: boolean): TradingReveal {
  const start = PREVIEW_CONFIG.starting_wealth;
  const periods = world.periods
    .filter((p) => p.first_game_day != null && p.last_game_day != null)
    .sort((a, b) => a.round_number - b.round_number);
  const index = periods.reduce((v, p) => v * (1 + Number(p.index_return ?? 0)), 1) - 1;
  const myTurnover = annualTurnover(
    world.accountRounds.map((a) => Number(a.traded)),
    world.accountRounds.map((a) => Number(a.nlv_start)),
    "quarter",
  );
  const last = periods.length ? realDate(periods[periods.length - 1].last_game_day as number) : null;
  return {
    start_year: PREVIEW_START_YEAR,
    window_first_date: world.truth.window_first_date,
    window_last_date: world.truth.window_last_date,
    played_last_date: last,
    starting_cash: start,
    index_return: periods.length ? Math.round(index * 1e6) / 1e6 : null,
    periods: periods.map((p) => ({
      round: p.round_number,
      first_date: realDate(p.first_game_day as number),
      last_date: realDate(p.last_game_day as number),
      index_return: p.index_return == null ? null : Number(p.index_return),
      headlines: p.headlines.slice(0, 2).map((h) => ({
        month: `${PREVIEW_START_YEAR + h.y - 1}-${String(h.m).padStart(2, "0")}`,
        text: h.text,
      })),
    })),
    instruments: PREVIEW_INSTRUMENTS.map((i, k) => ({
      slot: i.slot,
      kind: i.kind,
      sector: i.sector,
      name: i.name,
      ticker: i.ticker,
      // made up: the preview's companies are synthetic
      real_name: i.kind === "index_fund" ? "Total market index" : `Example Company ${k}`,
      real_ticker: i.kind === "index_fund" ? "IDX" : `EX${k}`,
      current_name: i.kind === "index_fund" ? "Total market index" : k % 4 === 1 ? `Example Holdings ${k}` : `Example Company ${k}`,
      price_change: Math.round((seeded(k) - 0.4) * 1.2 * 1e4) / 1e4,
    })),
    my_fills: forHost
      ? []
      : world.fills.map((f) => ({
          round: f.round_number,
          date: realDate(f.game_day),
          slot: f.slot,
          side: f.side,
          quantity: Number(f.quantity),
          price: Number(f.price),
          notional: Number(f.notional),
          reason: f.reason,
        })),
    class: world.standings.map((s, k) => ({
      player_id: forHost ? s.player_id : null,
      name: forHost || s.is_me ? s.display_name : null,
      is_me: !forHost && s.is_me,
      nlv: s.nlv,
      return: Math.round((s.nlv / start - 1) * 1e6) / 1e6,
      turnover: s.is_me ? Math.round(myTurnover * 1e4) / 1e4 : Math.round(seeded(k + 50) * 3.5 * 1e4) / 1e4,
      sharpe: s.sharpe,
      max_drawdown: s.max_drawdown,
      trades: s.is_me ? world.fills.length : Math.round(seeded(k + 80) * 20),
    })),
  };
}
