import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, consentStatusLine, mayLog } from "./consent";

describe("consent", () => {
  it("logs outside research mode, and inside it only after a yes", () => {
    expect(mayLog(false, null)).toBe(true);
    expect(mayLog(true, null)).toBe(false);
    expect(mayLog(true, false)).toBe(false);
    expect(mayLog(true, true)).toBe(true);
  });

  it("says where the student stands", () => {
    expect(consentStatusLine(true)).toMatch(/agreed/);
    expect(consentStatusLine(false)).toMatch(/not to take part/);
    expect(consentStatusLine(null)).toMatch(/not answered/);
  });

  it("has a version the server accepts (1 to 40 characters)", () => {
    expect(CONSENT_VERSION.length).toBeGreaterThan(0);
    expect(CONSENT_VERSION.length).toBeLessThanOrEqual(40);
  });
});
