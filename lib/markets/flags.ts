// Is the Markets section switched on? Off unless NEXT_PUBLIC_ENABLE_MARKETS is
// literally "true" — so production stays dark until a licensed data source is
// loaded (docs/PAPER_TRADING_DATA.md §1). Development sets it in .env.local.
//
// The env var must be read by its literal name for Next.js to inline it at
// build time; the parameter exists for tests.
export function marketsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_ENABLE_MARKETS): boolean {
  return value === "true";
}
