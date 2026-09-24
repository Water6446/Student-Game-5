import type { Config } from "tailwindcss";

// Semantic tokens are defined as RGB channel triplets in globals.css so Tailwind
// opacity modifiers (e.g. bg-brand/20) keep working. Reference them via rgb(var()).
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"], // Archivo
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"], // Hanken Grotesk
        editorial: ["var(--font-editorial)", "Georgia", "serif"], // Fraunces italic
        // tabular numbers read better on the projected leaderboard
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"], // JetBrains Mono
      },
      borderWidth: {
        // the look relies on chunky ink borders; make plain `border` 2px.
        DEFAULT: "2px",
      },
      colors: {
        paper: {
          DEFAULT: token("--paper"),
          2: token("--paper-2"),
          inverse: token("--paper-inverse"),
        },
        surface: token("--surface"),
        ink: {
          DEFAULT: token("--ink"),
          muted: token("--ink-muted"),
          subtle: token("--ink-subtle"),
        },
        line: { DEFAULT: token("--line"), strong: token("--line-strong") },
        brand: {
          DEFAULT: token("--brand"),
          strong: token("--brand-strong"),
          soft: token("--brand-soft"),
        },
        gain: { DEFAULT: token("--gain"), soft: token("--gain-soft") },
        loss: { DEFAULT: token("--loss"), soft: token("--loss-soft") },
        play: { DEFAULT: token("--play"), soft: token("--play-soft") },
      },
      boxShadow: {
        // hard ink offset shadows, no blur (Academy Arcade)
        card: "3px 3px 0 rgb(var(--ink))", // standard card / button
        lift: "6px 6px 0 rgb(var(--ink))", // hero card, modal, big CTA
        pop: "5px 5px 0 rgb(var(--ink))", // primary CTA emphasis
        // a card or button under the pointer rises toward you: the hover half of
        // the press affordance (DESIGN.md §4)
        "card-hover": "4px 4px 0 rgb(var(--ink))",
        // lift for an INK-filled panel: an ink offset under an ink panel is
        // invisible except as a jagged notch at two corners, so the block is
        // amber with an ink outline instead.
        "lift-brand": "6px 6px 0 rgb(var(--brand)), 6px 6px 0 2px rgb(var(--ink))",
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.94) translateY(6px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // Marketing hero: a line slides up from behind its own mask. The
        // wrapper clips, so the text arrives rather than fades.
        "slide-up": {
          "0%": { transform: "translateY(105%)" },
          "100%": { transform: "translateY(0)" },
        },
        "count-pop": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // --drift (set per piece) sways each piece sideways as it falls, so the
        // burst drifts like paper instead of dropping in straight columns.
        confetti: {
          "0%": { transform: "translate3d(0, -10vh, 0) rotate(0deg)", opacity: "1" },
          "100%": {
            transform: "translate3d(var(--drift, 0px), 110vh, 0) rotate(var(--spin, 720deg))",
            opacity: "0",
          },
        },
        shake: {
          "10%, 90%": { transform: "translateX(-1px)" },
          "20%, 80%": { transform: "translateX(2px)" },
          "30%, 50%, 70%": { transform: "translateX(-4px)" },
          "40%, 60%": { transform: "translateX(4px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // A verdict landing: oversized and tilted, it slams down and settles —
        // "LOCKED IN", "MARKET UP!". Game-show beat, not decoration.
        stamp: {
          "0%": { opacity: "0", transform: "scale(1.7) rotate(-9deg)" },
          "55%": { opacity: "1", transform: "scale(0.94) rotate(-2deg)" },
          "75%": { transform: "scale(1.03) rotate(-2.5deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-2deg)" },
        },
        // Podium blocks and the reveal's up arrow arrive from below.
        "rise-tall": {
          "0%": { opacity: "0", transform: "translateY(40%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // rise-tall's mirror: a down arrow arrives from above.
        "drop-in": {
          "0%": { opacity: "0", transform: "translateY(-40%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        // Waiting, but alive: a slow bob instead of a fade.
        bob: {
          "0%, 100%": { transform: "translateY(0) rotate(-3deg)" },
          "50%": { transform: "translateY(-6px) rotate(3deg)" },
        },
        // The takeover's backdrop: rays that turn slowly behind the verdict.
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        "pop-in": "pop-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        rise: "rise 0.4s ease-out both",
        "slide-up": "slide-up 0.85s cubic-bezier(0.16, 1, 0.3, 1) both",
        "count-pop": "count-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        confetti: "confetti 2.6s linear forwards",
        shake: "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        stamp: "stamp 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both",
        "rise-tall": "rise-tall 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "drop-in": "drop-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        bob: "bob 2.6s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "spin-slow": "spin 40s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
