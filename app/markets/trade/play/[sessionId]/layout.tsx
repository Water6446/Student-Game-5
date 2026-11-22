import type { Metadata } from "next";

// The static title; the screen overrides it with live state (useDocumentTitle).
export const metadata: Metadata = { title: "Paper trading", robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
