"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";
import { Banner, Button, ChipButton, ChipRow, Toggle } from "@/components/ui";

/**
 * Host control to tune the probability of a GOOD market, live, mid-game. Writes
 * through the set_good_prob RPC; the new value takes effect on the next auto
 * reveal. Only meaningful in 'auto' market mode (manual mode picks outcomes
 * directly), so the parent decides whether to render it.
 */
export function MarketOddsControl({
  supabase,
  session,
}: {
  supabase: SupabaseClient;
  session: SessionRow;
}) {
  const serverPct = Math.round((session.config.good_prob ?? 0.6) * 100);
  const [pct, setPct] = useState(serverPct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOdds = session.config.show_odds_to_students ?? false;

  // Re-sync the slider if the stored value changes (e.g. another host tab).
  useEffect(() => {
    setPct(serverPct);
  }, [serverPct]);

  const dirty = pct !== serverPct;

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("set_good_prob", {
      p_session_id: session.id,
      p_good_prob: pct / 100,
    });
    setBusy(false);
    if (error) setError(error.message);
    // on success the session row updates via realtime and serverPct follows.
  }

  async function toggleVisibility() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("set_show_odds", {
      p_session_id: session.id,
      p_show: !showOdds,
    });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="space-y-3 px-1 pb-2 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink">Market odds (auto)</span>
        <span className="font-mono text-sm font-bold">
          <span className="text-gain">{pct}% good</span>
          <span className="text-ink-subtle"> · </span>
          <span className="text-loss">{100 - pct}% bad</span>
        </span>
      </div>
      <div className="rounded-full border-2 border-ink"
        style={{
          background: `linear-gradient(to right, rgb(var(--gain)) ${pct}%, rgb(var(--loss)) ${pct}%)`,
        }}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          disabled={busy}
          aria-label="Good-market probability"
          className="game-slider h-3 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-2">
        <ChipRow className="flex-1" label="Preset odds">
          {[25, 50, 60, 75].map((p) => (
            <ChipButton key={p} onClick={() => setPct(p)} disabled={busy} active={pct === p}>
              {p}%
            </ChipButton>
          ))}
        </ChipRow>
        <Button variant="gold" size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Apply" : "Saved"}
        </Button>
      </div>
      {/* The label names the setting; the switch carries its state. */}
      <Toggle
        checked={showOdds}
        onChange={() => void toggleVisibility()}
        disabled={busy}
        label="Students can see the odds"
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
    </div>
  );
}
