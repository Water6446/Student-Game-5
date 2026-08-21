import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentRound.tsx", [
(
'''import { isPortfolio, type MarketOutcome } from "@/lib/game/types";
import { riskyMultiplier, roundCents } from "@/lib/game/math";
import { assetName, assetPayoffMode, numAssets } from "@/lib/game/portfolio";''',
'''import { isManager, isPortfolio, type MarketOutcome } from "@/lib/game/types";
import { riskyMultiplier, roundCents } from "@/lib/game/math";
import { assetName, assetPayoffMode, numAssets } from "@/lib/game/portfolio";
import { amountsFromPercents, numManagers } from "@/lib/game/manager";'''
),
(
'''import { PortfolioAllocationInput } from "@/components/student/PortfolioAllocationInput";''',
'''import { PortfolioAllocationInput } from "@/components/student/PortfolioAllocationInput";
import { ManagerAllocationInput } from "@/components/student/ManagerAllocationInput";
import { ManagerYearResult } from "@/components/ManagerYearResult";'''
),
(
'''  const portfolio = isPortfolio(session.config);
  const n = numAssets(session.config);

  const [risky, setRisky] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<(number | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);''',
'''  const portfolio = isPortfolio(session.config);
  const manager = isManager(session.config);
  const n = manager ? numManagers(session.config) : numAssets(session.config);

  const [risky, setRisky] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<(number | null)[]>([]);
  const [percents, setPercents] = useState<(number | null)[]>([]);
  const [seeded, setSeeded] = useState<(number | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);'''
),
(
'''  // Each new round opens blank — never pre-filled and never carrying over the
  // previous round's choice. Students must deliberately enter an amount every
  // round (even to repeat the same number), so the fields stay empty until they do.
  useEffect(() => {
    setRisky(null);
    setAmounts(Array.from({ length: n }, () => null));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, n]);
''',
'''  // Each new round opens blank — never pre-filled and never carrying over the
  // previous round's choice. Students must deliberately enter an amount every
  // round (even to repeat the same number), so the fields stay empty until they do.
  // The MANAGER game deliberately inverts this: see the seeding effect below.
  useEffect(() => {
    setRisky(null);
    setAmounts(Array.from({ length: n }, () => null));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, n]);

  // Manager game: a portfolio you did not touch this year is one you still
  // hold, so each year opens PRE-FILLED with last year's shares — matching the
  // server, which carries non-submitters forward instead of defaulting them to
  // all-safe. Percentages (not dollars) are what persist, which is why the
  // input works in percent of wealth.
  useEffect(() => {
    if (!manager) return;
    let active = true;
    supabase
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
        const base = prev ? Number(prev.risky_amount) + Number(prev.safe_amount) : 0;
        const next =
          prev?.risky_breakdown && base > 0
            ? Array.from({ length: n }, (_, i) =>
                Math.round((Number(prev.risky_breakdown?.[i] ?? 0) / base) * 100),
              )
            : Array.from({ length: n }, () => 0);
        setPercents(next);
        setSeeded(next);
      });
    return () => {
      active = false;
    };
  }, [supabase, manager, me.id, n, liveRound?.id]);
'''
),
(
'''  const touched = portfolio ? amounts.some((a) => a !== null) : risky !== null;''',
'''  // Manager games start pre-filled and stay submittable, so a student can
  // confirm a held position without re-typing it.
  const touched = manager
    ? percents.length > 0
    : portfolio
      ? amounts.some((a) => a !== null)
      : risky !== null;
  const unchanged =
    manager && !mine && seeded.length > 0 && percents.every((p, i) => p === seeded[i]);'''
),
(
'''    const { error } = portfolio
      ? await supabase.rpc("submit_portfolio_allocation", {
          p_round_id: liveRound.id,
          p_amounts: amounts.map((a) => roundCents(a ?? 0)),
        })
      : await supabase.rpc("submit_allocation", {
          p_round_id: liveRound.id,
          p_risky_amount: roundCents(risky ?? 0),
        });''',
'''    const { error } = manager
      ? await supabase.rpc("submit_manager_allocation", {
          p_round_id: liveRound.id,
          p_amounts: amountsFromPercents(me.current_wealth, percents),
        })
      : portfolio
        ? await supabase.rpc("submit_portfolio_allocation", {
            p_round_id: liveRound.id,
            p_amounts: amounts.map((a) => roundCents(a ?? 0)),
          })
        : await supabase.rpc("submit_allocation", {
            p_round_id: liveRound.id,
            p_risky_amount: roundCents(risky ?? 0),
          });'''
),
])
