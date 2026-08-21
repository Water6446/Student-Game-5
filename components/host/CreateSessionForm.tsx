"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CONFIG,
  type AssetConfig,
  type GameType,
  type SessionConfig,
} from "@/lib/game/types";
import { assetName, numAssets } from "@/lib/game/portfolio";
import { money } from "@/lib/game/format";
import { Button, Banner, Card, Field, Select, TextInput, Toggle } from "@/components/ui";
import { ArrowLeft, Coins, TrendUp, Trophy } from "@/components/icons";

// "Base setup": the recommended one-click default per game. The professor's
// basic game is the extreme 2×/0× payoff with an INDEPENDENT outcome per
// student. The portfolio game defaults to 4 identical independent assets with
// ONE class-wide outcome per asset each round (a shared "market moment") and a
// flat 0% safe pot. Advanced mode lets the host change any of it.
const BASE_SETUP: SessionConfig = {
  ...DEFAULT_CONFIG,
  game_type: "basic",
  payoff_mode: "extreme",
  market_scope: "independent",
  // The 4 fixed-strategy benchmark students ship on by default so every game
  // has baselines to compare against.
  add_benchmark_bots: true,
};

// The manager game: 25 YEARS, a risk-free asset and 5 managers, 2x leverage
// available, scored against an index you cannot buy. Skill is real but tiny; the
// defaults are calibrated so the lesson lands without the host touching a dial.
const MANAGER_BASE_SETUP: SessionConfig = {
  ...DEFAULT_CONFIG,
  game_type: "manager",
  market_scope: "shared",
  market_mode: "auto",
  num_rounds: 25,
  num_managers: 5,
  market_mean: 0.08,
  market_sd: 0.16,
  risk_free_rate: 0.03,
  borrow_spread: 0.05,
  leverage_cap: 2,
  shuffle_skill: true,
  manager_preset: "default",
  // one synthetic competitor: 'The Index'
  add_benchmark_bots: true,
};

const PORTFOLIO_BASE_SETUP: SessionConfig = {
  ...DEFAULT_CONFIG,
  game_type: "portfolio",
  payoff_mode: "extreme",
  market_scope: "shared",
  num_assets: 4,
  risk_free_rate: 0,
  correlation: 0,
  assets: null,
  add_benchmark_bots: true,
};

/**
 * The "host a game" entry point: pick which game to run, THEN configure it.
 * Everything downstream (lobby, rounds, summary) is shared.
 */
export function NewSessionPanel({ supabase }: { supabase: SupabaseClient }) {
  const [gameType, setGameType] = useState<GameType | null>(null);

  if (gameType === null) {
    return (
      <Card>
        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
          Host a game
        </h2>
        <p className="mt-1 font-editorial text-sm italic text-ink-muted">
          Pick which simulation to run, then tune its settings.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <GameCard
            title="Basic Risk Game"
            tagline="One risky bet vs. the safe pot"
            lines={[
              "Each round: choose how much to put at risk",
              "The market comes up GOOD or BAD",
              "The original all-or-nothing lesson",
            ]}
            icon={<Coins />}
            onClick={() => setGameType("basic")}
          />
          <GameCard
            title="Portfolio Risk Game"
            tagline="Spread wealth across independent assets"
            lines={[
              "Several risky assets, each with its own market",
              "You pick how many assets are in play",
              "Diversification vs. one big basket",
            ]}
            icon={<TrendUp />}
            onClick={() => setGameType("portfolio")}
          />
          <GameCard
            title="The Manager Game"
            tagline="Active vs. passive, over a career"
            lines={[
              "Each round is a year — hire from 5 fund managers",
              "Borrow up to 2× if you back your judgement",
              "Skill is real, tiny, and nearly invisible; fees are not",
            ]}
            icon={<Trophy />}
            onClick={() => setGameType("manager")}
          />
        </div>
      </Card>
    );
  }

  return (
    <CreateSessionForm supabase={supabase} gameType={gameType} onBack={() => setGameType(null)} />
  );
}

function GameCard({
  title,
  tagline,
  lines,
  icon,
  onClick,
}: {
  title: string;
  tagline: string;
  lines: string[];
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-2xl border-2 border-ink bg-paper-2 p-5 text-left shadow-card transition hover:bg-brand-soft active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-brand text-xl text-ink">
        {icon}
      </span>
      <span className="mt-3 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
        {title}
      </span>
      <span className="font-editorial text-sm italic text-ink-muted">{tagline}</span>
      <ul className="mt-3 space-y-1 text-sm text-ink-muted">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span className="text-ink">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export function CreateSessionForm({
  supabase,
  gameType,
  onBack,
}: {
  supabase: SupabaseClient;
  gameType: GameType;
  onBack?: () => void;
}) {
  const router = useRouter();
  const portfolio = gameType === "portfolio";
  const manager = gameType === "manager";
  const [cfg, setCfg] = useState<SessionConfig>(
    manager
      ? { ...MANAGER_BASE_SETUP }
      : portfolio
        ? { ...PORTFOLIO_BASE_SETUP }
        : { ...BASE_SETUP },
  );
  const [advanced, setAdvanced] = useState(false);
  const [customAssets, setCustomAssets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  const n = numAssets(cfg);

  function setAssetCount(count: number) {
    const clamped = Math.max(2, Math.min(10, Math.round(count) || 2));
    setCfg((c) => ({
      ...c,
      num_assets: clamped,
      assets: customAssets
        ? Array.from({ length: clamped }, (_, i) => c.assets?.[i] ?? {})
        : c.assets,
    }));
  }

  function toggleCustomAssets(on: boolean) {
    setCustomAssets(on);
    set("assets", on ? Array.from({ length: n }, (_, i) => cfg.assets?.[i] ?? {}) : null);
  }

  function setAsset(i: number, patch: Partial<AssetConfig>) {
    setCfg((c) => {
      const assets = Array.from({ length: numAssets(c) }, (_, j) => c.assets?.[j] ?? {});
      assets[i] = { ...assets[i], ...patch };
      return { ...c, assets };
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    // manual market implies a single shared outcome (per asset); reflect it in
    // the UI payload. Drop empty per-asset overrides entirely.
    const cleanedAssets = customAssets
      ? Array.from({ length: n }, (_, i) => {
          const a = cfg.assets?.[i] ?? {};
          const out: AssetConfig = {};
          if (a.name?.trim()) out.name = a.name.trim();
          if (a.good_prob != null && Number.isFinite(a.good_prob)) out.good_prob = a.good_prob;
          if (a.payoff_mode) out.payoff_mode = a.payoff_mode;
          return out;
        })
      : null;
    const payload: SessionConfig = {
      ...cfg,
      market_scope: cfg.market_mode === "manual" ? "shared" : cfg.market_scope,
      ...(portfolio
        ? {
            num_assets: n,
            risk_free_rate: cfg.risk_free_rate ?? 0,
            correlation: cfg.correlation ?? 0,
            assets: cleanedAssets,
          }
        : { num_assets: undefined, correlation: undefined, assets: undefined }),
      // The manager line-up is built SERVER-side from the preset: alpha never
      // travels through the client, and the skill shuffle has to happen in the
      // same transaction that writes session_secrets.
      ...(manager ? {} : { managers: undefined, num_managers: undefined }),
      ...(portfolio || manager ? {} : { risk_free_rate: undefined }),
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

    // optionally add the 4 fixed-strategy benchmark "bot" players (the server
    // picks the right strategy set for the game type)
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
  const rfPct = Math.round((cfg.risk_free_rate ?? 0) * 100);
  const marketPct = Math.round((cfg.market_mean ?? 0.08) * 100);
  const sdPct = Math.round((cfg.market_sd ?? 0.16) * 100);
  const borrowPct = Math.round(
    ((cfg.risk_free_rate ?? 0.03) + (cfg.borrow_spread ?? 0.05)) * 100,
  );
  const summary = manager
    ? [
        `Each round is a YEAR — ${cfg.num_rounds} years, ${money(cfg.starting_wealth)} starting wealth`,
        `Split your wealth across ${cfg.num_managers ?? 5} fund managers and a ${Math.round((cfg.risk_free_rate ?? 0.03) * 100)}% risk-free asset`,
        `The index returns ${marketPct}%/yr on average, with ${sdPct}% volatility`,
        (cfg.leverage_cap ?? 2) > 1
          ? `Students may borrow up to ${cfg.leverage_cap ?? 2}× their wealth at ${borrowPct}%/yr`
          : "No leverage — students can invest at most their wealth",
        "Managers charge fees every year, win or lose",
        cfg.shuffle_skill === false
          ? "Skill stays with the same manager every session"
          : "Which manager is genuinely skilled is reshuffled each session",
      ]
    : portfolio
    ? [
        `Split your wealth across ${n} risky assets + a safe asset`,
        cfg.payoff_mode === "extreme"
          ? "Each risky asset pays 2× if its market is good, 0× (total loss) if bad"
          : "Each risky asset pays ×1.1 if its market is good, ×0.9 if bad",
        (cfg.correlation ?? 0) === 0
          ? "Risky assets are independent"
          : (cfg.correlation ?? 0) >= 1
            ? "Risky assets move together (ρ = 1, one market)"
            : `Risky assets are partially correlated (ρ = ${(cfg.correlation ?? 0).toFixed(2)})`,
        `${cfg.num_rounds} rounds · ${money(cfg.starting_wealth)} starting wealth`,
        cfg.market_mode === "manual"
          ? "You pick each asset's outcome every round"
          : cfg.market_scope === "shared"
            ? `Class has common outcomes for each asset in each round — ${goodPct}% chance each is good`
            : `Each student draws their own outcome per asset — ${goodPct}% chance of good`,
        rfPct > 0 ? `Safe asset earns ${rfPct}% interest per round` : "Safe asset returns capital",
      ]
    : [
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
    summary.push(
      manager
        ? "Plus 'The Index' — a passive competitor with no fees that students cannot buy"
        : portfolio
          ? "Game includes four benchmark students: all-safe, one-basket, diversified, and half diversified risky & half safe"
          : "Plus 4 benchmark students: all-safe, edge, 50/50, all-risky",
    );
  }

  return (
    <Card>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft /> Change game
        </button>
      ) : null}
      <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
        {manager ? "New manager session" : portfolio ? "New portfolio session" : "New basic session"}
      </h2>
      <p className="mt-1 font-editorial text-sm italic text-ink-muted">
        {advanced
          ? "Customize the simulation, then start the lobby."
          : "Start with the standard setup, or flip on Advanced to change anything."}
      </p>

      {advanced ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {portfolio ? (
              <Field label="Risky assets" hint="2–10 independent assets students can invest in">
                <TextInput
                  type="number"
                  min={2}
                  max={10}
                  value={n}
                  onChange={(e) => setAssetCount(Number(e.target.value))}
                />
              </Field>
            ) : null}

            <Field label="Payoff mode" hint="moderate: ×1.1/×0.9 · extreme: ×2/×0">
              <Select
                value={cfg.payoff_mode}
                onChange={(e) => set("payoff_mode", e.target.value as SessionConfig["payoff_mode"])}
              >
                <option value="moderate">Moderate (1.1)</option>
                <option value="extreme">Extreme (2x)</option>
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

            {portfolio ? (
              <Field label="Risk-free rate per round" hint="0–0.5 · e.g. 0.05 = safe asset grows 5%/round">
                <TextInput
                  type="number"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={cfg.risk_free_rate ?? 0}
                  onChange={(e) => set("risk_free_rate", Number(e.target.value))}
                />
              </Field>
            ) : null}

            {portfolio ? (
              <Field
                label={`Correlation ρ = ${(cfg.correlation ?? 0).toFixed(2)}`}
                hint="0 = independent · 1 = one market. Per-asset odds unchanged."
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cfg.correlation ?? 0}
                    onChange={(e) => set("correlation", Number(e.target.value))}
                    className="w-full"
                    aria-label="Asset correlation"
                  />
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("correlation", v)}
                      className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold transition ${
                        (cfg.correlation ?? 0) === v
                          ? "border-play/30 bg-play-soft text-play"
                          : "border-line-strong bg-paper text-ink-muted hover:border-ink-subtle"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field
              label="Market mode"
              hint={portfolio ? "manual: you pick each asset's outcome" : undefined}
            >
              <Select
                value={cfg.market_mode}
                onChange={(e) => set("market_mode", e.target.value as SessionConfig["market_mode"])}
              >
                <option value="auto">Auto (server rolls)</option>
                <option value="manual">
                  {portfolio ? "Manual (you pick per asset)" : "Manual (host picks Good/Bad)"}
                </option>
              </Select>
            </Field>

            <Field
              label="Market scope"
              hint={
                cfg.market_mode === "manual"
                  ? "manual forces shared"
                  : portfolio
                    ? "shared: one class-wide outcome per asset · independent: per student"
                    : "shared: one outcome · independent: per player"
              }
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

          {portfolio ? (
            <div className="mt-4 space-y-3">
              <Toggle
                label="Customize assets individually (odds / payoff / names)"
                checked={customAssets}
                onChange={toggleCustomAssets}
              />
              {customAssets ? (
                <div className="space-y-2 rounded-xl border-2 border-ink bg-paper-2 p-3 shadow-card">
                  {/* Three columns need ~450px; below sm the fields stack and
                      carry their own labels instead. */}
                  <div className="hidden gap-2 text-xs font-bold uppercase tracking-wide text-ink-subtle sm:grid sm:grid-cols-[1fr_110px_150px]">
                    <span>Name</span>
                    <span>Good prob</span>
                    <span>Payoff</span>
                  </div>
                  {Array.from({ length: n }, (_, i) => {
                    const a = cfg.assets?.[i] ?? {};
                    return (
                      <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_150px]">
                        <TextInput
                          placeholder={assetName({ ...cfg, assets: null }, i)}
                          value={a.name ?? ""}
                          onChange={(e) => setAsset(i, { name: e.target.value })}
                          aria-label={`Name for asset ${i + 1}`}
                          className="min-w-0 px-3 py-2 text-sm"
                        />
                        <TextInput
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          placeholder={String(cfg.good_prob)}
                          aria-label={`Good probability for asset ${i + 1}`}
                          value={a.good_prob ?? ""}
                          onChange={(e) =>
                            setAsset(i, {
                              good_prob:
                                e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="min-w-0 px-3 py-2 text-sm"
                        />
                        <Select
                          aria-label={`Payoff mode for asset ${i + 1}`}
                          value={a.payoff_mode ?? ""}
                          onChange={(e) =>
                            setAsset(i, {
                              payoff_mode:
                                e.target.value === ""
                                  ? undefined
                                  : (e.target.value as AssetConfig["payoff_mode"]),
                            })
                          }
                          className="min-w-0 px-3 py-2 text-sm"
                        >
                          <option value="">Game default</option>
                          <option value="moderate">Moderate (1.1)</option>
                          <option value="extreme">Extreme (2x)</option>
                        </Select>
                      </div>
                    );
                  })}
                  <p className="text-xs text-ink-subtle">
                    Blank fields fall back to the game-level settings above.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Show full leaderboard to students"
              checked={cfg.show_full_leaderboard_to_students}
              onChange={(v) => set("show_full_leaderboard_to_students", v)}
            />
            {/* The manager game has no good/bad odds to show. */}
            {manager ? null : (
              <Toggle
                label="Show market odds to students"
                checked={cfg.show_odds_to_students}
                onChange={(v) => set("show_odds_to_students", v)}
              />
            )}
            <Toggle
              label={manager ? "Add 'The Index' as a competitor" : "Add 4 benchmark students (bots)"}
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
        <div className="mt-6 rounded-xl border-2 border-ink bg-brand-soft p-4 shadow-card">
          <div className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">
            Standard setup
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            {summary.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-ink">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {/* The manager game's advanced panel (per-manager beta/alpha/fees) is
            Stage 5; until then the calibrated default preset is the only setup. */}
        {manager ? null : (
          <Toggle
            label="Advanced setup (change all settings)"
            checked={advanced}
            onChange={setAdvanced}
          />
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-6">
        <Button variant="gold" onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create session"}
        </Button>
      </div>
    </Card>
  );
}
