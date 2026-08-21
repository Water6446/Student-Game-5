import sys
sys.path.insert(0, ".scratch")
from edit import patch

# ManagerYearResult: with no allocation (the host's view) show the year's
# returns only — the "you held" column and personal footer are player-specific.
patch("components/ManagerYearResult.tsx", [
(
'''              <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-subtle">
                {amount > 0 ? `you held ${share}%` : "—"}
              </span>''',
'''              {allocation ? (
                <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-subtle">
                  {amount > 0 ? `you held ${share}%` : "—"}
                </span>
              ) : null}'''
),
(
'''      <dl className="space-y-1 border-t-2 border-ink pt-2 font-mono text-sm">''',
'''      {allocation ? (
        <>
      <dl className="space-y-1 border-t-2 border-ink pt-2 font-mono text-sm">'''
),
(
'''            ({signedPct(yourPct, 1)})
          </span>
        </span>
      </div>
    </div>
  );
}''',
'''            ({signedPct(yourPct, 1)})
          </span>
        </span>
      </div>
        </>
      ) : null}
    </div>
  );
}'''
),
])

# Shell / reveal header: a manager round is a YEAR.
patch("components/student/StudentRound.tsx", [
(
'''          Round {roundNumber} / {session.config.num_rounds}
        </span>''',
'''          {isManager(session.config) ? "Year" : "Round"} {roundNumber} /{" "}
          {session.config.num_rounds}
        </span>'''
),
(
'''      <div className="mb-4 text-center text-sm font-semibold text-ink-muted">
        Round {round.round_number} / {session.config.num_rounds}
      </div>''',
'''      <div className="mb-4 text-center text-sm font-semibold text-ink-muted">
        {manager ? "Year" : "Round"} {round.round_number} / {session.config.num_rounds}
      </div>'''
),
])

# AllocationsBreakdown: the risk meter assumed pct <= 100. Leverage breaks that.
patch("components/host/AllocationsBreakdown.tsx", [
(
'''import { money } from "@/lib/game/format";''',
'''import { money, signedMoney } from "@/lib/game/format";'''
),
(
'''  goodProb,
  portfolio = false,
}: {
  players: PlayerRow[];
  allocations: AllocationRow[];
  goodProb: number;
  /** portfolio game: bot strategies bet a different fixed share */
  portfolio?: boolean;
}) {''',
'''  goodProb,
  portfolio = false,
  levered = false,
}: {
  players: PlayerRow[];
  allocations: AllocationRow[];
  goodProb: number;
  /** portfolio game: bot strategies bet a different fixed share */
  portfolio?: boolean;
  /** manager game: allocations can exceed 100% of wealth, and safe can go negative */
  levered?: boolean;
}) {'''
),
(
'''          const pct = r.pct == null ? null : Math.round(r.pct * 100);
          const safeVal = r.safe == null ? r.wealth : r.safe;''',
'''          const pct = r.pct == null ? null : Math.round(r.pct * 100);
          const safeVal = r.safe == null ? r.wealth : r.safe;
          // The meter tops out at fully invested; anything past that is
          // borrowed, and says so as a multiple rather than overflowing.
          const barPct = Math.min(pct ?? 0, 100);
          const isLevered = levered && pct != null && pct > 100;'''
),
(
'''              <div className="flex h-2.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-24">
                <div className="bg-loss" style={{ width: `${pct ?? 0}%` }} />
                <div className="bg-gain" style={{ width: `${100 - (pct ?? 0)}%` }} />
              </div>''',
'''              <div className="flex shrink-0 items-center gap-1">
                <div className="flex h-2.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-24">
                  <div className="bg-loss" style={{ width: `${barPct}%` }} />
                  <div className="bg-gain" style={{ width: `${100 - barPct}%` }} />
                </div>
                {isLevered ? (
                  <span className="rounded-full border border-ink bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold text-paper">
                    {((pct ?? 0) / 100).toFixed(1)}×
                  </span>
                ) : null}
              </div>'''
),
(
'''                  <span className="text-gain/90">{money(safeVal)}</span>''',
'''                  {safeVal < 0 ? (
                    <span className="font-bold text-loss" title="borrowed">
                      {signedMoney(safeVal)}
                    </span>
                  ) : (
                    <span className="text-gain/90">{money(safeVal)}</span>
                  )}'''
),
])
