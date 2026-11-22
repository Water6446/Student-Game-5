/**
 * Every string on the marketing homepage lives here so copy and prices can be
 * edited without touching layout. Components import these and render them; they
 * never inline their own text.
 *
 * Voice: measured and academic. Short declarative sentences, concrete nouns, no
 * salesmanship and no swagger. The plain sub-lines are the only place the
 * register warms up, and even there it stays plain.
 *
 * Unresolved values are left as literal `TODO(max) …` strings and rendered as
 * visible placeholders — never as an invented price or a dead link. Use
 * `isTodo()` to branch on them.
 */

import { marketsEnabled } from "../markets/flags";

/** Names of icons from `components/icons.tsx`, resolved in `icon-map.tsx`. */
export type IconName =
  | "chart"
  | "coins"
  | "trendUp"
  | "users"
  | "monitor"
  | "sparkle"
  | "sliders"
  | "lock"
  | "download"
  | "check"
  | "trophy"
  | "flag"
  | "shuffle"
  | "mail"
  | "github"
  | "globe";

/** True for any value Max still has to supply. Such values render as text. */
export function isTodo(value: string): boolean {
  return value.startsWith("TODO(max)");
}

export const SITE = {
  name: "The Risk Game",
  /** one line, used in the footer and the metadata description */
  blurb:
    "A live, in-class investment-risk simulation. Students participate from their phones while you run the market from the front of the room.",
  email: "maxalexjansen@gmail.com",
  personalSiteUrl: "https://max-jansen.com",
} as const;

// Absolute, not bare fragments: the header now rides on /login, /host and
// /account too, where "#how" would scroll nowhere. On the homepage itself the
// path is unchanged, so the browser still treats it as an in-page scroll.
//
// "Markets" is a page, not a homepage section: the header marks it current on
// /markets and everything under it (isInSection). It is listed only while the
// section is switched on (NEXT_PUBLIC_ENABLE_MARKETS, inlined at build time).
export const MARKETS_NAV = { label: "Markets", href: "/markets" } as const;

export const NAV_LINKS: readonly { label: string; href: string }[] = [
  { label: "How it works", href: "/#how" },
  { label: "The games", href: "/#games" },
  ...(marketsEnabled() ? [MARKETS_NAV] : []),
  // { label: "Pricing", href: "/#pricing" },  ← restore with the Pricing section
];

export const HEADER = {
  /** a text link on wide screens; the phone header's one button (short label) */
  joinCta: { label: "Join a game", short: "Join", href: "/join" },
  /**
   * The bar's amber action. The label never changes with who is looking — only
   * where it goes: straight to the dashboard when signed in, via sign-in when
   * not. A button that renamed itself resized itself, and moved everything
   * beside it.
   */
  hostCta: {
    label: "Host a session",
    href: "/host",
    signedOutHref: "/login?next=%2Fhost",
  },
  loginCta: { label: "Log in", href: "/login" },
  menuLabel: { open: "Open menu", close: "Close menu" },
} as const;

/**
 * The sign-in page. Deliberately almost empty: someone on it has already decided
 * to sign in, so the only copy here is the way out for a student who wanted to
 * join a game instead.
 */
export const LOGIN = {
  joinPrompt: "Here to play rather than host?",
  joinCta: "Join a game with a code",
} as const;

/**
 * The student join page. Same frame as the rest of the site, but the copy stays
 * short: whoever is reading it is standing in a lecture theatre with a code on
 * the screen behind them.
 */
export const JOIN = {
  eyebrow: "Student",
  heading: "Join a game.",
  sub: "Enter the code your professor is showing.",
  hostPrompt: "Running the class rather than playing?",
  hostCta: "Host a session",
} as const;

export const HERO = {
  eyebrow: "In-class market simulation",
  /** The headline is two lines of Archivo black; the second is set in amber. */
  headlineLead: "A classroom simulation",
  headlineEmphasis: "of investment risk.",
  sub: "A hands-on way to learn how investment risk really works. Each round you divide your wealth between a safe and a risky asset, the market turns, and you see how your choices stack up against every other strategy in the room. For classrooms, client workshops, and anyone curious about the tradeoff between playing it safe and reaching for more.",
  primary: { label: "Host a session", href: "/host" },
  secondary: { label: "Join with a code", href: "/join" },
  note: "Students join without accounts · Works on any phone · Free while in pilot",
  /**
   * Full-bleed hero image. Until a real photograph exists the hero renders a
   * designed ink stage instead — never a stock photo, never a generated one.
   * Drop a file in `public/` and put its path here.
   */
  photo: {
    src: "TODO(max) hero photo",
    alt: "A lecture hall mid-session, the projector showing the market reveal.",
  },
  /** The quiet line in the lower corner of the stage. */
  aside:
    "In each round a student holds a balance, decides how much of it to put at risk, and the market outcome is drawn from the odds the instructor has set.",
  /** Numbers row under the stage. Product facts, not usage statistics. */
  stats: [
    { value: "3", label: "game types" },
    { value: "25", label: "rounds by default" },
    // The player cap enforced in 0018_quotas.sql — keep the two in step.
    { value: "400", label: "players per session" },
    { value: "15", label: "minutes a session" },
  ],
  /** Chip floating over the stage next to the allocation card. */
  marketChip: { label: "Market up", detail: "risky ×1.1" },
  /**
   * Step three of the story the right-hand column tells: decide (the card),
   * the market moves (the chip), then the reveal. A static replica of the
   * student's post-reveal screen (StudentRound's result + StudentBoard), and
   * its numbers follow from the card above it: $38 safe + $62 risky × 1.1 =
   * $106.20, i.e. +$6.20. No bots in the list: 0013 keeps them out of every
   * student-facing ranking, so showing them here would misrepresent the app.
   */
  standings: {
    wealthLabel: "New wealth",
    wealth: "$106.20",
    delta: "+$6.20 this round",
    rankLead: "You're",
    rank: "3rd",
    rankTail: "of 28",
    rows: [
      { rank: 1, name: "Priya", wealth: "$118.40", me: false },
      { rank: 2, name: "Marcus", wealth: "$111.75", me: false },
      { rank: 3, name: "Sam", wealth: "$106.20", me: true },
      { rank: 4, name: "Dana", wealth: "$104.10", me: false },
    ],
  },
  /**
   * A static replica of the student allocation step, built from the same
   * classes as `components/student/AllocationInput.tsx` so the preview is
   * honest. Numbers are consistent: $100 wealth, 62% risky. These strings are
   * the app's own, not marketing copy: they must match what it renders.
   */
  prop: {
    roundLabel: "Round 4 / 25",
    wealthLabel: "Your wealth",
    wealth: "$100.00",
    safe: { label: "Safe", amount: "$38.00" },
    risky: { label: "Risky", amount: "$62.00" },
    /** drives the meter fill; the risky share of wealth, as a percent */
    riskyShare: 62,
    scaleStart: "ALL SAFE",
    scaleEnd: "ALL RISKY",
    lockedTitle: "Nice. Now we wait.",
  },
} as const;

export const HOW_IT_WORKS = {
  id: "how",
  eyebrow: "01 / Setup",
  heading: "Setting up and running a session.",
  steps: [
    {
      n: "1",
      title: "Create the session.",
      body: "Select the game, the number of rounds, and the market probabilities. A join code and a QR code are issued in about thirty seconds.",
    },
    {
      n: "2",
      title: "Students join from their phones.",
      body: "They scan or enter the code. Installation, accounts, and email addresses are all unnecessary.",
    },
    {
      n: "3",
      title: "Run the rounds.",
      body: "Students allocate, you lock submissions, the market resolves on the projector, and the standings update. This repeats for as many rounds as you set.",
    },
  ],
  strip:
    "When the session ends, the full record exports as CSV, including each round, each allocation, and the counterfactual results.",
} as const;

export const GAMES = {
  id: "games",
  eyebrow: "02 / The games",
  heading: "The three game types.",
  sub: "All three share the same lobby, standings and projector view. What changes is the asset students are allocating between.",
  cards: [
    {
      name: "Basic",
      icon: "coins" as IconName,
      hook: "A single risky asset over twenty-five rounds",
      bullets: [
        "A good or bad market each round",
        "Moderate or extreme payoffs",
        "Odds adjustable mid-session",
      ],
      featured: false,
    },
    {
      name: "Portfolio",
      icon: "shuffle" as IconName,
      hook: "Several risky assets and a correlation parameter",
      bullets: [
        "Multiple assets, each with its own market",
        "Correlation ρ between them",
        "Diversification becomes observable",
      ],
      featured: false,
    },
    {
      name: "Manager",
      icon: "trophy" as IconName,
      hook: "Active versus passive over a career",
      bullets: [
        "Continuous returns, one year per round",
        "Fees compound against the investor",
        "Alpha held secret until the session ends",
      ],
      featured: true,
    },
  ],
  featuredNote:
    "On the market-neutral preset, the best available strategy still ends behind its own fee structure, which is the point the game is built to demonstrate.",
} as const;

/**
 * The homepage band for the Markets section. Its own band, after the three
 * classroom games and deliberately not one of them: a different kind of game,
 * in a different part of the site. Unnumbered, so the sections around it keep
 * their eyebrows whether or not the section is switched on.
 *
 * The site plays a simulated market until real price histories are licensed
 * (supabase/migrations/0037), so nothing here may promise real stocks or a
 * reveal of real companies; say so only once the licensed data is live.
 */
export const MARKETS_BAND = {
  id: "markets",
  eyebrow: "New section / Markets",
  heading: "Paper trading in a market that moves.",
  sub: "A separate game for the same room. Students trade stocks from their phones through a brokerage-style app, one period at a time, in a simulated market with booms, crashes, dividends and delistings.",
  points: [
    "Daily prices for 25 companies and an index fund",
    "Market, limit and stop orders; shorting and margin optional",
    "Each result set against simply holding the index fund",
  ],
  cta: { label: "See the Markets section", href: MARKETS_NAV.href },
} as const;

/**
 * The Markets hub at /markets. One game today; later games join the list, and
 * nothing is shown for them until they exist.
 */
export const MARKETS_PAGE = {
  eyebrow: "Markets",
  heading: "Games on a moving market.",
  sub: "The classroom games draw each market from odds you set. The games here play out a market day by day instead: a simulated stock market with booms, crashes, dividends and delistings. Students join with a code, as they do for every game on the site.",
  games: [
    {
      name: "Paper trading",
      icon: "chart" as IconName,
      hook: "Trade stocks, one period at a time",
      bullets: [
        "Twenty-five companies, an index fund and cash",
        "Market, limit and stop orders",
        "Each round moves the market a week to a year",
      ],
      body: "The class trades against a clock, then the market moves on by the period you chose. When the last round resolves, every student sees their result beside what holding the index fund would have earned, and whether trading more paid.",
      hostCta: { label: "Set up a session", href: "/markets/trade/new" },
    },
  ],
  joinPrompt: "Here to play rather than host?",
  joinCta: { label: "Join with a code", href: "/join" },
  /**
   * The illustration beside the game: a static replica of the student's market
   * list (components/markets/student/MarketList.tsx). Invented companies from
   * data/names/name_pool.json, as the game itself shows them; each row's
   * direction matches its change.
   */
  preview: {
    clock: "Year 3 · Mar 14",
    title: "Market",
    index: {
      ticker: "TMIX",
      name: "Total Market Index Fund",
      about: "The whole market in one fund",
      price: "$84.12",
      change: 0.0213,
      spark: [71, 73, 72, 75, 74, 77, 79, 78, 81, 80, 82, 84],
    },
    rows: [
      {
        ticker: "CRVN",
        name: "Corvane Systems",
        price: "$142.50",
        change: 0.0587,
        spark: [98, 104, 101, 110, 116, 112, 121, 127, 124, 133, 135, 142],
      },
      {
        ticker: "RDGM",
        name: "Ridgeline Motors",
        price: "$37.08",
        change: -0.0342,
        spark: [52, 50, 51, 47, 48, 44, 45, 41, 42, 39, 38, 37],
      },
      {
        ticker: "GLFD",
        name: "Goldleaf Foods",
        price: "$61.94",
        change: 0.0041,
        spark: [58, 59, 58, 60, 59, 60, 61, 60, 61, 61, 62, 62],
      },
    ],
    caption: "The student's market list: invented company names, in game time.",
  },
} as const;

export const FEATURES = {
  eyebrow: "03 / Features",
  heading: "What is included.",
  items: [
    {
      icon: "monitor" as IconName,
      label: "Present mode",
      body: "A full-screen projector view that mirrors the session while you control it from your laptop.",
    },
    {
      icon: "sparkle" as IconName,
      label: "Real-time updates",
      body: "Submissions, locks, and reveals reach every device at the same moment.",
    },
    {
      icon: "sliders" as IconName,
      label: "Adjustable market odds",
      body: "The probability of a good market can be changed between rounds while a session is running.",
    },
    {
      icon: "lock" as IconName,
      label: "Private allocations",
      body: "Allocations stay private until lock, and the market outcome is recorded only at reveal.",
    },
    {
      icon: "download" as IconName,
      label: "CSV export",
      body: "The complete session, including counterfactuals, for a follow-up assignment.",
    },
    {
      icon: "users" as IconName,
      label: "Large rosters",
      body: "Built for rosters above one hundred, with bounded lists so the controls stay on screen.",
    },
  ],
} as const;

export const BOTH_SIDES = {
  eyebrow: "04 / In the room",
  heading: "What each screen shows.",
  /** static present-mode prop: the projector half of the band */
  class: {
    title: "What the class sees",
    caption: "The projector view, mirrored as the session runs.",
    codeLabel: "Game code",
    code: "7QK2",
    joined: "24 players in",
    bannerRound: "Round 4",
    bannerHeadline: "Market up!",
    bannerNote: "Risky bets paid off",
  },
  /** static host-control prop: the laptop half of the band */
  host: {
    title: "What you see",
    caption: "The control panel, on your laptop only.",
    action: "Lock & reveal",
    submitted: "21",
    total: "24",
    submittedLabel: "submitted",
    standingsLabel: "Standings",
    rows: [
      { rank: "1.", name: "Priya", wealth: "$164.20" },
      { rank: "2.", name: "Diversified bot", wealth: "$151.80" },
      { rank: "3.", name: "Marcus", wealth: "$149.05" },
    ],
  },
  /** Swap the props for real captures if preferred. */
  screenshotNote:
    "TODO(max) screenshot: real present-mode and host captures, or keep these props.",
} as const;

export const AUDIENCES = {
  eyebrow: "05 / Audience",
  heading: "Who this is for.",
  columns: [
    {
      title: "Introductory finance and economics.",
      body: "Students observe risk, return and variance as measured results from their own decisions.",
    },
    {
      title: "Personal finance and first-year seminars.",
      body: "The rules fit on a single screen and assume no prior coursework.",
    },
    {
      title: "Any course on decisions under uncertainty.",
      body: "The mechanism applies equally in business, statistics and psychology courses.",
    },
  ],
} as const;

/**
 * PARKED. The pricing section is not mounted on the page — see `app/page.tsx`.
 * Everything below is kept intact so it can be restored in one line once the
 * numbers are settled; nothing here renders today.
 */
export const PRICING_INTRO = {
  id: "pricing",
  eyebrow: "06 / Pricing",
  heading: "Pricing.",
  sub: "Payment in consideration.",
} as const;

export type PricingTier = {
  name: string;
  price: string;
  /** small line under the price, or null */
  cadence: string | null;
  audience: string;
  features: string[];
  cta: { label: string; href: string };
  featured: boolean;
  /** chip shown on the highlighted tier */
  chip: string | null;
};

// PLACEHOLDER — confirm before launch
export const PRICING: PricingTier[] = [
  {
    name: "Classroom",
    price: "$0",
    cadence: "free while in pilot",
    audience: "A single section trying it out",
    features: [
      "All three games",
      "Up to 40 students per session",
      "One live session at a time",
      "CSV export",
      "Present mode",
    ],
    cta: { label: "Start free", href: "/host" },
    featured: false,
    chip: null,
  },
  {
    name: "Course",
    price: "TODO(max) $__ / semester",
    cadence: null,
    audience: "An instructor running it for a full term",
    features: [
      "Everything in Classroom",
      "Up to 300 students per session",
      "Unlimited concurrent sessions",
      "Saved session history",
      "Priority email support",
    ],
    cta: { label: "TODO(max) link", href: "TODO(max) link" },
    featured: true,
    chip: "Most courses",
  },
  {
    name: "Department",
    price: "TODO(max) Custom",
    cadence: null,
    audience: "Several instructors, one invoice",
    features: [
      "Everything in Course",
      "Unlimited instructors",
      "Roster and SSO integration",
      "Onboarding session",
      "Invoiced billing",
    ],
    cta: { label: "Email Max", href: "mailto:maxalexjansen@gmail.com" },
    featured: false,
    chip: null,
  },
];

export const FAQ = {
  // 06 while pricing is parked; it becomes 07 when pricing returns.
  eyebrow: "06 / Questions",
  heading: "Questions from instructors.",
  items: [
    {
      q: "Do students need an account?",
      a: "They do not. They open a link or scan a QR code, enter a name, and play. Only a display name is collected.",
    },
    {
      q: "What device do they need?",
      a: "Any phone or laptop with a browser.",
    },
    {
      q: "How long does a session take?",
      a: "Twenty-five rounds takes about fifteen to twenty minutes. Both the round count and the pace are set by you.",
    },
    {
      q: "Can I change the market mid-game?",
      a: "Yes. The odds and the payoff mode are host controls during the session.",
    },
    {
      q: "Can students see each other's bets?",
      a: "Allocations are hidden until lock, and a student can never see another student's allocation at any point. The standings can also be hidden.",
    },
  ],
} as const;

export const FINAL_CTA = {
  eyebrow: "Getting started",
  headline: "Trying it in your course.",
  sub: "The game is free to use during the pilot. If you run a session, I would be glad to hear how it went and what was missing.",
  primary: { label: "Host a session", href: "/host" },
  secondary: { label: "or join a game with a code", href: "/join" },
} as const;

export const FOOTER = {
  blurb: SITE.blurb,
  exploreTitle: "Explore",
  exploreLinks: [
    ...NAV_LINKS,
    { label: "Join a game", href: "/join" },
    // "Host a session" is NOT here: it depends on who is looking, so SiteFooter
    // renders it through HostOrLoginNavLink after this list.
  ],
  /** Label for that auth-aware entry once we know the visitor can host. */
  hostLink: "Host a session",
  contactTitle: "Contact",
  email: SITE.email,
  personalSiteUrl: SITE.personalSiteUrl,
  copyright: "© 2026 Max Jansen",
  legalLinks: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
} as const;

/**
 * The Privacy and Terms pages. Plain facts they both need; the documents
 * themselves live in app/privacy and app/terms. Change `updated` whenever
 * either document's wording changes.
 */
export const LEGAL = {
  operator: "Max Jansen",
  location: "Massachusetts, USA",
  governingLaw: "the Commonwealth of Massachusetts, USA",
  updated: "September 19, 2026",
  /** how long an idle guest identity may be kept — purge_stale_guests(45) */
  guestRetentionDays: 45,
} as const;
