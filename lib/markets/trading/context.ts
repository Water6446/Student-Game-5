// The decision context an order carries (market_orders.context, at most 2 KB):
// what the student could see when they placed it, for the research log
// (docs/PAPER_TRADING.md §8, Q14). One builder for the ticket and the one-tap
// Buy, so every order says the same things in the same units. Pure.
//
// It never names the friction arm: the student's screens do not know it, and
// the server already holds it (player_conditions).

export interface DecisionInput {
  /** where the order started: the stock page, a position, the market list, a one-tap Buy */
  from: string;
  ticketMs: number | null;
  reviewMs: number | null;
  /** the amount buttons pressed, most recent last */
  chips: readonly string[];
  mode: "dollars" | "shares";
  round: number;
  secondsLeft: number | null;
  nlv: number;
  cash: number;
  buyingPower: number;
  frozen: boolean;
  /** signed shares held in this instrument before the order */
  position: number;
  unrealized: number;
  holdings: number;
  last: number;
  change: number | null;
  changeBasis: string;
  rank: number | null;
  classSize: number | null;
  /** ms spent on a typed confirmation, when there was one */
  confirmMs?: number | null;
  /** the risk warning accepted ("short" / "margin"), and ms spent on it */
  risk?: string | null;
  riskMs?: number | null;
}

const cents = (x: number) => Math.round(x * 100) / 100;

export function decisionContext(d: DecisionInput): Record<string, unknown> {
  return {
    from: d.from,
    ticket_ms: d.ticketMs,
    review_ms: d.reviewMs,
    chips: d.chips.slice(-5),
    mode: d.mode,
    round: d.round,
    seconds_left: d.secondsLeft,
    nlv: cents(d.nlv),
    cash: cents(d.cash),
    buying_power: cents(d.buyingPower),
    position: d.position,
    unrealized: cents(d.unrealized),
    holdings: d.holdings,
    last: d.last,
    change: d.change,
    change_basis: d.changeBasis,
    rank: d.rank,
    class_size: d.classSize,
    frozen: d.frozen,
    ...(d.confirmMs != null ? { confirm_ms: d.confirmMs } : {}),
    ...(d.risk ? { risk: d.risk, risk_ms: d.riskMs ?? null } : {}),
  };
}

/** The one-tap Buy amounts: 1%, 5% and 10% of the starting cash, in whole dollars. */
export function quickBuyAmounts(startingCash: number): number[] {
  return [...new Set([0.01, 0.05, 0.1].map((f) => Math.max(1, Math.round(startingCash * f))))];
}
