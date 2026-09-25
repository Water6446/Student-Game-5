import type { SessionRow } from "@/lib/game/db";
import { isManager, isPortfolio } from "@/lib/game/types";

/** The toolbar's "where you are": Session KXQ7P / Basic / Live. */
export function SessionCrumbs({ session, stage }: { session: SessionRow; stage: string }) {
  const game = isManager(session.config) ? "Manager" : isPortfolio(session.config) ? "Portfolio" : "Basic";
  const sep = (
    <span aria-hidden="true" className="text-ink-subtle">
      /
    </span>
  );
  return (
    <>
      <span>
        Session <span className="font-bold text-ink">{session.join_code}</span>
      </span>
      {sep}
      <span>{game}</span>
      {sep}
      <span className="font-bold text-ink">{stage}</span>
    </>
  );
}
