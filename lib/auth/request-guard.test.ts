import { describe, expect, it } from "vitest";
import { clientIpFrom, isCrossSiteRequest, isJsonContentType } from "./request-guard";

describe("isJsonContentType", () => {
  it("accepts application/json, with or without parameters", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("Application/JSON")).toBe(true);
  });

  it("rejects a simple content type that merely mentions json", () => {
    // Sendable cross-site with no preflight, so it must not pass.
    expect(isJsonContentType("text/plain; charset=application/json")).toBe(false);
    expect(isJsonContentType("text/plain;application/json")).toBe(false);
  });

  it("rejects form encodings and a missing header", () => {
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType("application/x-www-form-urlencoded")).toBe(false);
    expect(isJsonContentType("multipart/form-data; boundary=x")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType("")).toBe(false);
  });
});

describe("isCrossSiteRequest", () => {
  const h = (v?: string) => new Headers(v === undefined ? {} : { "sec-fetch-site": v });

  it("allows same-origin and a missing header", () => {
    expect(isCrossSiteRequest(h("same-origin"))).toBe(false);
    expect(isCrossSiteRequest(h())).toBe(false);
  });

  it("refuses cross-site and same-site requests", () => {
    expect(isCrossSiteRequest(h("cross-site"))).toBe(true);
    expect(isCrossSiteRequest(h("same-site"))).toBe(true);
    expect(isCrossSiteRequest(h("none"))).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("on Vercel, trusts the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIpFrom(headers, true)).toBe("203.0.113.7");
    const vercel = new Headers({ "x-vercel-forwarded-for": "198.51.100.2", "x-forwarded-for": "1.1.1.1" });
    expect(clientIpFrom(vercel, true)).toBe("198.51.100.2");
  });

  it("elsewhere, takes the address the proxy appended, not the one the client sent", () => {
    // The client forged "6.6.6.6"; the proxy appended the real address last.
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(clientIpFrom(headers, false)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "192.0.2.1" }), false)).toBe("192.0.2.1");
    expect(clientIpFrom(new Headers(), true)).toBe("unknown");
  });
});
