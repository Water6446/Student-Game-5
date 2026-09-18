/**
 * Is outgoing email actually working for this deployment?
 *
 * Supabase's built-in sender allows 2 messages an hour on every plan, so until a
 * custom SMTP provider is configured there is no usable email at all. Anything
 * that depends on a message arriving — confirming a new account, a magic link, a
 * password reset — is a dead end that looks like a bug to whoever tries it.
 *
 * So those entry points are hidden rather than shipped broken. OFF unless
 * explicitly enabled, because "no SMTP" is the state a fresh deployment is in.
 *
 * TO TURN IT BACK ON, both halves are needed:
 *   1. Supabase → Authentication → Emails → SMTP Settings (a real provider),
 *      and Providers → Email → "Confirm email" back ON.
 *   2. NEXT_PUBLIC_EMAIL_DELIVERY=true here, then redeploy — NEXT_PUBLIC_* is
 *      baked in at build time.
 *
 * The sign-up code path does NOT branch on this: it reacts to whether Supabase
 * actually returned a session, so it stays correct whichever way the dashboard
 * setting is flipped, even if this flag is stale.
 */
export const EMAIL_DELIVERY_READY = process.env.NEXT_PUBLIC_EMAIL_DELIVERY === "true";
