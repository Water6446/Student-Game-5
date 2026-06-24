import type { Metadata, Viewport } from "next";
import { Archivo, Hanken_Grotesk, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: big bold grotesk for headlines, big numbers, button labels and names.
// "Academy Arcade" — punchy game-show confidence over a finance classroom.
const display = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

// Friendly geometric sans for UI/body — professional but a little playful.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// "Professor's voice" — Fraunces italic, demoted to editorial accents only
// (instructional captions, subtitles, helper copy).
const editorial = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["italic"],
  variable: "--font-editorial",
  display: "swap",
});

// Tabular monospace for money, leaderboards and timers (no layout shift).
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Risk Game",
  description: "A live, in-class investment-risk simulation. Bet, reveal, repeat.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EBE3D0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${editorial.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
