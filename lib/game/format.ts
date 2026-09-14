// Display helpers (presentation only; never used for authoritative math).
// Postgres `numeric` arrives from supabase-js as a string, so coerce defensively.

export function money(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  const safe = Number.isFinite(v) ? v : 0;
  // Cents are all-or-nothing: $33.6 and $204.2 read as truncated numbers and
  // made a host distrust the fee arithmetic. A whole-dollar amount stays clean
  // ("$100"), anything with a fractional part prints both places ("$33.60").
  const digits = Number.isInteger(safe) ? 0 : 2;
  return `$${safe.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/**
 * A COST, written as a cost: "$2.56", never "−$2.56". Fees and borrowing
 * charges are unambiguously money leaving the player, and a minus sign in front
 * of one reads as a rebate at a glance. Colour (text-loss) carries the sign;
 * the minus is reserved for signed ledgers where a value could go either way.
 */
export function cost(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return money(Math.abs(Number.isFinite(v) ? v : 0));
}

export function signedMoney(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${money(Math.abs(v))}`;
}

/**
 * Signed percentage from PERCENTAGE POINTS: signedPct(12) → "+12%",
 * signedPct(-14) → "−14%" (U+2212, matching signedMoney), signedPct(0) → "0%".
 */
export function signedPct(pctPoints: number | string, digits = 0): string {
  const v = typeof pctPoints === "string" ? Number(pctPoints) : pctPoints;
  const n = Number.isFinite(v) ? v : 0;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

/** Sharpe ratio for display: "1.24" / "−0.33" (U+2212) / "—" when undefined. */
export function sharpeText(sharpe: number | null): string {
  if (sharpe == null) return "—";
  const s = sharpe.toFixed(2);
  return s.startsWith("-") ? `−${s.slice(1)}` : s;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
