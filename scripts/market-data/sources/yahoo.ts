// DEVELOPMENT-ONLY adapter: Yahoo Finance through the unofficial yahoo-finance2
// package. Yahoo's terms do not allow showing this data to other users, so it
// must never reach the production database (docs/PAPER_TRADING_DATA.md).
//
// Checked against real output (2026-11-19): chart() OHLC are split-adjusted
// (AAPL around its 2020 4:1 split), and dividend amounts are split-adjusted too
// (KO's 2012 2:1 split: $0.255 a quarter, not $0.51). `adjclose` additionally
// folds dividends in, which the game does NOT want, so it is ignored.
// Yahoo returns nothing at all for a delisted symbol: dev data is survivors only.

import YahooFinance from "yahoo-finance2";
import type { PriceSource, SourceSecurity, SourceSecurityRequest } from "../../../lib/markets/data/price-source";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export class YahooSource implements PriceSource {
  readonly id = "yahoo";
  readonly license = "dev-only" as const;
  private yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  async fetchSecurity(req: SourceSecurityRequest): Promise<SourceSecurity> {
    const res = await this.yf.chart(req.symbol, {
      period1: req.from,
      period2: req.to,
      interval: "1d",
      events: "div|split",
    });
    const meta = res.meta as { longName?: string; shortName?: string };
    return {
      symbol: req.symbol,
      name: meta.longName ?? meta.shortName,
      // Yahoo stamps each daily bar at the 09:30 New York open in UTC (13:30 or
      // 14:30Z), so the UTC calendar date IS the trading date.
      bars: res.quotes.map((q) => ({
        date: isoDate(q.date),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
      })),
      barsSplitAdjusted: true,
      dividends: (res.events?.dividends ?? []).map((d) => ({ exDate: isoDate(d.date), amount: d.amount })),
      dividendsSplitAdjusted: true,
      splits: (res.events?.splits ?? []).map((s) => ({
        date: isoDate(s.date),
        ratio: s.numerator / s.denominator,
      })),
      delisting: null,
    };
  }
}
