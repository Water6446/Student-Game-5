import { notFound } from "next/navigation";
import { marketsEnabled } from "@/lib/markets/flags";

// The whole Markets section is dark unless NEXT_PUBLIC_ENABLE_MARKETS is
// "true" (docs/PAPER_TRADING_DATA.md §1): every route under /markets 404s.
// The flag is inlined at build time, so production builds without it carry
// these pages only as a 404.
export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  if (!marketsEnabled()) notFound();
  return children;
}
