import { describe, expect, it } from "vitest";
import { isCurrentPath, isInSection, sectionIdOf, showsSiteHeader } from "./site-chrome";

describe("showsSiteHeader", () => {
  it("shows the header on the site's pages", () => {
    for (const p of ["/", "/join", "/login", "/host", "/account", "/privacy", "/auth/reset"]) {
      expect(showsSiteHeader(p)).toBe(true);
    }
  });

  it("hides it on the game screens", () => {
    expect(showsSiteHeader("/play/abc")).toBe(false);
    expect(showsSiteHeader("/host/abc")).toBe(false);
    expect(showsSiteHeader("/host/abc/present")).toBe(false);
  });

  it("hides it on the paper trading screens, not on the section's other pages", () => {
    expect(showsSiteHeader("/markets/trade/play/abc")).toBe(false);
    expect(showsSiteHeader("/markets/trade/host/abc")).toBe(false);
    expect(showsSiteHeader("/markets/trade/host/abc/present")).toBe(false);
    expect(showsSiteHeader("/markets/trade/preview")).toBe(false);
    expect(showsSiteHeader("/markets")).toBe(true);
    expect(showsSiteHeader("/markets/trade/new")).toBe(true);
  });

  it("treats a missing pathname as the homepage", () => {
    expect(showsSiteHeader(null)).toBe(true);
  });
});

describe("isCurrentPath", () => {
  it("matches the path and ignores query and hash", () => {
    expect(isCurrentPath("/login", "/login?next=%2Fhost")).toBe(true);
    expect(isCurrentPath("/", "/#how")).toBe(true);
    expect(isCurrentPath("/host", "/host")).toBe(true);
  });

  it("does not treat a child route as current", () => {
    expect(isCurrentPath("/host/abc", "/host")).toBe(false);
    expect(isCurrentPath("/join", "/login")).toBe(false);
  });
});

describe("isInSection", () => {
  it("is current on the section's page and every page under it", () => {
    expect(isInSection("/markets", "/markets")).toBe(true);
    expect(isInSection("/markets/trade/new", "/markets")).toBe(true);
  });

  it("does not match a path that only shares a prefix", () => {
    expect(isInSection("/marketsx", "/markets")).toBe(false);
    expect(isInSection("/", "/markets")).toBe(false);
  });

  it("never treats the homepage or an anchor on it as a section", () => {
    expect(isInSection("/", "/")).toBe(false);
    expect(isInSection("/join", "/#how")).toBe(false);
  });
});

describe("sectionIdOf", () => {
  it("reads the anchor", () => {
    expect(sectionIdOf("/#how")).toBe("how");
    expect(sectionIdOf("/join")).toBeNull();
  });
});
