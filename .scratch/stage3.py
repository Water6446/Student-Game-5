import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentWaiting.tsx", [
(
'''import { Sparkle } from "@/components/icons";''',
'''import { Sparkle } from "@/components/icons";
import { isManager } from "@/lib/game/types";
import { ManagerProspectus } from "@/components/ManagerProspectus";'''
),
(
'''  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">''',
'''  const manager = isManager(session.config);

  return (
    <main
      className={`mx-auto flex min-h-dvh flex-col justify-center px-6 ${
        manager ? "max-w-2xl py-8" : "max-w-lg"
      }`}
    >'''
),
(
'''          {session.config.num_rounds} rounds · {session.config.payoff_mode} payoffs
          {(session.config.correlation ?? 0) > 0
            ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
            : ""}
        </p>
      </Card>
    </main>
  );
}''',
'''          {manager
            ? `${session.config.num_rounds} years · ${session.config.num_managers ?? 5} managers`
            : `${session.config.num_rounds} rounds · ${session.config.payoff_mode} payoffs`}
          {(session.config.correlation ?? 0) > 0
            ? ` · ρ = ${(session.config.correlation ?? 0).toFixed(2)}`
            : ""}
        </p>
      </Card>

      {/* The lobby is the "read the prospectuses before the game starts" moment
          — it is the only time a student can study the line-up unhurried. */}
      {manager ? (
        <div className="mt-6">
          <h2 className="mb-1 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
            Who will you hire?
          </h2>
          <p className="mb-3 font-editorial text-sm italic text-ink-muted">
            Read the prospectuses. Every figure below is net of fees.
          </p>
          <ManagerProspectus config={session.config} />
        </div>
      ) : null}
    </main>
  );
}'''
),
])

# Student round screen: the line-up behind a disclosure, so it is reachable
# mid-game without pushing the allocation input off the phone.
patch("components/student/StudentRound.tsx", [
(
'''import { FeeCounter } from "@/components/FeeCounter";''',
'''import { FeeCounter } from "@/components/FeeCounter";
import { ManagerProspectus } from "@/components/ManagerProspectus";'''
),
(
'''        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button
          variant="gold"''',
'''        {manager ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-line bg-paper-2 py-2 text-sm font-semibold text-ink-muted transition marker:content-none hover:text-ink [&::-webkit-details-marker]:hidden">
              Manager prospectuses
            </summary>
            <div className="mt-2">
              <ManagerProspectus config={session.config} />
            </div>
          </details>
        ) : null}
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button
          variant="gold"'''
),
])
