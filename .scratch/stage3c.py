import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/HostLobby.tsx", [
(
'''import { CondensedList } from "@/components/CondensedList";''',
'''import { CondensedList } from "@/components/CondensedList";
import { ManagerProspectus } from "@/components/ManagerProspectus";
import { isManager } from "@/lib/game/types";'''
),
(
'''      </div>
    </main>
  );
}''',
'''      </div>

      {isManager(session.config) ? (
        <div className="mt-8">
          <h2 className="mb-1 font-display text-xl font-extrabold uppercase tracking-tight text-ink">
            The manager line-up
          </h2>
          <p className="mb-3 font-editorial text-sm italic text-ink-muted">
            What your students see before they hire. Regenerated for every session.
          </p>
          <ManagerProspectus config={session.config} />
        </div>
      ) : null}
    </main>
  );
}'''
),
])

patch("components/host/HostPresent.tsx", [
(
'''import { Confetti } from "@/components/Confetti";''',
'''import { Confetti } from "@/components/Confetti";
import { ManagerProspectus } from "@/components/ManagerProspectus";'''
),
(
'''      {/* Live count */}
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
          In the room
        </p>
        <p className="flex items-center gap-4 font-mono text-[clamp(5rem,16vw,11rem)] font-black leading-none text-ink">
          {players.length}
        </p>
        <p className="flex items-center gap-3 text-3xl font-bold text-ink">
          <Users className="text-[0.8em] text-ink-muted" />
          {players.length === 1 ? "player" : "players"} in
        </p>
      </div>''',
'''      {/* Live count — or, in a manager game, the line-up the class is reading */}
      {isManager(session.config) ? (
        <div className="flex flex-col justify-center">
          <p className="mb-3 flex items-center gap-3 font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
            <Users className="text-[0.8em]" />
            {players.length} in the room
          </p>
          <ManagerProspectus config={session.config} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-2xl font-extrabold uppercase tracking-[0.2em] text-ink-muted">
            In the room
          </p>
          <p className="flex items-center gap-4 font-mono text-[clamp(5rem,16vw,11rem)] font-black leading-none text-ink">
            {players.length}
          </p>
          <p className="flex items-center gap-3 text-3xl font-bold text-ink">
            <Users className="text-[0.8em] text-ink-muted" />
            {players.length === 1 ? "player" : "players"} in
          </p>
        </div>
      )}'''
),
])
