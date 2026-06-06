"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CONFIG, type SessionConfig } from "@/lib/game/types";
import { Button, Banner, Card, Field, Select, TextInput, Toggle } from "@/components/ui";

export function CreateSessionForm({ supabase }: { supabase: SupabaseClient }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<SessionConfig>({ ...DEFAULT_CONFIG });
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
    router.push(`/host/${created.id}`);
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold">New session</h2>
      <p className="mt-1 text-sm text-slate-400">Configure the simulation, then start the lobby.</p>

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
          label="Allow late join (after start)"
          checked={cfg.allow_late_join}
          onChange={(v) => set("allow_late_join", v)}
        />
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
