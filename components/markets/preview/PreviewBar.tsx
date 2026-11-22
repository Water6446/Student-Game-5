"use client";

import Link from "next/link";
import { clsx } from "@/components/clsx";
import type { TradingPhase } from "@/lib/markets/trading/phase";
import type { FrictionProfile } from "@/lib/game/types";
import { FRICTION_PROFILES } from "@/lib/research/friction";

export type PreviewView = "student" | "host" | "present" | "setup";

export const PREVIEW_VIEWS: PreviewView[] = [
  "setup",
  "student",
  "host",
  "present",
];
export const PREVIEW_PHASES: TradingPhase[] = [
  "lobby",
  "open",
  "closed",
  "revealed",
  "finished",
];

export interface PreviewStudentOptions {
  friction: FrictionProfile;
  research: boolean;
}

export const previewHref = (
  view: PreviewView,
  phase: TradingPhase,
  round: number,
  opts?: PreviewStudentOptions,
) =>
  `/markets/trade/preview?view=${view}&phase=${phase}&round=${round}` +
  (opts && view === "student"
    ? `${opts.friction !== "standard" ? `&friction=${opts.friction}` : ""}${opts.research ? "&research=1" : ""}`
    : "");

/** DEV ONLY: the strip above the preview that switches screen and phase. */
export function PreviewBar({
  view,
  phase,
  round,
  student,
}: {
  view: PreviewView;
  phase: TradingPhase;
  round: number;
  /** the student view's friction and research switches */
  student?: PreviewStudentOptions;
}) {
  const pill = (on: boolean) =>
    clsx(
      "rounded-full px-2 py-0.5 font-mono text-[11px] font-bold",
      on ? "bg-ink text-paper-inverse" : "text-ink hover:bg-ink/10",
    );
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 border-b-2 border-ink bg-brand px-2 py-1.5">
      <div className="flex gap-1">
        {PREVIEW_VIEWS.map((v) => (
          <Link
            key={v}
            href={previewHref(v, phase, round)}
            className={pill(v === view)}
          >
            {v}
          </Link>
        ))}
      </div>
      <div className="flex gap-1">
        {PREVIEW_PHASES.map((p) => (
          <Link
            key={p}
            href={previewHref(view, p, round, student)}
            className={pill(p === phase)}
          >
            {p}
          </Link>
        ))}
      </div>
      {student ? (
        <div className="flex gap-1">
          {FRICTION_PROFILES.map((f) => (
            <Link
              key={f}
              href={previewHref(view, phase, round, {
                ...student,
                friction: f,
              })}
              className={pill(f === student.friction)}
            >
              {f}
            </Link>
          ))}
          <Link
            href={previewHref(view, phase, round, {
              ...student,
              research: !student.research,
            })}
            className={pill(student.research)}
          >
            research
          </Link>
        </div>
      ) : null}
    </div>
  );
}
