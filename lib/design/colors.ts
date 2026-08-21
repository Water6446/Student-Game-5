// The Academy Arcade tokens as literal colour strings, for the two places that
// cannot use a Tailwind class: Recharts (which needs real colours in SVG
// attributes) and the inline-styled confetti pieces.
//
// app/globals.css is the source of truth — these are its mirror. Change one,
// change the other. See DESIGN.md § 2.

export const COLOR = {
  ink: "#211A12",
  inkMuted: "#6B5C40",
  surface: "#FFFDF6",
  paper: "#EBE3D0",
  paperInverse: "#F6EFDD",
  brand: "#F0A92B",
  brandStrong: "#E0961A",
  gain: "#1F8A4C",
  loss: "#DB3B2B",
  play: "#2557E8",
} as const;

/**
 * Series palette for multi-line charts: the four semantic colours first (so a
 * small class reads in familiar colours), then six extensions that stay
 * saturated and ink-legible on warm paper, then two token variants.
 */
export const SERIES_COLORS: readonly string[] = [
  COLOR.play,
  COLOR.gain,
  COLOR.brand,
  COLOR.loss,
  "#0E7490",
  "#7C3AED",
  COLOR.ink,
  "#15803D",
  COLOR.brandStrong,
  "#0891B2",
  "#9333EA",
  "#DB2777",
];

/** Confetti pieces — the celebratory subset, all straight from the tokens. */
export const CONFETTI_COLORS: readonly string[] = [
  COLOR.brand,
  COLOR.play,
  COLOR.surface,
  COLOR.gain,
  COLOR.loss,
  COLOR.ink,
];
