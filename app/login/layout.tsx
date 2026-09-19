import type { Metadata } from "next";

// The page is a Client Component, so its tab title is set here.
export const metadata: Metadata = { title: "Log in" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
