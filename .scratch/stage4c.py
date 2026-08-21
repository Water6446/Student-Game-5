import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/HostSummary.tsx", [
(
'''import { CondensedList } from "@/components/CondensedList";''',
'''import { CondensedList } from "@/components/CondensedList";
import { ManagerReveal } from "@/components/host/ManagerReveal";
import { FeeCounter, sumFees } from "@/components/FeeCounter";'''
),
(
'''      {/* Counterfactual */}
      <Card className="mb-6">''',
'''      {/* Who was actually skilled — the payoff of the whole module. */}
      {isManager(session.config) ? (
        <div className="mb-6">
          <ManagerReveal supabase={supabase} session={session} rounds={rounds} />
        </div>
      ) : null}

      {/* Counterfactual */}
      <Card className="mb-6">'''
),
(
'''        <div className="flex items-center gap-2">
          {hasBots ? (''',
'''        <div className="flex flex-wrap items-center gap-2">
          {isManager(session.config) ? (
            <FeeCounter total={sumFees(allocations)} label="Class fees paid" />
          ) : null}
          {hasBots ? ('''
),
])

patch("components/host/HostPresent.tsx", [
(
'''function PresentFinished({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {''',
'''function PresentFinished({ supabase, session }: { supabase: SupabaseClient; session: SessionRow }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks'''
),
(
'''      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard ranked={ranked} outcomesByPlayer={outcomesByPlayer} />
      </div>''',
'''      <div className="mx-auto w-full max-w-3xl">
        <Leaderboard ranked={ranked} outcomesByPlayer={outcomesByPlayer} />
      </div>

      {/* The reveal belongs on the projector too — it is the moment the class
          finds out whether the fund they trusted ever had an edge. */}
      {isManager(session.config) ? (
        <div className="mx-auto mt-6 w-full max-w-3xl">
          <ManagerReveal supabase={supabase} session={session} rounds={history.rounds} />
        </div>
      ) : null}'''
),
(
'''import { ManagerProspectus } from "@/components/ManagerProspectus";''',
'''import { ManagerProspectus } from "@/components/ManagerProspectus";
import { ManagerReveal } from "@/components/host/ManagerReveal";'''
),
])
