import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentRound.tsx", [
(
'''      .select("risky_breakdown, risky_amount, safe_amount, fees_paid")''',
'''      .select("round_id, risky_breakdown, risky_amount, safe_amount, fees_paid")'''
),
(
'''        const rows = (data ?? []) as {
          risky_breakdown: number[] | null;
          risky_amount: number;
          safe_amount: number;
          fees_paid: number | null;
        }[];
        // one query, two jobs: the carry-forward seed and the running fee total
        setFeesTotal(rows.reduce((s, a) => s + (a.fees_paid == null ? 0 : Number(a.fees_paid)), 0));
        const prev = rows.find((a) => a.risky_breakdown != null);''',
'''        const rows = (data ?? []) as {
          round_id: string;
          risky_breakdown: number[] | null;
          risky_amount: number;
          safe_amount: number;
          fees_paid: number | null;
        }[];
        // One query, two jobs: the carry-forward seed and the running fee total.
        // THIS round is excluded so the reveal can add its own year's fee
        // without double-counting on a mid-reveal reload.
        setFeesTotal(
          rows
            .filter((a) => a.round_id !== liveRound?.id)
            .reduce((s, a) => s + (a.fees_paid == null ? 0 : Number(a.fees_paid)), 0),
        );
        const prev = rows.find(
          (a) => a.risky_breakdown != null && a.round_id !== liveRound?.id,
        );'''
),
])
