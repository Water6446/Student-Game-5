import type { Metadata } from "next";

// Placeholder until the play screen sets a live title (useDocumentTitle).
export const metadata: Metadata = { title: "Playing" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
