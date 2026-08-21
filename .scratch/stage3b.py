import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/student/StudentRound.tsx", [
(
'''import { FeeCounter } from "@/components/FeeCounter";''',
'''import { FeeCounter } from "@/components/FeeCounter";
import { ManagerProspectus } from "@/components/ManagerProspectus";'''
),
(
'''        {error ? <Banner kind="error">{error}</Banner> : null}
        {/* `settling` = the host has locked the round but we are still showing''',
'''        {/* Reachable mid-game without pushing the allocation input off a phone. */}
        {manager ? (
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
        {/* `settling` = the host has locked the round but we are still showing'''
),
])
