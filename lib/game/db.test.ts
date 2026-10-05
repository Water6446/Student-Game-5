import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_SITE_URL, joinDisplayUrl, joinUrl, siteUrl } from "./db";

function inBrowser(origin: string) {
  vi.stubGlobal("window", { location: { origin } });
}

describe("siteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses NEXT_PUBLIC_SITE_URL in production, on server and client, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.sharpesim.com/");
    expect(siteUrl()).toBe("https://www.sharpesim.com");
    inBrowser("https://student-game-5.vercel.app");
    expect(siteUrl()).toBe("https://www.sharpesim.com");
  });

  it("falls back to the current origin in the browser when unset (previews)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    inBrowser("https://student-game-5-git-branch-me.vercel.app");
    expect(siteUrl()).toBe("https://student-game-5-git-branch-me.vercel.app");
  });

  it("ignores a localhost value in the browser so a LAN-tested QR stays reachable", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    inBrowser("http://192.168.1.20:3000");
    expect(siteUrl()).toBe("http://192.168.1.20:3000");
  });

  it("ignores a value that is not a bare origin (a pasted Vercel dashboard link)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://vercel.com/water6446s-projects/student-game-5");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(siteUrl()).toBe(PRODUCTION_SITE_URL);
    expect(joinUrl("ABCD")).toBe("https://www.sharpesim.com/join?code=ABCD");
    inBrowser("https://www.sharpesim.com");
    expect(siteUrl()).toBe("https://www.sharpesim.com");
    expect(joinDisplayUrl()).toBe("sharpesim.com/join");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "www.sharpesim.com");
    expect(siteUrl()).toBe("https://www.sharpesim.com");
  });

  it("falls back to the production address on a production build when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "student-game-5-abc123.vercel.app");
    expect(siteUrl()).toBe("https://www.sharpesim.com");
  });

  it("falls back to VERCEL_URL, then localhost, on the server", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "student-game-5-abc123.vercel.app");
    expect(siteUrl()).toBe("https://student-game-5-abc123.vercel.app");
    vi.stubEnv("VERCEL_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("join links", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("QR link is the full canonical URL with the code; the typed form is short", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.sharpesim.com");
    expect(joinUrl("AB CD")).toBe("https://www.sharpesim.com/join?code=AB%20CD");
    expect(joinDisplayUrl()).toBe("sharpesim.com/join");
  });

  it("short form follows the current host off production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(joinDisplayUrl()).toBe("localhost:3000/join");
  });
});
