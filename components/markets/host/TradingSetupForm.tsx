"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FrictionProfile, TradingPeriod } from "@/lib/game/types";
import {
  PERIODS,
  periodNoun,
  periodPlural,
  windowLength,
} from "@/lib/markets/clock";
import {
  TRADING_DEFAULTS,
  tradingConfigProblems,
  type MarketData,
  type TradingConfig,
} from "@/lib/markets/trading/config";
import type { MarketDataOptions } from "@/lib/markets/db";
import { tradeHostPath } from "@/lib/markets/routes";
import { createTradingSession } from "@/lib/markets/trading/create-session";
import {
  COOLDOWN_MAX,
  FRICTION_PRESETS,
  FRICTION_PROFILE_TEXT,
  FRICTION_PROFILES,
  KNOB_KEYS,
  KNOB_TEXT,
  PER_PLAYER_ASSIGNMENT_OFFERED,
  frictionSummary,
  overridesFrom,
  type FrictionKnobs,
} from "@/lib/research/friction";
import { configSummary } from "@/lib/markets/trading/summary";
import {
  Banner,
  Button,
  Card,
  ChipButton,
  Field,
  InfoTip,
  NumberField,
  TextInput,
  Toggle,
} from "@/components/ui";
import { ArrowRight, Check } from "@/components/icons";
import { useToast } from "@/components/Toast";

const MARKET_TEXT: Record<MarketData, string> = {
  historical: "Real history",
  simulated: "Simulated",
};

const PERIOD_TEXT: Record<TradingPeriod, string> = {
  year: "Year",
  half: "6 months",
  quarter: "Quarter",
  month: "Month",
  week: "Week",
};

// Every number the host can type, as the text in its box: a half-typed "0."
// must survive a render. Percent options are shown in percent.
type NumKey =
  | "num_rounds"
  | "round_seconds"
  | "starting_wealth"
  | "universe_size"
  | "initial_margin"
  | "maint_long"
  | "maint_short"
  | "borrow_fee"
  | "borrow_spread"
  | "spread"
  | "commission";

const PERCENT = new Set<NumKey>([
  "initial_margin",
  "maint_long",
  "maint_short",
  "borrow_fee",
  "borrow_spread",
  "spread",
]);

// What each option accepts, for the error under its box (the server's limits).
const LIMITS: Partial<Record<keyof TradingConfig, string>> = {
  num_rounds: "a whole number from 1 to 100",
  round_seconds: "a whole number from 30 to 600",
  starting_wealth: "between $1,000 and $10,000,000",
  universe_size: "a whole number from 5 to 25",
  initial_margin: "between 25% and 100%",
  maint_long: "at least 10% and no more than the initial margin",
  maint_short: "between 10% and 100%",
  borrow_fee: "between 0% and 50%",
  borrow_spread: "between 0% and 20%",
  spread: "between 0% and 2%",
  commission: "between $0 and $100",
};

const shown = (k: NumKey, v: number) =>
  String(PERCENT.has(k) ? Math.round(v * 100 * 1e6) / 1e6 : v);

function initialText(): Record<NumKey, string> {
  const out = {} as Record<NumKey, string>;
  for (const k of [
    "num_rounds",
    "round_seconds",
    "starting_wealth",
    "universe_size",
    "initial_margin",
    "maint_long",
    "maint_short",
    "borrow_fee",
    "borrow_spread",
    "spread",
    "commission",
  ] as NumKey[]) {
    out[k] = shown(k, TRADING_DEFAULTS[k]);
  }
  return out;
}

/**
 * The paper trading setup: what a round covers, how many, and how long the
 * class gets to trade, on screen; everything else behind "Advanced", summed up
 * in plain words while it is closed. Validation mirrors create_trading_session
 * (lib/markets/trading/config.ts), and the server is still the authority: it
 * also checks the market data covers the chosen era.
 */
export function TradingSetupForm({ supabase }: { supabase: SupabaseClient }) {
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [period, setPeriod] = useState<TradingPeriod>(TRADING_DEFAULTS.period);
  const [text, setText] = useState(initialText);
  const [flags, setFlags] = useState({
    margin_enabled: TRADING_DEFAULTS.margin_enabled,
    shorting_enabled: TRADING_DEFAULTS.shorting_enabled,
    headlines: TRADING_DEFAULTS.headlines,
    allow_late_join: TRADING_DEFAULTS.allow_late_join,
    show_full_leaderboard_to_students:
      TRADING_DEFAULTS.show_full_leaderboard_to_students,
  });
  const [friction, setFrictionState] = useState<FrictionProfile>(
    TRADING_DEFAULTS.friction_profile,
  );
  // "random": each student gets Low or High at random (built, not offered yet)
  const [assignRandom, setAssignRandom] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [knobs, setKnobs] = useState<FrictionKnobs>(
    FRICTION_PRESETS[TRADING_DEFAULTS.friction_profile],
  );
  const [cooldownText, setCooldownText] = useState(
    String(
      FRICTION_PRESETS[TRADING_DEFAULTS.friction_profile].cooldown_seconds,
    ),
  );
  const [researchMode, setResearchMode] = useState(
    TRADING_DEFAULTS.research_mode,
  );
  const setFriction = (f: FrictionProfile) => {
    setFrictionState(f);
    setAssignRandom(false);
    // a new preset starts the knobs over from it
    setKnobs(FRICTION_PRESETS[f]);
    setCooldownText(String(FRICTION_PRESETS[f].cooldown_seconds));
  };
  const setKnob = (k: keyof FrictionKnobs) => (v: boolean) =>
    setKnobs((x) => ({ ...x, [k]: v }));
  const [advanced, setAdvanced] = useState(false);
  const [pickYear, setPickYear] = useState(false);
  const [year, setYear] = useState("");
  // which markets the database holds (get_market_data_options, 0037); until it
  // answers, or if it fails, the server picks (real history when it has any)
  const [options, setOptions] = useState<MarketDataOptions | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  useEffect(() => {
    let live = true;
    supabase.rpc("get_market_data_options").then(({ data, error }) => {
      if (!live || error || !data) return;
      const o = data as MarketDataOptions;
      setOptions(o);
      setMarket(
        (m) =>
          m ?? (o.historical ? "historical" : o.simulated ? "simulated" : null),
      );
    });
    return () => {
      live = false;
    };
  }, [supabase]);
  const simulated = market === "simulated";
  const bothMarkets = !!options?.historical && !!options?.simulated;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the knobs as typed: the cooldown box is text so a half-typed number survives
  function effectiveKnobs(): FrictionKnobs {
    const t = cooldownText.trim();
    return { ...knobs, cooldown_seconds: t === "" ? NaN : Number(t) };
  }
  const shownKnobs = customize ? effectiveKnobs() : FRICTION_PRESETS[friction];

  const num = (k: NumKey): number => {
    const t = text[k].trim();
    if (t === "") return NaN;
    const v = Number(t);
    return PERCENT.has(k) ? Math.round((v / 100) * 1e8) / 1e8 : v;
  };
  const setNum = (k: NumKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setText((t) => ({ ...t, [k]: e.target.value }));
  const setFlag = (k: keyof typeof flags) => (v: boolean) =>
    setFlags((f) => ({ ...f, [k]: v }));

  const config: Partial<TradingConfig> = {
    ...(label.trim() ? { label: label.trim().slice(0, 60) } : {}),
    ...(market ? { market_data: market } : {}),
    period,
    num_rounds: num("num_rounds"),
    round_seconds: num("round_seconds"),
    starting_wealth: num("starting_wealth"),
    universe_size: num("universe_size"),
    initial_margin: num("initial_margin"),
    maint_long: num("maint_long"),
    maint_short: num("maint_short"),
    borrow_fee: num("borrow_fee"),
    borrow_spread: num("borrow_spread"),
    spread: num("spread"),
    commission: num("commission"),
    friction_profile: friction,
    friction_assignment: assignRandom ? "per_player" : "session",
    friction_arms: ["low", "high"],
    friction_overrides:
      customize && !assignRandom
        ? overridesFrom(friction, effectiveKnobs())
        : {},
    research_mode: researchMode,
    ...flags,
  };
  const problems = tradingConfigProblems(config);
  const errorFor = (k: keyof TradingConfig) =>
    problems.some((p) => p.field === k)
      ? `Must be ${LIMITS[k] ?? "valid"}`
      : null;
  const yearNum = Number(year);
  const ownYear = pickYear && !simulated;
  const yearBad =
    ownYear &&
    !(Number.isInteger(yearNum) && yearNum >= 1900 && yearNum < 2100);
  // A problem hidden in a closed Advanced section must still say where it is.
  const hiddenProblem =
    !advanced &&
    problems.some((p) => !["num_rounds", "round_seconds"].includes(p.field));

  const rounds = num("num_rounds");
  const noun = periodNoun(period);
  // Shown while Advanced is closed: the same words as the host's settings panel.
  const summary = configSummary({ ...TRADING_DEFAULTS, ...config });

  async function create() {
    setBusy(true);
    setError(null);
    const result = await createTradingSession(
      supabase,
      config,
      ownYear ? yearNum : null,
    );
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.warning) toast(result.warning);
    router.push(tradeHostPath(result.id));
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-ink">
          New paper trading session
        </h2>
        <InfoTip label="About paper trading">
          {simulated
            ? "Students trade stocks in a simulated market, one round at a time. Each round plays out the market over the period it covers."
            : "Students trade real stocks from a hidden stretch of history, one round at a time. Each round plays out the market over the period it covers; the real names and dates are revealed when the game ends."}
        </InfoTip>
      </div>

      <div className="mt-6 space-y-4">
        <Field label="Name this session" hint="Optional, only you see it">
          <TextInput
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Session name"
          />
        </Field>

        {bothMarkets ? (
          <div>
            <span className="mb-1 block text-sm font-semibold text-ink">
              Market data
            </span>
            <div
              role="group"
              aria-label="Market data"
              className="flex flex-wrap gap-1.5"
            >
              {(["historical", "simulated"] as const).map((m) => (
                <ChipButton
                  key={m}
                  active={market === m}
                  onClick={() => setMarket(m)}
                  className="min-w-[8rem]"
                >
                  {MARKET_TEXT[m]}
                </ChipButton>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <span className="mb-1 block text-sm font-semibold text-ink">
            Each round covers
          </span>
          <div
            role="group"
            aria-label="Each round covers"
            className="flex flex-wrap gap-1.5"
          >
            {PERIODS.map((p) => (
              <ChipButton
                key={p}
                active={period === p}
                onClick={() => setPeriod(p)}
                className="min-w-[5.5rem]"
              >
                {PERIOD_TEXT[p]}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Number of ${periodPlural(period)}`}
            hint={
              Number.isInteger(rounds) && rounds >= 1
                ? `${windowLength(period, rounds)} of market time`
                : undefined
            }
            error={errorFor("num_rounds")}
          >
            <NumberField
              value={text.num_rounds}
              min={1}
              max={100}
              inputMode="numeric"
              onChange={setNum("num_rounds")}
            />
          </Field>
          <Field
            label="Trading time each round"
            hint="You can add time during a round"
            error={errorFor("round_seconds")}
          >
            <NumberField
              suffix="s"
              value={text.round_seconds}
              min={30}
              max={600}
              inputMode="numeric"
              onChange={setNum("round_seconds")}
            />
          </Field>
        </div>
      </div>

      {advanced ? (
        <div className="mt-6 space-y-6">
          <Group title="Money">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starting cash" error={errorFor("starting_wealth")}>
                <NumberField
                  prefix="$"
                  value={text.starting_wealth}
                  inputMode="decimal"
                  onChange={setNum("starting_wealth")}
                />
              </Field>
              <Field
                label="Companies"
                hint="Plus an index fund"
                error={errorFor("universe_size")}
              >
                <NumberField
                  value={text.universe_size}
                  min={5}
                  max={25}
                  inputMode="numeric"
                  onChange={setNum("universe_size")}
                />
              </Field>
              <Field
                label="Spread"
                info="Every trade pays half of it: buys fill a little above the price, sells a little below."
                error={errorFor("spread")}
              >
                <NumberField
                  suffix="%"
                  value={text.spread}
                  inputMode="decimal"
                  step={0.01}
                  onChange={setNum("spread")}
                />
              </Field>
              <Field
                label="Commission per order"
                error={errorFor("commission")}
              >
                <NumberField
                  prefix="$"
                  value={text.commission}
                  inputMode="decimal"
                  onChange={setNum("commission")}
                />
              </Field>
            </div>
          </Group>

          <Group title="Margin">
            <Toggle
              label="Let students borrow to buy (margin)"
              checked={flags.margin_enabled}
              onChange={setFlag("margin_enabled")}
            />
            {flags.margin_enabled ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Initial margin"
                  info="The share of a purchase the student pays with their own money. 50% lets them buy up to 2× their account."
                  error={errorFor("initial_margin")}
                >
                  <NumberField
                    suffix="%"
                    value={text.initial_margin}
                    inputMode="decimal"
                    onChange={setNum("initial_margin")}
                  />
                </Field>
                <Field
                  label="Maintenance margin"
                  info="If equity falls below this share of the stocks held, the largest position is sold at the close."
                  error={errorFor("maint_long")}
                >
                  <NumberField
                    suffix="%"
                    value={text.maint_long}
                    inputMode="decimal"
                    onChange={setNum("maint_long")}
                  />
                </Field>
                <Field
                  label="Loan rate above T-bills"
                  info="A margin loan costs the T-bill rate of the day plus this, per year."
                  error={errorFor("borrow_spread")}
                >
                  <NumberField
                    suffix="%"
                    value={text.borrow_spread}
                    inputMode="decimal"
                    onChange={setNum("borrow_spread")}
                  />
                </Field>
              </div>
            ) : null}
          </Group>

          <Group title="Short selling">
            <Toggle
              label="Let students sell short"
              checked={flags.shorting_enabled}
              onChange={setFlag("shorting_enabled")}
            />
            {flags.shorting_enabled ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Borrow fee per year"
                  info="Charged daily on the value of every short position."
                  error={errorFor("borrow_fee")}
                >
                  <NumberField
                    suffix="%"
                    value={text.borrow_fee}
                    inputMode="decimal"
                    step={0.1}
                    onChange={setNum("borrow_fee")}
                  />
                </Field>
                <Field
                  label="Short maintenance"
                  info="A short position needs equity of at least this share of its value, or it is bought back at the close."
                  error={errorFor("maint_short")}
                >
                  <NumberField
                    suffix="%"
                    value={text.maint_short}
                    inputMode="decimal"
                    onChange={setNum("maint_short")}
                  />
                </Field>
              </div>
            ) : null}
          </Group>

          <Group title="Friction">
            <div
              role="group"
              aria-label="Friction"
              className="flex flex-wrap gap-1.5"
            >
              {FRICTION_PROFILES.map((f) => (
                <ChipButton
                  key={f}
                  active={!assignRandom && friction === f}
                  onClick={() => setFriction(f)}
                >
                  {FRICTION_PROFILE_TEXT[f].label}
                </ChipButton>
              ))}
              {PER_PLAYER_ASSIGNMENT_OFFERED ? (
                <ChipButton
                  active={assignRandom}
                  onClick={() => {
                    setAssignRandom(true);
                    setCustomize(false);
                  }}
                >
                  Low or High at random
                </ChipButton>
              ) : null}
            </div>
            {assignRandom ? (
              <p className="mt-2 text-sm text-ink-muted">
                Each student gets Low or High when they join, balanced across
                the class. Only you see who has which.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-muted">
                  {FRICTION_PROFILE_TEXT[friction].line}.
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                  {frictionSummary(
                    Number.isFinite(shownKnobs.cooldown_seconds)
                      ? shownKnobs
                      : { ...shownKnobs, cooldown_seconds: 0 },
                  ).map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-[3px] shrink-0 text-ink" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Toggle
                    label="Customize each setting"
                    checked={customize}
                    onChange={setCustomize}
                  />
                </div>
                {customize ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {KNOB_KEYS.filter((k) => k !== "cooldown_seconds").map(
                      (k) => (
                        <Toggle
                          key={k}
                          label={KNOB_TEXT[k]}
                          checked={knobs[k] as boolean}
                          onChange={setKnob(k)}
                        />
                      ),
                    )}
                    <Field
                      label={`${KNOB_TEXT.cooldown_seconds} (seconds)`}
                      error={
                        errorFor("friction_overrides")
                          ? `Must be a whole number from 0 to ${COOLDOWN_MAX}`
                          : null
                      }
                    >
                      <NumberField
                        value={cooldownText}
                        inputMode="numeric"
                        min={0}
                        max={COOLDOWN_MAX}
                        onChange={(e) => setCooldownText(e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}
              </>
            )}
          </Group>

          <Group title="Research">
            <Toggle
              label="Research mode (consent screen first)"
              checked={researchMode}
              onChange={setResearchMode}
            />
            <p className="mt-2 text-sm text-ink-muted">
              {researchMode
                ? "Students answer a consent screen before they play; only those who agree are recorded."
                : "Behaviour is logged for every student, under codes instead of names."}
            </p>
          </Group>

          <Group title="The class">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                label="Market headlines each round"
                checked={flags.headlines}
                onChange={setFlag("headlines")}
              />
              <Toggle
                label="Show full leaderboard to students"
                checked={flags.show_full_leaderboard_to_students}
                onChange={setFlag("show_full_leaderboard_to_students")}
              />
              <Toggle
                label="Allow late join (after start)"
                checked={flags.allow_late_join}
                onChange={setFlag("allow_late_join")}
              />
            </div>
          </Group>

          {simulated ? null : (
            <Group title="Era">
              <Toggle
                label="Pick the era myself"
                checked={pickYear}
                onChange={setPickYear}
              />
              {pickYear ? (
                <div className="mt-4 sm:max-w-[16rem]">
                  <Field
                    label="Year 1 is"
                    hint="The real year the game starts in. Students never see it."
                    error={
                      yearBad && year !== "" ? "Enter a year, like 1987" : null
                    }
                  >
                    <NumberField
                      value={year}
                      inputMode="numeric"
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  The server picks a random era with enough data for this many{" "}
                  {periodPlural(period)}.
                </p>
              )}
            </Group>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border-2 border-ink bg-brand-soft p-4 shadow-card">
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

      {hiddenProblem ? (
        <div className="mt-4">
          <Banner kind="error">
            An advanced setting is out of range. Open Advanced setup to fix it.
          </Banner>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      ) : null}

      <div className="mt-6">
        <Button
          variant="gold"
          onClick={create}
          disabled={busy || problems.length > 0 || yearBad}
          className="w-full text-lg shadow-pop"
        >
          {busy ? (
            "Creating…"
          ) : (
            <>
              Create session <ArrowRight />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 font-display text-xs font-extrabold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}
