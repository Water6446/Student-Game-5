import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

describe("safeNext", () => {
  it("keeps ordinary site-relative paths", () => {
    expect(safeNext("/host")).toBe("/host");
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/host/abc?tab=1")).toBe("/host/abc?tab=1");
  });

  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.example")).toBe("/host");
    expect(safeNext("http://evil.example")).toBe("/host");
  });

  it("rejects protocol-relative URLs — the classic open redirect", () => {
    expect(safeNext("//evil.example")).toBe("/host");
    expect(safeNext("//evil.example/path")).toBe("/host");
  });

  it("rejects backslash tricks some parsers read as a slash", () => {
    expect(safeNext("/\\evil.example")).toBe("/host");
  });

  it("rejects paths with no leading slash", () => {
    expect(safeNext("host")).toBe("/host");
    expect(safeNext("evil.example")).toBe("/host");
  });

  it("rejects control characters", () => {
    expect(safeNext("/host\u000aLocation: https://evil.example")).toBe("/host");
    expect(safeNext("/host\u0000")).toBe("/host");
  });

  it("falls back on empty or missing input", () => {
    expect(safeNext(null)).toBe("/host");
    expect(safeNext(undefined)).toBe("/host");
    expect(safeNext("")).toBe("/host");
    expect(safeNext("   ")).toBe("/host");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeNext("https://evil.example", "/account")).toBe("/account");
  });
});
