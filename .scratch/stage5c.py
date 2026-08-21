import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Show full leaderboard to students"''',
'''            </div>
          ) : null}
        </>
      ) : null}

      {/* Shared toggles apply to every game type, manager included. */}
      {advanced ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Show full leaderboard to students"'''
),
])
