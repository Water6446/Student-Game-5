import { describe, expect, it } from "vitest";
import { isCurrentPath, sectionIdOf, showsSiteHeader } from "./site-chrome";

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

describe("sectionIdOf", () => {
  it("reads the anchor", () => {
    expect(sectionIdOf("/#how")).toBe("how");
    expect(sectionIdOf("/join")).toBeNull();
  });
});
