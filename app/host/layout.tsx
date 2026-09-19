import type { Metadata } from "next";

// The static title for /host; a session's own screens override it with live state (useDocumentTitle).
export const metadata: Metadata = { title: "Host dashboard" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
