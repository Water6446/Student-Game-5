import { HEADER } from "@/lib/marketing/content";

/** Which icon a marketing CTA carries. Kept as a token, not a ReactNode, so the
 *  pill can be rendered by either half of the lazy split below. */
export type CtaIcon = "arrow" | "coins";

/** Mirrors PillLink's tones. */
export type CTA_TONE = "ink" | "brand" | "outline" | "cream";

/** Where a "Host a session" CTA points when nobody is signed in. */
export const LOGGED_OUT_CTA = HEADER.loginCta;
