"use client";

import type { AllocationRow, RoundRow } from "@/lib/game/db";
import type { SessionConfig } from "@/lib/game/types";
import { borrowRate, managerMathConfig, managerName, numManagers } from "@/lib/game/manager";
import { money, signedMoney, signedPct } from "@/lib/game/format";
import { ArrowDown, ArrowUp } from "@/components/icons";

/**
 * One year's result for one player.
 *
 * EVERY manager's return is shown, held or not — inference from results is the
 * game, and a student who only sees the funds they own cannot play it. The
 * market return sits at the top because relative performance is the only thing
 * that matters here; students should be doing that subtraction in their heads
 * by year five.
 */
export function ManagerYearResult({
  config,
  round,
  allocation,
  startWealth,
}: {
  config: SessionConfig;
  round: RoundRow;
  allocation: AllocationRow | null;
  /** wealth at the START of the year (risky + safe on the row) */
  startWealth: number;
}) {
  const n = numManagers(config);
  const cfg = managerMathConfig(config);
  const returns = round.manager_returns ?? [];
  const rMarket = round.market_return ?? null;
  const held = (allocation?.risky_breakdown ?? []) as number[];
  const fees = allocation?.fees_paid == null ? 0 : Number(allocation.fees_paid);
  const allocated = allocation ? Number(allocation.risky_amount) : 0;
  const borrowed = Math.max(allocated - startWealth, 0);
  const borrowCost = borrowed * borrowRate(cfg);
  const endWealth =
    allocation?.resulting_wealth == null ? startWealth : Number(allocation.resulting_wealth);
  const delta = endWealth - startWealth;
  const yourPct = startWealth > 0 ? (delta / startWealth) * 100 : 0;

  return (
    <div className="space-y-2 text-left">
      {rMarket != null ? (
        <div className="flex items-baseline justify-between rounded-xl border-2 border-ink bg-paper-2 px-3 py-2 shadow-card">
          <span className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
            The market
          </span>
          <span
            className={`font-mono text-lg font-black ${rMarket >= 0 ? "text-gain" : "text-loss"}`}
          >
            {signedPct(rMarket * 100, 1)}
          </span>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {Array.from({ length: n }, (_, i) => {
          const r = returns[i];
          const amount = Number(held[i] ?? 0);
          const good = (r ?? 0) >= 0;
          const share = startWealth > 0 ? Math.round((amount / startWealth) * 100) : 0;
          return (
            <li key={i} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">{managerName(config, i)}</span>
              <span
                className={`flex w-20 shrink-0 items-center justify-end gap-0.5 font-mono font-bold ${
                  good ? "text-gain" : "text-loss"
                }`}
              >
                {r == null ? "—" : signedPct(r * 100, 1)}
                {r == null ? null : good ? <ArrowUp /> : <ArrowDown />}
              </span>
              {allocation ? (
                <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-subtle">
                  {amount > 0 ? `you held ${share}%` : "—"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {allocation ? (
        <>
      <dl className="space-y-1 border-t-2 border-ink pt-2 font-mono text-sm">
        <Row label="Fees this year" value={-fees} />
        {borrowed > 0 ? <Row label="Borrowing cost" value={-borrowCost} /> : null}
      </dl>

      <div className="flex items-baseline justify-between border-t-2 border-ink pt-2">
        <span className="font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
          Your year
        </span>
        <span className="font-mono text-sm text-ink">
          {money(startWealth)} → <span className="font-black">{money(endWealth)}</span>{" "}
          <span className={delta >= 0 ? "text-gain" : "text-loss"}>
            ({signedPct(yourPct, 1)})
          </span>
        </span>
      </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={value < 0 ? "font-bold text-loss" : "text-ink"}>{signedMoney(value)}</dd>
    </div>
  );
}
