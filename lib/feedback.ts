import { SITE } from "@/lib/marketing/content";

/**
 * A mailto: link for feedback, pre-filled so the message arrives with enough
 * context to act on: which session it was about, and where it was sent from.
 *
 * mailto rather than a form: it needs no table, no spam handling, and replies
 * land in a real inbox — the right trade for a pilot.
 */
export function feedbackHref(opts: { topic?: string; joinCode?: string } = {}): string {
  const subject = [`${SITE.name} feedback`, opts.topic, opts.joinCode ? `session ${opts.joinCode}` : null]
    .filter(Boolean)
    .join(" — ");
  const body = opts.joinCode
    ? `Session: ${opts.joinCode}\n\nWhat happened, or what would help:\n\n`
    : "What happened, or what would help:\n\n";
  return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
