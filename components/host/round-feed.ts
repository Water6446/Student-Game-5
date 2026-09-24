import type { AllocationRow, PlayerRow, RoundRow, SessionRow } from "@/lib/game/db";
import { revealedRounds } from "@/lib/game/results";
import { isManager, isPortfolio } from "@/lib/game/types";
import { money, signedMoney, signedPct } from "@/lib/game/format";
import type { TickerItem } from "@/components/terminal";

/**
 * What the latest revealed round did, for the ticker tape and the key-figure
 * strip. Humans only: the bots are benchmarks, not the class. Pure — derived
 * from the same rows every other host view reads, so the tape can never
 * disagree with the standings under it.
 */
export interface RoundFeed {
  /** the latest revealed round, or null before the first reveal */
  last: RoundRow | null;
  humans: PlayerRow[];
  avgWealth: number;
  /** mean change over the latest round, across humans who had a row in it */
  avgDelta: number | null;
  leader: PlayerRow | null;
  best: { player: PlayerRow; delta: number } | null;
  worst: { player: PlayerRow; delta: number } | null;
  busted: number;
  /** dollars at risk in the latest round, humans only */
  atRisk: number;
}

export function roundFeed(
  players: PlayerRow[],
  rounds: RoundRow[],
  allocations: AllocationRow[],
): RoundFeed {
  const humans = players.filter((p) => !p.is_bot);
  const avgWealth =
    humans.length > 0 ? humans.reduce((s, p) => s + Number(p.current_wealth), 0) / humans.length : 0;
  const leader = [...humans].sort((a, b) => Number(b.current_wealth) - Number(a.current_wealth))[0] ?? null;
  const busted = humans.filter((p) => Number(p.current_wealth) <= 0).length;

  const revealed = revealedRounds(rounds);
  const last = revealed[revealed.length - 1] ?? null;
  let avgDelta: number | null = null;
  let best: RoundFeed["best"] = null;
  let worst: RoundFeed["worst"] = null;
  let atRisk = 0;
  if (last) {
    const byId = new Map(humans.map((p) => [p.id, p]));
    const deltas: { player: PlayerRow; delta: number }[] = [];
    for (const a of allocations) {
      const p = a.round_id === last.id ? byId.get(a.player_id) : undefined;
      if (!p || a.resulting_wealth == null) continue;
      atRisk += Number(a.risky_amount);
      deltas.push({
        player: p,
        delta: Number(a.resulting_wealth) - (Number(a.risky_amount) + Number(a.safe_amount)),
      });
    }
    if (deltas.length > 0) {
      avgDelta = deltas.reduce((s, d) => s + d.delta, 0) / deltas.length;
      const sorted = [...deltas].sort((a, b) => b.delta - a.delta);
      if (sorted[0].delta > 0.005) best = sorted[0];
      if (sorted[sorted.length - 1].delta < -0.005) worst = sorted[sorted.length - 1];
    }
  }
  return { last, humans, avgWealth, avgDelta, leader, best, worst, busted, atRisk };
}

const dirOf = (n: number | null | undefined): TickerItem["dir"] =>
  n == null || Math.abs(n) < 0.005 ? undefined : n > 0 ? "up" : "down";

/** The ticker tape: the latest round's verdict, then the class's numbers. */
export function tickerItems(session: SessionRow, feed: RoundFeed): TickerItem[] {
  const { last } = feed;
  if (!last) return [];
  const unit = isManager(session.config) ? "Year" : "Round";
  const items: TickerItem[] = [];

  if (isManager(session.config) && last.market_return != null) {
    const r = Number(last.market_return);
    items.push({ key: "mkt", label: `${unit} ${last.round_number} · Index`, value: signedPct(r * 100, 1), dir: dirOf(r) });
  } else if (isPortfolio(session.config) && last.market_outcomes?.length) {
    const up = last.market_outcomes.filter((o) => o === "good").length;
    const n = last.market_outcomes.length;
    items.push({ key: "mkt", label: `${unit} ${last.round_number} · Assets`, value: `${up}/${n} up`, dir: dirOf(up - (n - up)) });
  } else if (last.market_outcome) {
    const good = last.market_outcome === "good";
    items.push({ key: "mkt", label: `${unit} ${last.round_number} · Market`, value: good ? "Up" : "Down", dir: good ? "up" : "down" });
  } else {
    items.push({ key: "mkt", label: `${unit} ${last.round_number}`, value: "Each player drew their own market" });
  }

  items.push({ key: "avg", label: "Class average", value: money(feed.avgWealth) });
  if (feed.avgDelta != null) {
    items.push({ key: "avgd", label: "Average move", value: signedMoney(feed.avgDelta), dir: dirOf(feed.avgDelta) });
  }
  if (feed.leader) {
    items.push({ key: "lead", label: "Leader", value: `${feed.leader.display_name} ${money(feed.leader.current_wealth)}` });
  }
  if (feed.best) {
    items.push({ key: "best", label: "Best move", value: `${feed.best.player.display_name} ${signedMoney(feed.best.delta)}`, dir: "up" });
  }
  if (feed.worst) {
    items.push({ key: "worst", label: "Worst move", value: `${feed.worst.player.display_name} ${signedMoney(feed.worst.delta)}`, dir: "down" });
  }
  items.push({ key: "risk", label: "Was at risk", value: money(feed.atRisk) });
  if (feed.busted > 0) {
    items.push({ key: "bust", label: "Wiped out", value: `${feed.busted} at $0`, dir: "down" });
  }
  return items;
}
