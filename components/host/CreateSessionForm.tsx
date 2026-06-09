"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CONFIG, type SessionConfig } from "@/lib/game/types";
import { money } from "@/lib/game/format";
import { Button, Banner, Card, Field, Select, TextInput, Toggle } from "@/components/ui";

// "Base setup": the recommended one-click default. The professor's base game is
// the extreme 2×/0× payoff with an INDEPENDENT market outcome per student.
// Everything else (25 rounds, $100, 60% good, auto) matches DEFAULT_CONFIG.
// Advanced mode lets the host change any of it.
const BASE_SETUP: SessionConfig = {
  ...DEFAULT_CONFIG,
  payoff_mode: "extreme",
  market_scope: "independent",
  // The 4 fixed-strategy benchmark students ship on by default so every game
  // has all-safe / edge / 50-50 / all-risky baselines to compare against.
  add_benchmark_bots: true,
};

export function CreateSessionForm({ supabase }: { supabase: SupabaseClient }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<SessionConfig>({ ...BASE_SETUP });
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    // manual market implies a single shared outcome; reflect it in the UI payload
    const payload: SessionConfig = {
      ...cfg,
      market_scope: cfg.market_mode === "manual" ? "shared" : cfg.market_scope,
    };
    const { data, error } = await supabase
      .rpc("create_session", { p_config: payload })
      .select()
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const created = data as { id: string; join_code: string };

    // optionally add the 4 fixed-strategy benchmark "bot" players
    if (payload.add_benchmark_bots) {
      const { error: botErr } = await supabase.rpc("add_benchmark_bots", {
        p_session_id: created.id,
      });
      if (botErr) {
        // non-fatal: the session exists; just surface the issue and stay put
        setError(`Session created, but adding benchmark students failed: ${botErr.message}`);
        setBusy(false);
        return;
      }
    }
    router.push(`/host/${created.id}`);
  }

  // Plain-language summary of the current config (stays accurate even if the host
  // tweaked things in advanced mode and then collapsed it).
  const goodPct = Math.round((cfg.good_prob ?? 0.6) * 100);
  const summary = [
    cfg.payoff_mode === "extreme"
      ? "Risky bet pays 2× if the market is good, and 0× (wiped out) if it's bad"
      : "Risky bet pays ×1.1 if the market is good, ×0.9 if it's bad",
    `${cfg.num_rounds} rounds · ${money(cfg.starting_wealth)} starting wealth`,
    cfg.market_mode === "auto"
      ? `Server rolls the market each round — ${goodPct}% chance it's good`
      : "You pick the market (good / bad) each round",
    cfg.market_mode === "manual" || cfg.market_scope === "shared"
      ? "Everyone gets the same market outcome"
      : "Each student gets an independent outcome",
  ];
  if (cfg.add_benchmark_bots) {
    summary.push("Plus 4 benchmark students: all-safe, edge, 50/50, all-risky");
  }

  return (
    <Card>
      <h2 className="text-xl font-bold text-ink">New session</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {advanced
          ? "Customize the simulation, then start the lobby."
          : "Start with the standard setup, or flip on Advanced to change anything."}
      </p>

      {advanced ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Payoff mode" hint="moderate: ×1.1/×0.9 · extreme: ×2/×0">
              <Select
                value={cfg.payoff_mode}
                onChange={(e) => set("payoff_mode", e.target.value as SessionConfig["payoff_mode"])}
              >
                <option value="moderate">Moderate (×1.1 / ×0.9)</option>
                <option value="extreme">Extreme (×2 / ×0)</option>
              </Select>
            </Field>

            <Field label="Number of rounds">
              <TextInput
                type="number"
                min={1}
                max={200}
                value={cfg.num_rounds}
                onChange={(e) => set("num_rounds", Number(e.target.value))}
              />
            </Field>

            <Field label="Starting wealth ($)">
              <TextInput
                type="number"
                min={1}
                value={cfg.starting_wealth}
                onChange={(e) => set("starting_wealth", Number(e.target.value))}
              />
            </Field>

            <Field label="Good-market probability" hint="0–1, used in auto mode">
              <TextInput
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={cfg.good_prob}
                onChange={(e) => set("good_prob", Number(e.target.value))}
              />
            </Field>

            <Field label="Market mode">
              <Select
                value={cfg.market_mode}
                onChange={(e) => set("market_mode", e.target.value as SessionConfig["market_mode"])}
              >
                <option value="auto">Auto (server rolls)</option>
                <option value="manual">Manual (host picks Good/Bad)</option>
              </Select>
            </Field>

            <Field
              label="Market scope"
              hint={cfg.market_mode === "manual" ? "manual forces shared" : "shared: one outcome · independent: per player"}
            >
              <Select
                value={cfg.market_mode === "manual" ? "shared" : cfg.market_scope}
                disabled={cfg.market_mode === "manual"}
                onChange={(e) => set("market_scope", e.target.value as SessionConfig["market_scope"])}
              >
                <option value="shared">Shared</option>
                <option value="independent">Independent</option>
              </Select>
            </Field>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Show full leaderboard to students"
              checked={cfg.show_full_leaderboard_to_students}
              onChange={(v) => set("show_full_leaderboard_to_students", v)}
            />
            <Toggle
              label="Show market odds to students"
              checked={cfg.show_odds_to_students}
              onChange={(v) => set("show_odds_to_students", v)}
            />
            <Toggle
              label="Add 4 benchmark students (bots)"
              checked={cfg.add_benchmark_bots}
              onChange={(v) => set("add_benchmark_bots", v)}
            />
            <Toggle
              label="Allow late join (after start)"
              checked={cfg.allow_late_join}
              onChange={(v) => set("allow_late_join", v)}
            />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-brand/20 bg-brand-soft/50 p-4">
          <div className="text-sm font-bold text-brand-strong">Standard setup</div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            {summary.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-brand">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <Toggle label="Advanced setup (change all settings)" checked={advanced} onChange={setAdvanced} />
      </div>

      {error ? (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-6">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create session"}
        </Button>
      </div>
    </Card>
  );
}
