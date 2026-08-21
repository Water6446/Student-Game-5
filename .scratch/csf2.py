import sys
sys.path.insert(0, ".scratch")
from edit import patch

patch("components/host/CreateSessionForm.tsx", [
(
'''  const summary = portfolio
    ? [''',
'''  const marketPct = Math.round((cfg.market_mean ?? 0.08) * 100);
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
    ? ['''
),
(
'''  if (cfg.add_benchmark_bots) {
    summary.push(
      portfolio
        ? "Game includes four benchmark students: all-safe, one-basket, diversified, and half diversified risky & half safe"
        : "Plus 4 benchmark students: all-safe, edge, 50/50, all-risky",
    );
  }''',
'''  if (cfg.add_benchmark_bots) {
    summary.push(
      manager
        ? "Plus 'The Index' — a passive competitor with no fees that students cannot buy"
        : portfolio
          ? "Game includes four benchmark students: all-safe, one-basket, diversified, and half diversified risky & half safe"
          : "Plus 4 benchmark students: all-safe, edge, 50/50, all-risky",
    );
  }'''
),
(
'''            <Toggle
              label="Show market odds to students"
              checked={cfg.show_odds_to_students}
              onChange={(v) => set("show_odds_to_students", v)}
            />
            <Toggle
              label="Add 4 benchmark students (bots)"
              checked={cfg.add_benchmark_bots}
              onChange={(v) => set("add_benchmark_bots", v)}
            />''',
'''            {/* The manager game has no good/bad odds to show. */}
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
            />'''
),
(
'''        <Toggle label="Advanced setup (change all settings)" checked={advanced} onChange={setAdvanced} />''',
'''        {/* The manager game's advanced panel (per-manager beta/alpha/fees) is
            Stage 5; until then the calibrated default preset is the only setup. */}
        {manager ? null : (
          <Toggle
            label="Advanced setup (change all settings)"
            checked={advanced}
            onChange={setAdvanced}
          />
        )}'''
),
])
