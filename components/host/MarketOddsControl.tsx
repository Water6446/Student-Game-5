"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow } from "@/lib/game/db";

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
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-300">Market odds (auto)</span>
        <span className="font-mono text-sm">
          <span className="text-emerald-400">{pct}% good</span>
          <span className="text-slate-600"> · </span>
          <span className="text-rose-400">{100 - pct}% bad</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => setPct(Number(e.target.value))}
        disabled={busy}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-rose-500 to-emerald-500 disabled:opacity-50"
      />
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1">
          {[25, 50, 60, 75].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPct(p)}
              disabled={busy}
              className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {p}%
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="ml-auto rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:bg-slate-700"
        >
          {busy ? "Saving…" : dirty ? "Apply odds" : "Saved"}
        </button>
      </div>
      <button
        type="button"
        onClick={toggleVisibility}
        disabled={busy}
        className={`mt-3 flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
          showOdds
            ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
            : "border-slate-700 bg-slate-900 text-slate-400"
        }`}
      >
        <span>{showOdds ? "Students can see these odds" : "Odds hidden from students"}</span>
        <span className="font-semibold">{showOdds ? "Hide" : "Show"}</span>
      </button>
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
