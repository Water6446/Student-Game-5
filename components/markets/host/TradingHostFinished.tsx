"use client";

import { useMemo } from "react";
import Link from "next/link";
import { periodNoun } from "@/lib/markets/clock";
import { tradePresentPath } from "@/lib/markets/routes";
import { indexPath, periodChanges } from "@/lib/markets/trading/host";
import { revealCsv, revealFileName } from "@/lib/markets/trading/reveal";
import { returnText } from "@/lib/markets/format";
import { Button, Card, SectionTitle, buttonClasses } from "@/components/ui";
import { ArrowLeft, Download, Monitor } from "@/components/icons";
import { downloadFile } from "@/components/download-file";
import {
  ClassTurnover,
  RevealError,
  RevealSkeleton,
  useReveal,
} from "@/components/markets/RevealParts";
import { WealthChart } from "@/components/host/WealthChart";
import type { HostActions, HostModel } from "./model";
import { DevDataBanner, HostStandings, RealDates } from "./parts";
import { isSimulatedMarket } from "@/lib/markets/trading/config";
import { ResearchExport } from "@/components/research/ResearchExport";

/**
 * The host's screen once the game is over: final standings, the class's
 * turnover against return with the Barber & Odean takeaway (names on hover),
 * the results CSV, the real market (no longer a secret), the account values
 * against the index fund, and the research download.
 */
export function TradingHostFinished({
  model,
  actions,
}: {
  model: HostModel;
  actions: HostActions;
}) {
  const { cfg } = model;
  const noun = periodNoun(cfg.period);
  const changes = useMemo(
    () => periodChanges(model.rounds, model.allocations),
    [model.rounds, model.allocations],
  );
  const benchmark = useMemo(() => {
    const series = indexPath(model.periods, cfg.starting_wealth);
    return series.length > 0 ? { label: "The index fund", series } : null;
  }, [model.periods, cfg.starting_wealth]);
  const { reveal, retry } = useReveal(actions.loadReveal);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {model.devData ? (
        <div className="mb-4">
          <DevDataBanner />
        </div>
      ) : null}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/host"
            className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft /> Dashboard
          </Link>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight text-ink sm:text-4xl">
            Game over
          </h1>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {model.title} · {model.periods.length} {noun.toLowerCase()}
            {model.periods.length === 1 ? "" : "s"} played
          </p>
        </div>
        <Link
          href={tradePresentPath(model.sessionId)}
          target="_blank"
          className={buttonClasses("secondary", "sm", "min-w-[44px]")}
          title="Open the projector view in a new tab"
        >
          <Monitor /> Present
        </Link>
      </header>

      <Card className="mb-6">
        <SectionTitle
          className="mb-1"
          action={
            reveal ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadFile(
                    revealFileName(model.joinCode),
                    revealCsv(reveal),
                  )
                }
              >
                <Download /> Results CSV
              </Button>
            ) : null
          }
        >
          Did trading more pay?
        </SectionTitle>
        {reveal === undefined ? (
          <RevealSkeleton rows={4} />
        ) : reveal === null ? (
          <RevealError onRetry={retry} what="The class summary" />
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-muted">
              Each dot is a student; hover for the name. Buying and holding the
              index fund returned {returnText(reveal.index_return, 1)}.
            </p>
            <ClassTurnover reveal={reveal} showNames height={320} />
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle className="mb-3">Final standings</SectionTitle>
          <HostStandings
            standings={model.standings}
            players={model.players}
            moves={new Map()}
            changes={changes}
            manage={actions.manage}
          />
        </Card>
        {isSimulatedMarket(model.cfg) ? null : (
          <RealDates
            loadTruth={actions.loadTruth}
            instruments={model.instruments}
            finished
          />
        )}
      </div>

      <Card className="mt-6">
        <SectionTitle className="mb-3">
          Account values by {noun.toLowerCase()}
        </SectionTitle>
        <WealthChart
          players={model.players}
          rounds={model.rounds}
          allocations={model.allocations}
          startingWealth={cfg.starting_wealth}
          benchmark={benchmark}
          unitLabel={noun}
        />
      </Card>

      <Card className="mt-6">
        <SectionTitle className="mb-3">Research data</SectionTitle>
        <ResearchExport
          joinCode={model.joinCode}
          researchMode={cfg.research_mode}
          loadTables={actions.loadResearch}
          loadEvents={actions.loadResearchEvents}
        />
      </Card>
    </main>
  );
}
