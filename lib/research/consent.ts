// The research consent screen's words (section-level). Pure.
//
// research_mode (session config) puts this screen in front of play. The
// student's answer goes to record_consent with CONSENT_VERSION, so every
// recorded answer says which text was on screen; with research mode on,
// nothing is logged and no order context is kept until they agree, and saying
// no later deletes what was kept (0035).
//
// TODO(max): this is placeholder text. Replace TITLE, PARAGRAPHS and the
// button labels with the IRB-approved consent form (WPI IRB), and bump
// CONSENT_VERSION in the same change, before any session runs in research
// mode with real students.

export const CONSENT_VERSION = "draft-1";

/** True until the IRB-approved text replaces the placeholder. */
export const CONSENT_IS_PLACEHOLDER = true;

export const CONSENT_TEXT = {
  title: "Before you play: a research study",
  paragraphs: [
    "Your teacher is running this game as part of a research study on how people trade.",
    "If you agree, the study records how you use the game: what you look at, the orders you place and how long you take. It never records your name; you appear only as a code.",
    "Saying no changes nothing about the game. You play exactly the same, and nothing about how you play is kept. You can change your answer later from your account screen.",
  ],
  // TODO(max): the IRB form's contact line (investigator, IRB office) goes here.
  contact: "Questions? Ask your teacher.",
  agree: "I agree",
  decline: "No thanks, just play",
} as const;

/** The one-line status on the account screen. */
export function consentStatusLine(consent: boolean | null): string {
  if (consent === true) return "You agreed to take part in the research study.";
  if (consent === false) return "You chose not to take part in the research study.";
  return "You have not answered the research question yet.";
}

/**
 * Whether this student's behaviour may be logged: always outside research
 * mode; inside it, only after they agreed. MIRRORS _research_ok (0035), which
 * enforces the same rule on the server.
 */
export function mayLog(researchMode: boolean, consent: boolean | null): boolean {
  return !researchMode || consent === true;
}
