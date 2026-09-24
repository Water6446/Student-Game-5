import { describe, expect, it } from "vitest";
import { AUTH_HINT_SCRIPT, hasAuthCookie } from "./auth-hint";

describe("hasAuthCookie", () => {
  it("spots a Supabase session cookie, whole or chunked", () => {
    expect(hasAuthCookie("sb-mftrhnwnvidxjdzenmip-auth-token=base64-abc")).toBe(true);
    expect(hasAuthCookie("theme=x; sb-abc-auth-token.0=part1; sb-abc-auth-token.1=part2")).toBe(true);
  });

  it("ignores the PKCE verifier and unrelated cookies", () => {
    expect(hasAuthCookie("sb-abc-auth-token-code-verifier=xyz")).toBe(false);
    expect(hasAuthCookie("auth-token=1; session=2")).toBe(false);
    expect(hasAuthCookie("")).toBe(false);
  });
});

describe("AUTH_HINT_SCRIPT", () => {
  it("is valid JavaScript that sets data-auth only when the cookie is there", () => {
    const run = (cookie: string) => {
      const dataset: Record<string, string> = {};
      const document = { cookie, documentElement: { dataset } };
      new Function("document", AUTH_HINT_SCRIPT)(document);
      return dataset.auth;
    };
    expect(run("sb-abc-auth-token=x")).toBe("in");
    expect(run("other=1")).toBeUndefined();
  });
});
