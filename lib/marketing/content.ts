/**
 * Every string on the marketing homepage lives here so copy and prices can be
 * edited without touching layout. Components import these and render them; they
 * never inline their own text.
 *
 * Voice: measured and academic. Short declarative sentences, concrete nouns, no
 * salesmanship and no swagger. The Fraunces italic lines are the only place the
 * register warms up, and even there it stays plain.
 *
 * Unresolved values are left as literal `TODO(max) …` strings and rendered as
 * visible placeholders — never as an invented price or a dead link. Use
 * `isTodo()` to branch on them.
 */

/** Names of icons from `components/icons.tsx`, resolved in `icon-map.tsx`. */
export type IconName =
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
  repoUrl: "TODO(max) repo URL",
  personalSiteUrl: "https://max-jansen.com",
  location: "Worcester, MA",
} as const;

export const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "The games", href: "#games" },
  // { label: "Pricing", href: "#pricing" },  ← restore with the Pricing section
] as const;

export const HEADER = {
  joinCta: { label: "Join a game", href: "/join" },
  hostCta: { label: "Host a session", href: "/host" },
  /** the same action, shortened for phones */
  hostCtaShort: "Host",
} as const;

export const HERO = {
  eyebrow: "In-class market simulation",
  /** The headline is set in two faces: Archivo black, then Fraunces italic. */
  headlineLead: "A classroom simulation",
  headlineEmphasis: "of investment risk.",
  scrollLabel: "scroll",
  sub: "Built for finance and economics courses. Students divide their wealth between a safe and a risky asset each round, the market resolves, and the class can compare what the different strategies produced.",
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
  /** The quiet italic line in the lower corner of the stage. */
  aside:
    "In each round a student holds a balance, decides how much of it to put at risk, and the market outcome is drawn from the odds the instructor has set.",
  /** Numbers row under the stage. Product facts, not usage statistics. */
  stats: [
    { value: "3", label: "game types" },
    { value: "25", label: "rounds by default" },
    { value: "0", label: "student accounts" },
    { value: "15", label: "minutes a session" },
  ],
  /** Chip floating over the stage next to the allocation card. */
  marketChip: { label: "Market up", detail: "risky ×1.1" },
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
    {
      q: "What do I get afterward?",
      a: "A CSV of every round, every allocation, and the counterfactual: what each student would have ended with under other strategies.",
    },
    {
      q: "Is it open source?",
      a: "TODO(max) — yes/link, or cut this row.",
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
    { label: "Host a session", href: "/host" },
  ],
  contactTitle: "Contact",
  email: SITE.email,
  repoUrl: SITE.repoUrl,
  personalSiteUrl: SITE.personalSiteUrl,
  location: SITE.location,
  copyright: "© 2026 Max Jansen",
  builtWith: "Built with Next.js and Supabase.",
} as const;
