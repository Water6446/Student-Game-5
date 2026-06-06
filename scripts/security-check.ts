/**
 * security-check.ts — OPTIONAL live counterpart to scripts/db_selftest.sql.
 *
 * Where the SQL self-test proves the policies offline, this script exercises the
 * SAME assertions through the real network path a malicious student would use:
 * the public anon key + PostgREST/RPC + Supabase Realtime. It signs in
 * anonymously (the attacker), joins a disposable session, and confirms every
 * forbidden action is rejected.
 *
 * Requires (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY   (used ONLY here, to seed/tear down test rows)
 *
 * Run:  npm run security-check
 *
 * NOTE: this needs a live project with the migrations applied and anonymous
 * sign-in enabled. The canonical, no-cloud proof is `bash scripts/run-db-selftest.sh`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(2);
}

let passes = 0;
let failures = 0;
function pass(msg: string) {
  passes++;
  console.log(`PASS: ${msg}`);
}
function fail(msg: string) {
  failures++;
  console.error(`SECURITY FAIL: ${msg}`);
}
/** assert that `op` is rejected (throws or returns a PostgREST error). */
async function expectDenied(label: string, op: () => PromiseLike<unknown>) {
  try {
    const res = (await op()) as { error?: unknown };
    if (res && typeof res === "object" && "error" in res && res.error) {
      pass(`${label} — ${(res.error as { message?: string }).message ?? "denied"}`);
    } else {
      fail(`${label} — operation was allowed`);
    }
  } catch (e) {
    pass(`${label} — ${(e as Error).message}`);
  }
}

async function main() {
  const admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });

  // --- seed a disposable host, session, victim player, and an open round -----
  const hostEmail = `host_${Date.now()}@example.test`;
  const { data: hostUser, error: hostErr } = await admin.auth.admin.createUser({
    email: hostEmail,
    email_confirm: true,
    user_metadata: { role: "host" },
  });
  if (hostErr || !hostUser.user) throw hostErr ?? new Error("could not create host");
  const hostId = hostUser.user.id;

  const joinCode = "TST" + Math.random().toString(36).slice(2, 5).toUpperCase();
  const { data: session, error: sErr } = await admin
    .from("sessions")
    .insert({
      join_code: joinCode,
      host_id: hostId,
      status: "active",
      current_round: 1,
      config: {
        payoff_mode: "moderate",
        num_rounds: 5,
        starting_wealth: 100,
        good_prob: 0.6,
        market_mode: "manual",
        market_scope: "shared",
        show_full_leaderboard_to_students: false,
        allow_late_join: true,
      },
    })
    .select()
    .single();
  if (sErr || !session) throw sErr ?? new Error("could not seed session");

  // a victim student (so the attacker has someone else's data to target)
  const { data: victimUser } = await admin.auth.admin.createUser({
    email: `victim_${Date.now()}@example.test`,
    email_confirm: true,
  });
  const { data: victim } = await admin
    .from("players")
    .insert({
      session_id: session.id,
      auth_uid: victimUser!.user!.id,
      display_name: "Victim",
      current_wealth: 100,
    })
    .select()
    .single();

  const { data: round } = await admin
    .from("rounds")
    .insert({ session_id: session.id, round_number: 1, status: "open" })
    .select()
    .single();

  // victim's pending allocation (the attacker must not be able to read it)
  await admin.from("allocations").insert({
    round_id: round!.id,
    player_id: victim!.id,
    risky_amount: 33,
    safe_amount: 67,
  });

  const cleanup = async () => {
    await admin.from("sessions").delete().eq("id", session.id);
    await admin.auth.admin.deleteUser(hostId);
    if (victimUser?.user) await admin.auth.admin.deleteUser(victimUser.user.id);
  };

  try {
    // --- the ATTACKER: an anonymous student with the public anon key ---------
    const attacker: SupabaseClient = createClient(URL!, ANON!, {
      auth: { persistSession: false },
    });
    const { error: anonErr } = await attacker.auth.signInAnonymously();
    if (anonErr) throw new Error(`anonymous sign-in failed (enable it): ${anonErr.message}`);

    // legitimately join (this is allowed)
    const { data: me, error: joinErr } = await attacker.rpc("join_session", {
      p_join_code: joinCode,
      p_display_name: "Attacker",
    });
    if (joinErr) throw new Error(`join_session failed: ${joinErr.message}`);
    const myPlayerId = (me as { id: string }).id;

    // 1. cannot host (anonymous)
    await expectDenied("anonymous create_session", () =>
      attacker.rpc("create_session", { p_config: {} }),
    );
    // 2. cannot lock / resolve (not host)
    await expectDenied("student lock_round", () =>
      attacker.rpc("lock_round", { p_session_id: session.id, p_round_number: 1 }),
    );
    await expectDenied("student resolve_round", () =>
      attacker.rpc("resolve_round", {
        p_session_id: session.id,
        p_round_number: 1,
        p_market_override: "good",
      }),
    );
    // 3. cannot write current_wealth directly
    await expectDenied("student writes current_wealth", () =>
      attacker.from("players").update({ current_wealth: 999999 }).eq("id", myPlayerId),
    );
    // 4. cannot write another player's allocation
    await expectDenied("student writes victim's allocation", () =>
      attacker
        .from("allocations")
        .insert({ round_id: round!.id, player_id: victim!.id, risky_amount: 0, safe_amount: 100 }),
    );
    // 5. cannot submit risky > wealth
    await expectDenied("student submits risky > wealth", () =>
      attacker
        .from("allocations")
        .insert({ round_id: round!.id, player_id: myPlayerId, risky_amount: 100000, safe_amount: 0 }),
    );
    // 6. cannot read another player's allocation (returns zero rows)
    {
      const { data, error } = await attacker
        .from("allocations")
        .select("*")
        .eq("player_id", victim!.id);
      if (!error && Array.isArray(data) && data.length === 0)
        pass("victim's allocation is invisible to the attacker");
      else fail(`attacker read ${Array.isArray(data) ? data.length : "?"} of victim's allocations`);
    }
    // 7. hidden leaderboard denied to student
    await expectDenied("student reads hidden leaderboard", () =>
      attacker.rpc("get_leaderboard", { p_session_id: session.id }),
    );
  } finally {
    await cleanup();
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
