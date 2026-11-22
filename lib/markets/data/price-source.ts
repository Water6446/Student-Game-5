// The vendor boundary for market data. Every data vendor (the free dev source
// now, a licensed source before real classes) is one adapter that returns these
// Source* shapes; normalize.ts turns them into the one internal format the
// loader, the engine and the tests use. Swapping vendors is a new adapter plus a
// re-import: nothing past this file knows which vendor the numbers came from.
//
// Dates on this side are ISO "YYYY-MM-DD" strings (exchange-local trading dates).
// Day keys (normalize.ts) replace them on the internal side.

/** How a security left the market, when it did. */
export type DelistingType = "bankruptcy" | "cash_acquisition" | "stock_merger";

/** What a vendor's licence allows. Dev-only data must never be shown publicly. */
export type SourceLicense = "dev-only" | "display-licensed";

export interface SourceBar {
  date: string;
  /** null when the vendor only has a close for that date */
  open: number | null;
  high: number | null;
  low: number | null;
  /** null or non-positive rows are dropped by the normalizer */
  close: number | null;
}

export interface SourceDividend {
  /** ex-dividend date */
  exDate: string;
  /** cash per share, in the same share units as the bars */
  amount: number;
}

export interface SourceSplit {
  date: string;
  /** new shares per old share: a 2-for-1 split is 2, a 1-for-10 reverse split is 0.1 */
  ratio: number;
}

export interface SourceDelisting {
  /** last day the security traded */
  date: string;
  type: DelistingType;
  /**
   * Per share, in bar units. bankruptcy: the recovery value (usually 0);
   * cash_acquisition: the deal price; stock_merger: the final price (v1 cashes
   * a stock merger out at it, see MECHANICS.md).
   */
  value: number;
}

export interface SourceDatedValue {
  date: string;
  value: number;
}

export interface SourceSecurity {
  /** the vendor's symbol for this history */
  symbol: string;
  /** the vendor's name for it, used to check the curated universe mapping */
  name?: string;
  bars: SourceBar[];
  /** true when OHLC are already split-adjusted (Yahoo: yes) */
  barsSplitAdjusted: boolean;
  dividends: SourceDividend[];
  /** true when dividend amounts are already split-adjusted (Yahoo: yes) */
  dividendsSplitAdjusted: boolean;
  splits: SourceSplit[];
  delisting?: SourceDelisting | null;
  /** optional; free sources rarely have either */
  marketCap?: SourceDatedValue[];
  sharesOutstanding?: SourceDatedValue[];
}

export interface SourceSecurityRequest {
  symbol: string;
  from: string;
  to: string;
}

/** Individual securities: bars, dividends, splits, delistings, size. */
export interface PriceSource {
  readonly id: string;
  readonly license: SourceLicense;
  fetchSecurity(req: SourceSecurityRequest): Promise<SourceSecurity>;
}

/** A short-rate series, in PERCENT per year as published (DTB3 style). */
export interface RateSource {
  readonly id: string;
  readonly license: SourceLicense;
  fetchShortRate(): Promise<{ date: string; percent: number | null }[]>;
}

/** Daily total returns of the whole market, as decimals (0.01 = +1%). */
export interface IndexSource {
  readonly id: string;
  readonly license: SourceLicense;
  fetchDailyTotalReturns(): Promise<{ date: string; ret: number }[]>;
}
