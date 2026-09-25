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
import {
  Button,
  Banner,
  ChipButton,
  ChipRow,
  Field,
  InfoTip,
  Select,
  TextInput,
  Toggle,
} from "@/components/ui";
import { ArrowLeft, ArrowRight, Check, Coins, TrendUp, Trophy } from "@/components/icons";
import { ManagerSetup } from "@/components/host/ManagerSetup";
import { INDEX_FUND, MANAGER_PRESETS, type ManagerDraft } from "@/lib/game/manager";
import { createSession } from "@/lib/game/create-session";

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

// The manager game: 25 YEARS, a risk-free asset, 5 managers and a 0.05% index
// fund, 2x leverage available, scored against the index. Skill is real but tiny;
// the defaults are calibrated so the lesson lands without the host touching a dial.
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
  // the passive option students can buy, appended server-side after the shuffle
  index_fund: true,
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
/**
 * What create_session ACCEPTS, which is not what it stores. The host authors
 * alpha, so an edited line-up travels with its true parameters; the server
 * splits it into the public config and the server-only session_secrets.
 */
type CreateSessionPayload = Omit<SessionConfig, "managers"> & { managers?: ManagerDraft[] };

export function NewSessionPanel({ supabase }: { supabase: SupabaseClient }) {
  const [gameType, setGameType] = useState<GameType | null>(null);

  if (gameType === null) {
    return (
      // Sits edge to edge in the dashboard's "Start a game" panel, which
      // carries the title: three ruled columns, one per game, each a button.
      <div className="grid divide-y-[1.5px] divide-ink/15 sm:grid-cols-3 sm:divide-x-[1.5px] sm:divide-y-0">
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
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <CreateSessionForm supabase={supabase} gameType={gameType} onBack={() => setGameType(null)} />
    </div>
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
      // A ruled column, like a prospectus entry — the whole column is the
      // button, and it takes the amber band on hover.
      className="group flex flex-col px-5 pb-5 pt-5 text-left transition-colors hover:bg-brand-soft/60 focus-visible:bg-brand-soft/60"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-brand text-xl text-ink transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105">
        {icon}
      </span>
      <span className="mt-3 font-display text-lg font-extrabold uppercase tracking-tight text-ink">
        {title}
      </span>
      <span className="font-editorial text-sm italic text-ink-muted">{tagline}</span>
      <ul className="mt-3 space-y-1 text-sm text-ink-muted">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <Check className="mt-[3px] shrink-0 text-ink" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-1 pt-4 font-display text-sm font-extrabold text-ink">
        Set it up
        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" />
      </span>
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
  // The editable manager line-up. Only sent when the host has actually opened
  // Advanced — otherwise the server builds the preset itself, so there is one
  // source of truth for an untouched game.
  const [drafts, setDrafts] = useState<ManagerDraft[]>(() =>
    MANAGER_PRESETS.default.map((m) => ({ ...m })),
  );
  const [label, setLabel] = useState("");
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
    const payload: CreateSessionPayload = {
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
      // Untouched, the line-up is built SERVER-side from the preset name. Once
      // the host opens Advanced they are authoring alpha, so the full line-up
      // travels — validated server-side, and still split into public config and
      // session_secrets in the same transaction.
      ...(manager
        ? advanced
          ? { managers: drafts, num_managers: drafts.length }
          : { managers: undefined, num_managers: drafts.length }
        : { managers: undefined, num_managers: undefined, index_fund: undefined }),
      ...(portfolio || manager ? {} : { risk_free_rate: undefined }),
    };
    // One creation path, shared with "run it again" on the dashboard, so the
    // create-then-seed-bots sequence cannot drift between the two.
    const result = await createSession(supabase, {
      ...payload,
      label: label.trim() || undefined,
    } as Record<string, unknown>);

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.warning) {
      // The session exists and is playable; stay put and say what went wrong.
      setError(result.warning);
      setBusy(false);
      return;
    }
    router.push(`/host/${result.id}`);
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
        `Split your wealth across ${cfg.num_managers ?? 5} fund managers${
          cfg.index_fund === false ? "" : `, an index fund (${INDEX_FUND.mgmt_fee * 100}%/yr fee)`
        } and a ${Math.round((cfg.risk_free_rate ?? 0.03) * 100)}% risk-free asset`,
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
        ? "Plus 'The Index' — a passive competitor that pays no fees at all"
        : portfolio
          ? "Game includes four benchmark students: all-safe, one-basket, diversified, and half diversified risky & half safe"
          : "Plus 4 benchmark students: all-safe, edge, 50/50, all-risky",
    );
  }

  return (
    <div>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft /> Change game
        </button>
      ) : null}
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
          {manager ? "New manager session" : portfolio ? "New portfolio session" : "New basic session"}
        </h2>
        <InfoTip label="About session setup">
          {advanced
            ? "Customize the simulation, then start the lobby."
            : "Start with the standard setup, or flip on Advanced to change anything."}
        </InfoTip>
      </div>

      {/* Shown in the simple flow too: a join code is unrecognisable a week
          later, and anyone running several sections needs to tell them apart. */}
      <div className="mt-6">
        <Field label="Name this session" hint="Optional — only you see it">
          <TextInput
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Session name"
          />
        </Field>
      </div>

      {advanced && manager ? (
        <div className="mt-6">
          <ManagerSetup cfg={cfg} set={set} drafts={drafts} onDrafts={setDrafts} />
        </div>
      ) : null}

      {advanced && !manager ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {portfolio ? (
              <Field label="Risky assets" info="2–10 independent assets students can invest in.">
                <TextInput
                  type="number"
                  min={2}
                  max={10}
                  value={n}
                  onChange={(e) => setAssetCount(Number(e.target.value))}
                />
              </Field>
            ) : null}

            <Field
              label="Payoff mode"
              info="Moderate: the risky bet pays ×1.1 in a good market, ×0.9 in a bad one. Extreme: ×2 or ×0."
            >
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

            <Field
              label="Good-market probability"
              hint="0–1"
              info="The chance each market comes up good, as a decimal (0.6 = 60%). Only used when the server rolls the market (auto mode)."
            >
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
              <Field
                label="Risk-free rate per round"
                hint="0–0.5"
                info="What the safe asset earns each round, as a decimal: 0.05 means it grows 5% a round."
              >
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
                info="How much the risky assets move together. 0 = fully independent, 1 = they all share one market. Each asset's own odds are unchanged."
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
                <ChipRow className="mt-2" label="Preset correlations">
                  {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                    <ChipButton
                      key={v}
                      onClick={() => set("correlation", v)}
                      active={(cfg.correlation ?? 0) === v}
                      className="font-mono"
                    >
                      {v}
                    </ChipButton>
                  ))}
                </ChipRow>
              </Field>
            ) : null}

            <Field
              label="Market mode"
              info={
                portfolio
                  ? "Auto: the server rolls each asset's market. Manual: you pick each asset's outcome every round."
                  : "Auto: the server rolls the market. Manual: you pick good or bad every round."
              }
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
              // The one line that explains a disabled control stays on screen.
              hint={cfg.market_mode === "manual" ? "Manual mode forces shared" : undefined}
              info={
                portfolio
                  ? "Shared: one class-wide outcome per asset. Independent: every student draws their own."
                  : "Shared: one outcome for the whole class. Independent: every player draws their own."
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
                <div className="space-y-2 border-y-[1.5px] border-ink/15 py-3">
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
        </>
      ) : null}

      {/* Shared toggles apply to every game type, manager included. */}
      {advanced ? (
        <>
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
            {manager ? (
              <Toggle
                label={`Offer an index fund (${INDEX_FUND.mgmt_fee * 100}%/yr fee)`}
                checked={cfg.index_fund !== false}
                onChange={(v) => set("index_fund", v)}
              />
            ) : null}
            <Toggle
              label="Allow late join (after start)"
              checked={cfg.allow_late_join}
              onChange={(v) => set("allow_late_join", v)}
            />
          </div>
        </>
      ) : (
        <div className="mt-6 border-y-[1.5px] border-ink/15 py-4">
          <div className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">
            Standard setup
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
            {summary.map((line) => (
              <li key={line} className="flex gap-2">
                <Check className="mt-[3px] shrink-0 text-ink" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <Toggle
          label="Advanced setup (change all settings)"
          checked={advanced}
          onChange={setAdvanced}
        />
      </div>

      {error ? (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-6">
        <Button variant="gold" onClick={submit} disabled={busy} className="w-full text-lg shadow-pop">
          {busy ? (
            "Creating…"
          ) : (
            <>
              Create session <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
