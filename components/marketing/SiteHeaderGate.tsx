"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { showsSiteHeader } from "@/lib/site-chrome";

/**
 * The site header, mounted once in the root layout so it persists across
 * navigation. The game screens (/play/<id>, /host/<id>, the projector) draw
 * their own chrome and get none — see showsSiteHeader.
 */
export function SiteHeaderGate() {
  const pathname = usePathname();
  return showsSiteHeader(pathname) ? <SiteHeader /> : null;
}

/**
 * For a page that can appear on a game route — StatusPage's "You haven't
 * joined this game" or "Session not found" — and still wants the site header
 * there. Renders it only where the root layout does not, so it is never drawn
 * twice.
 */
export function FallbackSiteHeader() {
  const pathname = usePathname();
  return showsSiteHeader(pathname) ? null : <SiteHeader />;
}
