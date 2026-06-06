// Display helpers (presentation only; never used for authoritative math).
// Postgres `numeric` arrives from supabase-js as a string, so coerce defensively.

export function money(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return `$${(Number.isFinite(v) ? v : 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function signedMoney(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${money(Math.abs(v))}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
