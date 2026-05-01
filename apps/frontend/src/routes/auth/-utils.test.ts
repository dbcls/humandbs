import { describe, expect, test } from "bun:test";

import { buildAuthState, parseAuthState, sanitizeRedirectPath } from "./-utils";

describe("sanitizeRedirectPath", () => {
  test("accepts safe relative paths", () => {
    expect(sanitizeRedirectPath("/admin/researches?tab=1#section")).toBe(
      "/admin/researches?tab=1#section",
    );
  });

  test("rejects external and protocol-relative targets", () => {
    expect(sanitizeRedirectPath("https://example.com")).toBeNull();
    expect(sanitizeRedirectPath("//example.com")).toBeNull();
  });
});

describe("auth state helpers", () => {
  test("round-trips nonce and redirect target", () => {
    const state = buildAuthState("nonce-123", "/ja/admin/researches?tab=1");

    expect(parseAuthState(state)).toEqual({
      nonce: "nonce-123",
      redirectTo: "/ja/admin/researches?tab=1",
    });
  });

  test("rejects invalid redirect targets in encoded state", () => {
    const state = Buffer.from(
      JSON.stringify({
        v: 1,
        n: "nonce-123",
        r: "https://example.com",
      }),
      "utf8",
    ).toString("base64url");

    expect(parseAuthState(state)).toBeNull();
  });
});
