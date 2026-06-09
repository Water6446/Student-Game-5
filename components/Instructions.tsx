"use client";

import { useState } from "react";
import { ChevronDown } from "@/components/icons";

type Role = "student" | "professor";

interface RoleContent {
  heading: string;
  simple: string[];
  detailed: string[];
}

const CONTENT: Record<Role, RoleContent> = {
  student: {
    heading: "How to play",
    simple: [
      "Join with the code or QR your professor shares.",
      "Each round, choose how much of your money to put in the risky bet vs. keep safe.",
      "Risky bets can double or drop to zero, depending on the market. Safe money stays the same.",
      "Submit before the round locks.",
      "See the market result and your new wealth, then do it again next round.",
    ],
    detailed: [
      "You start with $100 (unless your professor changed it). Safe money never changes in value.",
      "Risky money rides the market. In the standard game it doubles (×2) if the market is good and drops to $0 if it's bad. Some games use a gentler ×1.1 / ×0.9 instead.",
      "The market is good about 60% of the time. Your professor may show or hide the exact odds.",
      "After everyone submits, the professor locks the round and reveals the outcome. Your wealth updates and you can see your rank.",
      "If you don't submit, you default to all-safe — you keep your money but gain nothing that round.",
      "Strategy tip: more in the risky asset means more upside but a bigger chance of being wiped out. Mixing safe and risky balances the two.",
      "At the end you'll see how you did versus always-safe, 50/50, and all-in strategies.",
    ],
  },
  professor: {
    heading: "How to run a game",
    simple: [
      "Sign in, then click Create session. The Standard setup is one click.",
      "Share the join code or QR; students appear in your lobby live.",
      "Start the round → students submit → Lock → Reveal. Repeat for each round.",
      "Watch the live leaderboard and chart; Finish to see the summary and export a CSV.",
    ],
    detailed: [
      "Standard setup: extreme payoff (×2 good / ×0 bad), 25 rounds, $100 start, 60% good-market chance, auto market (the server rolls), shared outcome for everyone.",
      "Flip on Advanced to change any of it: payoff mode, rounds, starting wealth, good-market odds, manual vs. auto market, shared vs. independent outcomes, leaderboard/odds visibility, and late join.",
      "Round flow: Open (students allocate) → Lock (no more changes; you see each student's split) → Reveal (server rolls the market, or you pick it in manual mode; wealth is recomputed) → Next round.",
      "Mid-game you can adjust the good-market odds and choose whether students see them.",
      "The wealth-over-rounds chart and per-round history update live as you go.",
      "The final summary ranks everyone and compares the class to all-safe / 50-50 / all-risky strategies, with a one-click CSV export for grading or discussion.",
      "You can delete a session at any time from the dashboard or the round screen.",
    ],
  },
};

export function Instructions({ role, className }: { role: Role; className?: string }) {
  const [showMore, setShowMore] = useState(false);
  const content = CONTENT[role];

  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-6 text-left shadow-card ${className ?? ""}`}
    >
      <h2 className="text-lg font-bold text-ink">{content.heading}</h2>

      <ul className="mt-4 space-y-2.5">
        {content.simple.map((line, i) => (
          <li key={line} className="flex gap-3 text-ink">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
              {i + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:text-brand"
      >
        {showMore ? "Show less" : "Read more"}
        <ChevronDown className={`transition-transform ${showMore ? "rotate-180" : ""}`} />
      </button>

      {showMore ? (
        <div className="mt-3 border-t border-line pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-subtle">
            Detailed instructions
          </h3>
          <ul className="mt-3 space-y-2.5">
            {content.detailed.map((line) => (
              <li key={line} className="flex gap-3 text-sm text-ink-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
