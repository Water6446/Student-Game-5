/**
 * security-check.ts — OPTIONAL live counterpart to the offline self-tests
 * (scripts/db_selftest.sql + accounts_selftest.sql, `npm run test:db`).
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
 * sign-in enabled. The canonical, no-cloud proof is `npm run test:db`.
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

    // 1. hosting as a guest. Migration 0008 deliberately allows it while the
    //    game is in testing (CLAUDE.md), so an allowed call is reported, cleaned
    //    up, and not counted as a failure — until the launch revert lands
    //    (docs/DEPLOYMENT.md Part C.1), after which it must be denied.
    {
      const { data, error } = await attacker.rpc("create_session", { p_config: {} });
      const rows = (data ?? []) as { id: string }[];
      if (error) pass(`anonymous create_session — ${error.message}`);
      else {
        for (const r of rows) await admin.from("sessions").delete().eq("id", r.id);
        console.log(
          "NOTE: a guest can host — the 0008 testing bypass is live. Revert it before launch.",
        );
      }
    }
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
    // 4. no direct writes to allocations at all — submit_allocation (0005) is
    //    the only path, and it can only ever write the caller's own row
    await expectDenied("student writes victim's allocation", () =>
      attacker
        .from("allocations")
        .insert({ round_id: round!.id, player_id: victim!.id, risky_amount: 0, safe_amount: 100 }),
    );
    await expectDenied("student writes own allocation directly", () =>
      attacker
        .from("allocations")
        .insert({ round_id: round!.id, player_id: myPlayerId, risky_amount: 100000, safe_amount: 0 }),
    );
    // 5. cannot put more than their wealth at risk: the RPC clamps to wealth
    {
      const { data, error } = await attacker.rpc("submit_allocation", {
        p_round_id: round!.id,
        p_risky_amount: 100000,
      });
      const a = data as { risky_amount: number; safe_amount: number } | null;
      if (!error && a && Number(a.safe_amount) === 0 && Number(a.risky_amount) <= 100)
        pass(`risky > wealth is clamped to wealth (stored ${a.risky_amount})`);
      else fail(`submit_allocation stored ${JSON.stringify(a)} for risky 100000 (${error?.message ?? "no error"})`);
    }
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
    // 7b. hidden odds are not in the row a student can read (0029). This
    //     session never sets show_odds_to_students, which every screen — and
    //     now the server — reads as hidden.
    {
      const { data, error } = await attacker
        .from("sessions")
        .select("config")
        .eq("id", session.id)
        .single();
      const cfg = (data as { config?: Record<string, unknown> } | null)?.config;
      if (!error && cfg && !("good_prob" in cfg))
        pass("hidden odds are absent from the student's copy of the session");
      else fail(`student read hidden odds: ${JSON.stringify(cfg?.good_prob)} (${error?.message ?? "no error"})`);
    }
    // 7c. names, identities and moderation (0028); internal helpers (0030)
    await expectDenied("student renames themself with a direct update", () =>
      attacker.from("players").update({ display_name: "x".repeat(5000) }).eq("id", myPlayerId),
    );
    await expectDenied("student reads players.auth_uid", () =>
      attacker.from("players").select("auth_uid").eq("session_id", session.id),
    );
    await expectDenied("student removes a classmate", () =>
      attacker.rpc("host_remove_player", { p_player_id: victim!.id }),
    );
    await expectDenied("student calls an internal helper", () =>
      attacker.rpc("_manager_preset", { p_key: "default" }),
    );

    // ---- account layer (migrations 0016-0022) ------------------------------
    // 8. another account's profile is invisible (RLS filters, so: zero rows)
    {
      const { data, error } = await attacker
        .from("profiles")
        .select("*")
        .eq("id", victimUser!.user!.id);
      if (!error && Array.isArray(data) && data.length === 0)
        pass("victim's profile is invisible to the attacker");
      else fail(`attacker read ${Array.isArray(data) ? data.length : "?"} of victim's profiles`);
    }
    // 9. no self-promotion: role/plan/username have no client update grant
    await expectDenied("student sets profiles.role = admin", () =>
      attacker.from("profiles").update({ role: "admin" }).eq("id", victimUser!.user!.id),
    );
    await expectDenied("student upgrades profiles.plan", () =>
      attacker.from("profiles").update({ plan: "dept" }).eq("id", victimUser!.user!.id),
    );
    await expectDenied("student writes profiles.username directly", () =>
      attacker.from("profiles").update({ username: "stolen" }).eq("id", victimUser!.user!.id),
    );
    // 10. an anonymous user cannot turn itself into an account
    await expectDenied("anonymous claim_my_account", () =>
      attacker.rpc("claim_my_account", { p_username: "attacker1", p_display_name: "A" }),
    );
    // 11. the server-only secrets table is unreachable
    await expectDenied("student reads app_secrets", () =>
      attacker.from("app_secrets").select("*"),
    );
    // 12. the username -> email lookup is useless without the server secret.
    //     This one must NOT return an address: that would be an email harvester.
    {
      const { data, error } = await attacker.rpc("email_for_username", {
        p_username: "anyone",
        p_secret: "not-the-secret-but-long-enough-to-pass-a-length-check",
      });
      if (error || data === null) pass("email_for_username discloses nothing without the secret");
      else fail(`email_for_username leaked an address to an unauthenticated caller: ${data}`);
    }
    // 13. housekeeping functions are owner-only
    await expectDenied("student runs purge_stale_guests", () =>
      attacker.rpc("purge_stale_guests", { p_days: 45 }),
    );

    // 14. a caller who never signs in at all. With no JWT auth.uid() is NULL,
    //     and the host checks (`host_id <> auth.uid()`) are NULL-unsafe, so the
    //     EXECUTE grant is the only thing stopping this (0024). Every attacker
    //     above signed in first, which is why this hole went unnoticed.
    const signedOut: SupabaseClient = createClient(URL!, ANON!, {
      auth: { persistSession: false },
    });
    await expectDenied("signed-out finish_session", () =>
      signedOut.rpc("finish_session", { p_session_id: session.id }),
    );
    await expectDenied("signed-out delete_session", () =>
      signedOut.rpc("delete_session", { p_session_id: session.id }),
    );
    {
      const { data } = await admin.from("sessions").select("status").eq("id", session.id);
      if (Array.isArray(data) && data.length === 1 && data[0].status === "active")
        pass("the session survived the signed-out attacker");
      else fail(`signed-out attacker changed the session: ${JSON.stringify(data)}`);
    }
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
