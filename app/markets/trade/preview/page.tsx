import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TradingPreview } from "@/components/markets/preview/TradingPreview";
import { HostPreview } from "@/components/markets/preview/HostPreview";
import { ClientOnly } from "@/components/markets/preview/ClientOnly";
import { SetupPreview } from "@/components/markets/preview/SetupPreview";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import type { FrictionProfile } from "@/lib/game/types";
import { FRICTION_PROFILES } from "@/lib/research/friction";

export const metadata: Metadata = {
  title: "Trading preview",
  robots: { index: false },
};

const PHASES = new Set<TradingPhase>([
  "lobby",
  "open",
  "closed",
  "revealed",
  "finished",
]);

/**
 * DEV ONLY: the paper trading screens on synthetic data, for checking the
 * design without a database: the student's phone, the host's control screen
 * or the projector. 404 in production builds (and, like every /markets route,
 * whenever NEXT_PUBLIC_ENABLE_MARKETS is off).
 *   /markets/trade/preview?view=setup|student|host|present&phase=open&round=3
 * The student view also takes &friction=low|standard|high and &research=1
 * (research mode, starting at the consent screen).
 * Every view takes &market=simulated (a game on the simulated market, 0037).
 */
export default function TradingPreviewPage({
  searchParams,
}: {
  searchParams: {
    view?: string;
    phase?: string;
    round?: string;
    friction?: string;
    research?: string;
    market?: string;
  };
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const phase = PHASES.has(searchParams.phase as TradingPhase)
    ? (searchParams.phase as TradingPhase)
    : "open";
  const round = Number(searchParams.round) || 3;
  const friction = FRICTION_PROFILES.includes(
    searchParams.friction as FrictionProfile,
  )
    ? (searchParams.friction as FrictionProfile)
    : "standard";
  const research = searchParams.research === "1";
  const simulated = searchParams.market === "simulated";
  const view = ["host", "present", "setup"].includes(searchParams.view ?? "")
    ? searchParams.view
    : "student";
  return (
    <ClientOnly>
      {view === "setup" ? (
        <SetupPreview />
      ) : view === "student" ? (
        <TradingPreview
          key={`${friction}-${research}-${simulated}`}
          phase={phase}
          round={round}
          friction={friction}
          research={research}
          simulated={simulated}
        />
      ) : (
        <HostPreview
          key={`${view}-${phase}-${round}-${simulated}`}
          view={view as "host" | "present"}
          phase={phase}
          round={round}
          simulated={simulated}
        />
      )}
    </ClientOnly>
  );
}
