"use client";

import { useState } from "react";
import Link from "next/link";

type Tab = "student" | "professor";

interface TabContent {
  cta: { href: string; label: string };
  simple: string[];
  detailed: string[];
}

const CONTENT: Record<Tab, TabContent> = {
  student: {
    cta: { href: "/join", label: "Join a game →" },
    simple: [
      "Join with the code or QR your professor shares.",
      "Each round, choose how much of your money to put in the risky bet vs. keep safe.",
      "Submit before the round locks.",
      "See the market result and your new wealth — then do it again next round.",
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
    cta: { href: "/host", label: "Host a session →" },
    simple: [
      "Sign in, then click Create session — the Standard setup is one click.",
      "Share the join code or QR; students appear in your lobby live.",
      "Start the round → students submit → Lock → Reveal. Repeat for each round.",
      "Watch the live leaderboard and chart; Finish to see the summary and export a CSV.",
    ],
    detailed: [
      "Standard setup = extreme payoff (×2 good / ×0 bad), 25 rounds, $100 start, 60% good-market chance, auto market (the server rolls), shared outcome for everyone.",
      "Flip on Advanced to change any of it: payoff mode, rounds, starting wealth, good-market odds, manual vs. auto market, shared vs. independent outcomes, leaderboard/odds visibility, and late join.",
      "Round flow: Open (students allocate) → Lock (no more changes; you see each student's split) → Reveal (server rolls the market, or you pick it in manual mode; wealth is recomputed) → Next round.",
      "Mid-game you can adjust the good-market odds and choose whether students see them.",
      "The wealth-over-rounds chart and per-round history update live as you go.",
      "The final summary ranks everyone and compares the class to all-safe / 50-50 / all-risky strategies, with a one-click CSV export for grading or discussion.",
      "You can delete a session at any time from the dashboard or the round screen.",
    ],
  },
};

export function HomeTabs() {
  const [tab, setTab] = useState<Tab>("student");
  const [showMore, setShowMore] = useState(false);

  function switchTab(t: Tab) {
    setTab(t);
    setShowMore(false);
  }

  const content = CONTENT[tab];

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-1.5">
        <TabButton active={tab === "student"} onClick={() => switchTab("student")}>
          I&apos;m a student
        </TabButton>
        <TabButton active={tab === "professor"} onClick={() => switchTab("professor")}>
          I&apos;m the professor
        </TabButton>
      </div>

      {/* Panel */}
      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-left shadow-xl sm:p-8">
        <h2 className="text-lg font-semibold text-slate-100">
          {tab === "student" ? "How to play" : "How to run a game"}
        </h2>

        <ul className="mt-4 space-y-2.5">
          {content.simple.map((line) => (
            <li key={line} className="flex gap-3 text-slate-300">
              <span className="mt-0.5 text-indigo-400">●</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="mt-4 text-sm font-medium text-indigo-300 hover:text-indigo-200"
        >
          {showMore ? "Show less ▲" : "Read more ▼"}
        </button>

        {showMore ? (
          <div className="mt-3 border-t border-slate-800 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Detailed instructions
            </h3>
            <ul className="mt-3 space-y-2.5">
              {content.detailed.map((line) => (
                <li key={line} className="flex gap-3 text-sm text-slate-400">
                  <span className="mt-0.5 text-slate-600">–</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          href={content.cta.href}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-indigo-400"
        >
          {content.cta.label}
        </Link>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-indigo-500 text-white" : "text-slate-300 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}
