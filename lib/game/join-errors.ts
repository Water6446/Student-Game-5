/**
 * What a student sees when joining fails. The server raises terse developer
 * strings ('invalid join code', 'late join is not allowed for this session');
 * this turns the ones a student can actually hit into a sentence that says
 * what to do next. Anything unrecognised falls through to a generic line —
 * never a raw database message.
 *
 * Sources: join_session (0003_functions.sql), the player cap trigger
 * (0018_quotas.sql), and supabase-js's own network/rate-limit errors.
 */
export function friendlyJoinError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid join code")) {
    return "No game has that code. Check it against the screen — codes are 6 characters, no 0s or 1s.";
  }
  if (m.includes("session has finished")) {
    return "That game has already ended. Ask your professor for the code of the new one.";
  }
  if (m.includes("late join is not allowed")) {
    return "That game has already started and isn't taking new players.";
  }
  if (m.includes("session is full")) {
    return "That game is full. Let your professor know.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many people are joining from this network right now. Wait a moment and try again.";
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
    return "Couldn't reach the game. Check your connection and try again.";
  }
  return "Couldn't join that game. Check the code and try again.";
}
