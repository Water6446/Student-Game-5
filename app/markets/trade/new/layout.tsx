import type { Metadata } from "next";

export const metadata: Metadata = { title: "New paper trading game" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
