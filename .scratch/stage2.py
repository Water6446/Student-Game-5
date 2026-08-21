import sys
sys.path.insert(0, ".scratch")
from edit import patch

# ── Student: one query now seeds the carry-forward AND totals the fees ───────
patch("components/student/StudentRound.tsx", [
(
'''import { ManagerYearResult } from "@/components/ManagerYearResult";''',
'''import { ManagerYearResult } from "@/components/ManagerYearResult";
import { FeeCounter } from "@/components/FeeCounter";'''
),
(
'''  const [seeded, setSeeded] = useState<(number | null)[]>([]);''',
'''  const [seeded, setSeeded] = useState<(number | null)[]>([]);
  const [feesTotal, setFeesTotal] = useState(0);'''
),
(
'''    supabase
      .from("allocations")
      .select("risky_breakdown, risky_amount, safe_amount")
      .eq("player_id", me.id)
      .not("risky_breakdown", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        const prev = (data ?? [])[0] as
          | { risky_breakdown: number[] | null; risky_amount: number; safe_amount: number }
          | undefined;
        const base = prev ? Number(prev.risky_amount) + Number(prev.safe_amount) : 0;''',
'''    supabase
      .from("allocations")
      .select("risky_breakdown, risky_amount, safe_amount, fees_paid")
      .eq("player_id", me.id)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as {
          risky_breakdown: number[] | null;
          risky_amount: number;
          safe_amount: number;
          fees_paid: number | null;
        }[];
        // one query, two jobs: the carry-forward seed and the running fee total
        setFeesTotal(rows.reduce((s, a) => s + (a.fees_paid == null ? 0 : Number(a.fees_paid)), 0));
        const prev = rows.find((a) => a.risky_breakdown != null);
        const base = prev ? Number(prev.risky_amount) + Number(prev.safe_amount) : 0;'''
),
(
'''  wealth,
  roundNumber,
  session,
}: {
  children: React.ReactNode;
  wealth: number;
  /** always the session's current round — never a stale row's number */
  roundNumber: number;
  session: SessionRow;
}) {''',
'''  wealth,
  roundNumber,
  session,
  fees,
}: {
  children: React.ReactNode;
  wealth: number;
  /** always the session's current round — never a stale row's number */
  roundNumber: number;
  session: SessionRow;
  /** manager game: running fee total, shown next to wealth every year */
  fees?: number | null;
}) {'''
),
(
'''          <span className="font-mono text-xl font-bold text-ink">{money(wealth)}</span>
        </span>
      </div>''',
'''          <span className="font-mono text-xl font-bold text-ink">{money(wealth)}</span>
        </span>
      </div>
      {fees != null ? (
        <div className="mb-4 flex justify-end">
          <FeeCounter total={fees} />
        </div>
      ) : null}'''
),
(
'''    return (
      <Shell wealth={me.current_wealth} roundNumber={session.current_round} session={session}>
        {manager ? (''',
'''    return (
      <Shell
        wealth={me.current_wealth}
        roundNumber={session.current_round}
        session={session}
        fees={manager ? feesTotal : null}
      >
        {manager ? ('''
),
(
'''    return (
      <Shell wealth={me.current_wealth} roundNumber={session.current_round} session={session}>
        <div className="rounded-xl border-2 border-ink bg-brand-soft p-5 text-center shadow-card">''',
'''    return (
      <Shell
        wealth={me.current_wealth}
        roundNumber={session.current_round}
        session={session}
        fees={manager ? feesTotal : null}
      >
        <div className="rounded-xl border-2 border-ink bg-brand-soft p-5 text-center shadow-card">'''
),
(
'''  return <Reveal supabase={supabase} session={session} me={me} round={liveRound} mine={mine} />;''',
'''  return (
    <Reveal
      supabase={supabase}
      session={session}
      me={me}
      round={liveRound}
      mine={mine}
      feesTotal={manager ? feesTotal : null}
    />
  );'''
),
(
'''  me,
  round,
  mine,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
  mine: ReturnType<typeof useRoundAllocations>["allocations"][number] | null;
}) {''',
'''  me,
  round,
  mine,
  feesTotal,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
  me: PlayerRow;
  round: RoundRow;
  mine: ReturnType<typeof useRoundAllocations>["allocations"][number] | null;
  /** manager game only: fees paid across the whole game so far */
  feesTotal?: number | null;
}) {'''
),
(
'''        {manager ? (
          <ManagerYearResult
            config={session.config}
            round={round}
            allocation={mine}
            startWealth={before}
          />
        ) : null}''',
'''        {manager ? (
          <>
            <ManagerYearResult
              config={session.config}
              round={round}
              allocation={mine}
              startWealth={before}
            />
            {feesTotal != null ? (
              <div className="flex justify-center">
                <FeeCounter
                  total={feesTotal + (mine?.fees_paid == null ? 0 : Number(mine.fees_paid))}
                  thisYear={mine?.fees_paid == null ? null : Number(mine.fees_paid)}
                />
              </div>
            ) : null}
          </>
        ) : null}'''
),
])
