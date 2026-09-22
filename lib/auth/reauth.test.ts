import { describe, expect, it } from "vitest";
import { amrEntries, lastSignInAt, REAUTH_WINDOW_SECONDS, signedInRecently } from "./reauth";

/** A JWT-shaped token with the given claims (signature is never checked client-side). */
function token(claims: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.sig`;
}

const NOW = 1_800_000_000;

describe("amrEntries", () => {
  it("reads the amr claim", () => {
    const t = token({ amr: [{ method: "password", timestamp: NOW - 5 }] });
    expect(amrEntries(t)).toEqual([{ method: "password", timestamp: NOW - 5 }]);
  });

  it("returns [] for missing, malformed or non-JWT input", () => {
    expect(amrEntries(null)).toEqual([]);
    expect(amrEntries("")).toEqual([]);
    expect(amrEntries("not-a-jwt")).toEqual([]);
    expect(amrEntries("a.!!!.c")).toEqual([]);
    expect(amrEntries(token({}))).toEqual([]);
    expect(amrEntries(token({ amr: [{ method: 1 }, "x", null] }))).toEqual([]);
  });
});

describe("lastSignInAt", () => {
  it("takes the newest real sign-in and ignores anonymous", () => {
    const t = token({
      amr: [
        { method: "anonymous", timestamp: NOW },
        { method: "password", timestamp: NOW - 100 },
        { method: "oauth", timestamp: NOW - 50 },
      ],
    });
    expect(lastSignInAt(t)).toBe(NOW - 50);
  });

  it("is null for a guest-only session", () => {
    expect(lastSignInAt(token({ amr: [{ method: "anonymous", timestamp: NOW }] }))).toBeNull();
  });
});

describe("signedInRecently", () => {
  it("is true inside the window", () => {
    const t = token({ amr: [{ method: "password", timestamp: NOW - 60 }] });
    expect(signedInRecently(t, NOW)).toBe(true);
  });

  it("is false once the window has passed", () => {
    const t = token({ amr: [{ method: "password", timestamp: NOW - REAUTH_WINDOW_SECONDS - 1 }] });
    expect(signedInRecently(t, NOW)).toBe(false);
  });

  it("counts a recovery link or a Google sign-in as proof", () => {
    expect(signedInRecently(token({ amr: [{ method: "recovery", timestamp: NOW }] }), NOW)).toBe(true);
    expect(signedInRecently(token({ amr: [{ method: "oauth", timestamp: NOW }] }), NOW)).toBe(true);
  });

  it("never counts a guest session", () => {
    expect(signedInRecently(token({ amr: [{ method: "anonymous", timestamp: NOW }] }), NOW)).toBe(false);
    expect(signedInRecently(null, NOW)).toBe(false);
  });

  it("rejects a timestamp far in the future", () => {
    const t = token({ amr: [{ method: "password", timestamp: NOW + 3600 }] });
    expect(signedInRecently(t, NOW)).toBe(false);
  });
});
