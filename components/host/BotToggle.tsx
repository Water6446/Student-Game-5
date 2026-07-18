"use client";

import { Bot } from "@/components/icons";

/** The show/hide-benchmark-bots pill, shared by the host screens. */
export function BotToggle({
  showBots,
  onToggle,
  title = "Toggle benchmark bots in the standings, chart and allocations",
}: {
  showBots: boolean;
  onToggle: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!showBots)}
      aria-pressed={showBots}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        showBots
          ? "border-play/30 bg-play-soft text-play"
          : "border-line-strong bg-paper text-ink-muted hover:border-ink-subtle"
      }`}
      title={title}
    >
      <Bot />
      {showBots ? "Bots shown" : "Bots hidden"}
    </button>
  );
}
