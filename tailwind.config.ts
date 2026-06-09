import type { Config } from "tailwindcss";

// Semantic tokens are defined as RGB channel triplets in globals.css so Tailwind
// opacity modifiers (e.g. bg-brand/20) keep working. Reference them via rgb(var()).
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // tabular numbers read better on the projected leaderboard
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        paper: { DEFAULT: token("--paper"), 2: token("--paper-2") },
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
        // soft, warm paper-like elevation
        card: "0 1px 2px rgba(40, 33, 20, 0.04), 0 6px 20px -8px rgba(40, 33, 20, 0.12)",
        lift: "0 2px 4px rgba(40, 33, 20, 0.05), 0 16px 36px -12px rgba(40, 33, 20, 0.22)",
        pop: "0 2px 0 rgb(var(--brand-strong))",
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
        "count-pop": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "60%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        confetti: {
          "0%": { transform: "translateY(-10vh) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(720deg)", opacity: "0" },
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
      },
      animation: {
        "pop-in": "pop-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        rise: "rise 0.4s ease-out both",
        "count-pop": "count-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        confetti: "confetti 2.6s linear forwards",
        shake: "shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
