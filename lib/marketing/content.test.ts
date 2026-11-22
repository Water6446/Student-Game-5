import { afterEach, describe, expect, it, vi } from "vitest";

// NAV_LINKS is decided when the module loads (the flag is inlined at build
// time), so each case loads a fresh copy under its own environment.
async function navWith(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ENABLE_MARKETS", flag as string);
  const { NAV_LINKS, FOOTER } = await import("./content");
  return { nav: NAV_LINKS.map((l) => l.href), footer: FOOTER.exploreLinks.map((l) => l.href) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Markets nav link", () => {
  it("is in the header and the footer while the section is switched on", async () => {
    const { nav, footer } = await navWith("true");
    expect(nav).toContain("/markets");
    expect(footer).toContain("/markets");
  });

  it("is absent otherwise, so production shows no way into a dark section", async () => {
    for (const flag of [undefined, "false", "1"]) {
      const { nav, footer } = await navWith(flag);
      expect(nav).not.toContain("/markets");
      expect(footer).not.toContain("/markets");
    }
  });
});
