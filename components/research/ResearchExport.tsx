"use client";

import { useState } from "react";
import { Banner, Button } from "@/components/ui";
import { Download, FileText } from "@/components/icons";
import { downloadFile } from "@/components/download-file";
import {
  accountRoundsCsv,
  armsCsv,
  eventsCsv,
  exportFileName,
  fillsCsv,
  ordersCsv,
  playersCsv,
  roundsCsv,
  type EventsPage,
  type ExportEvent,
  type ResearchTables,
} from "@/lib/research/export";
import { allMetrics, metricsByArm } from "@/lib/research/metrics";

/** Pages of events at most (5,000 each): a runaway loop stops here. */
const MAX_PAGES = 400;

type Part = "players" | "arms" | "orders" | "fills" | "rounds" | "accounts" | "events";

const PARTS: { part: Part; label: string }[] = [
  { part: "players", label: "Students & metrics" },
  { part: "arms", label: "By friction condition" },
  { part: "orders", label: "Orders" },
  { part: "fills", label: "Fills" },
  { part: "rounds", label: "Rounds" },
  { part: "accounts", label: "Accounts by round" },
  { part: "events", label: "Behaviour events" },
];

/**
 * The host's research download (section-level): export_research_data read
 * once, all event pages followed, then one CSV per table. Students appear only
 * as pseudonyms; in research mode only those who agreed are in it at all.
 */
export function ResearchExport({
  joinCode,
  researchMode,
  loadTables,
  loadEvents,
}: {
  joinCode: string;
  researchMode: boolean;
  loadTables: () => Promise<ResearchTables | string>;
  loadEvents: (after: number) => Promise<EventsPage | string>;
}) {
  const [data, setData] = useState<{ tables: ResearchTables; events: ExportEvent[] } | null>(null);
  const [busy, setBusy] = useState<Part | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<{ tables: ResearchTables; events: ExportEvent[] } | null> {
    if (data) return data;
    const tables = await loadTables();
    if (typeof tables === "string") {
      setError(tables);
      return null;
    }
    const events: ExportEvent[] = [];
    let after = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await loadEvents(after);
      if (typeof page === "string") {
        setError(page);
        return null;
      }
      events.push(...page.events);
      if (page.next == null) break;
      after = page.next;
    }
    const loaded = { tables, events };
    setData(loaded);
    return loaded;
  }

  async function download(part: Part) {
    setBusy(part);
    setError(null);
    const d = await load();
    setBusy(null);
    if (!d) return;
    const { tables: t, events } = d;
    const metrics = part === "players" || part === "arms" ? allMetrics(t, events) : [];
    const csv =
      part === "players"
        ? playersCsv(t, metrics)
        : part === "arms"
          ? armsCsv(metricsByArm(metrics))
          : part === "orders"
            ? ordersCsv(t)
            : part === "fills"
              ? fillsCsv(t)
              : part === "rounds"
                ? roundsCsv(t)
                : part === "accounts"
                  ? accountRoundsCsv(t)
                  : eventsCsv(events);
    downloadFile(exportFileName(joinCode, part), csv);
  }

  const included = data ? data.tables.session.players_included : null;
  const total = data ? data.tables.session.players_total : null;

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <FileText className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {researchMode
            ? "Only students who agreed are included, under codes instead of names."
            : "Every student is included, under codes instead of names."}
          {included != null && total != null ? ` ${included} of ${total} students.` : ""}
        </span>
      </p>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {PARTS.map(({ part, label }) => (
          <Button
            key={part}
            variant="secondary"
            size="sm"
            className="justify-start"
            disabled={busy != null}
            onClick={() => void download(part)}
          >
            <Download /> {busy === part ? "Preparing…" : label}
          </Button>
        ))}
      </div>
    </div>
  );
}
