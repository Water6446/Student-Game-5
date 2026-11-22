// The synthetic source: lib/markets/data/fixtures.ts behind the PriceSource
// interface, so the importer, loader and size measurement can run end to end
// with no network and no vendor data. Symbols are SYN0..SYNn; the three
// delisting fixtures are SYNBK / SYNCA / SYNSM.

import type { PriceSource, SourceSecurity, SourceSecurityRequest } from "../../../lib/markets/data/price-source";
import { delistingFixtures, syntheticSecurity } from "../../../lib/markets/data/fixtures";

export class FixtureSource implements PriceSource {
  readonly id = "fixture";
  readonly license = "display-licensed" as const; // we made it up; nothing to license

  async fetchSecurity(req: SourceSecurityRequest): Promise<SourceSecurity> {
    const delisting = delistingFixtures() as Record<string, SourceSecurity>;
    const named = Object.values(delisting).find((s) => s.symbol === req.symbol);
    if (named) return named;
    const m = /^SYN(\d+)$/.exec(req.symbol);
    if (!m) throw new Error(`fixture source has no symbol ${req.symbol}`);
    const n = Number(m[1]);
    return syntheticSecurity({
      symbol: req.symbol,
      from: req.from,
      to: req.to,
      startPrice: 5 + ((n * 37) % 120),
      drift: 0.04 + ((n * 13) % 9) / 100,
      vol: 0.18 + ((n * 7) % 20) / 100,
      seed: 1000 + n,
      dividendYield: n % 3 === 0 ? 0 : 0.02 + (n % 4) / 100,
      closeOnlyEvery: n % 10 === 0 ? 3 : undefined,
    });
  }
}
