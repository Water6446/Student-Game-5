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
      "In the Portfolio game there are several risky assets, each with its own independent market — spreading your money across them (diversifying) tames the wipeout risk.",
      "In the Manager game each round is a YEAR. You split your wealth between a risk-free asset and a line-up of fund managers, and you're scored against a passive index you cannot buy. Read the prospectuses in the lobby before year 1.",
      "Manager game: your percentages carry over — a portfolio you don't touch is one you still hold, so you only submit when you want to change something.",
      "Manager game: every manager charges a fee every year, win or lose, and your running fee total sits on screen the whole game. Some funds also take a share of the gains.",
      "Manager game: you may borrow to invest more than 100% of your wealth, but borrowing costs more than the index returns on average — leverage only pays if you actually picked a better manager.",
      "At the end you'll see how you did versus fixed benchmark strategies (always-safe, 50/50, all-in — or, in the portfolio game, one-basket vs. diversified). The manager game instead shows the index, your total fees, and which managers were genuinely skilled all along.",
    ],
  },
  professor: {
    heading: "How to run a game",
    simple: [
      "Sign in, then pick a game: the Basic Risk Game (one risky bet), the Portfolio Risk Game (several independent risky assets), or the Manager Game (active vs. passive, one year per round). The Standard setup is one click.",
      "Share the join code or QR; students appear in your lobby live.",
      "Start the round → students submit → Lock → Reveal. Repeat for each round.",
      "Watch the live leaderboard and chart; Finish to see the summary and export a CSV.",
    ],
    detailed: [
      "Standard setup: extreme payoff (×2 good / ×0 bad), 25 rounds, $100 start, 60% good-market chance, auto market (the server rolls), shared outcome for everyone.",
      "Flip on Advanced to change any of it: payoff mode, rounds, starting wealth, good-market odds, manual vs. auto market, shared vs. independent outcomes, leaderboard/odds visibility, and late join.",
      "Portfolio game extras: pick how many risky assets are in play (2–8), an optional per-round interest rate on the safe pot, and optionally customize each asset's name, odds, and payoff. Its benchmark bots compare one-basket vs. diversified investing.",
      "Manager game: 25 years by default. Students allocate across a risk-free asset and 5 fund managers, may lever up to 2×, and are ranked against 'The Index' — a no-fee passive competitor they cannot invest in. Returns are continuous (the index averages 8% with 16% volatility); each manager adds its own beta, skill and noise.",
      "Manager game presets: Standard (5 long-only funds at 1% flat), Hedge fund (the same 5 at 2% + 20%), and Market neutral (adds a near-zero-beta fund charging 2-and-20). Advanced lets you set every manager's beta, alpha, tracking error and fee, plus the index return and volatility, risk-free rate, borrow spread and leverage cap.",
      "Manager game: which manager is genuinely skilled is reshuffled every session and hidden from everyone until the game finishes — the true alpha lives in a server-only table students and hosts alike can only read through the reveal. Track records regenerate each session too, so the 'obvious' pick changes run to run.",
      "Round flow: Open (students allocate) → Lock (no more changes; you see each student's split) → Reveal (server rolls the market, or you pick it in manual mode; wealth is recomputed) → Next round.",
      "Mid-game you can adjust the good-market odds and choose whether students see them.",
      "The wealth-over-rounds chart and per-round history update live as you go.",
      "The final summary ranks everyone and compares the class to all-safe / 50-50 / all-risky strategies, with a one-click CSV export for grading or discussion. A manager game swaps that comparison for the index, the class fee total, and the reveal of each manager's true skill.",
      "You can delete a session at any time from the dashboard or the round screen.",
    ],
  },
};

export function Instructions({ role, className }: { role: Role; className?: string }) {
  const [showMore, setShowMore] = useState(false);
  const content = CONTENT[role];

  return (
    <div
      className={`rounded-2xl border-2 border-ink bg-surface p-6 text-left shadow-card ${className ?? ""}`}
    >
      <h2 className="font-display text-lg font-extrabold uppercase tracking-tight text-ink">
        {content.heading}
      </h2>

      <ul className="mt-4 space-y-2.5">
        {content.simple.map((line, i) => (
          <li key={line} className="flex gap-3 text-ink">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-brand text-xs font-bold text-ink">
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
