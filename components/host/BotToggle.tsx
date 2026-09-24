"use client";

import { Bot } from "@/components/icons";

/**
 * The show/hide-benchmark-bots switch, shared by the host screens. A compact
 * version of ui.tsx's Toggle — same ink track, same blue "on" — sized to sit
 * beside a card heading. The label stays "Bots"; the switch carries the state.
 */
export function BotToggle({
  showBots,
  onToggle,
  title = "Show benchmark bots in the standings, chart and allocations",
}: {
  showBots: boolean;
  onToggle: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={showBots}
      aria-label="Show benchmark bots"
      onClick={() => onToggle(!showBots)}
      className="inline-flex min-h-[36px] items-center gap-2 rounded-full border-2 border-ink bg-surface py-1 pl-3 pr-1.5 text-xs font-bold text-ink transition hover:bg-paper-2"
      title={title}
    >
      <Bot className="text-sm text-ink-muted" />
      Bots
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 rounded-full border-2 border-ink transition-colors ${
          showBots ? "bg-play" : "bg-paper-2"
        }`}
      >
        <span
          className={`absolute top-[1px] h-3.5 w-3.5 rounded-full border border-ink bg-white transition-[left] duration-200 ${
            showBots ? "left-[16px]" : "left-[1px]"
          }`}
        />
      </span>
    </button>
  );
}
