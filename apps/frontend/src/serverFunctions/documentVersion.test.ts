import { describe, expect, test } from "bun:test";

import { saveDocVersionDraftRequestSchema } from "./documentVersion";

describe("saveDocVersionDraftRequestSchema", () => {
  const request = {
    contentId: "faq",
    versionNumber: 1,
    locale: "en",
  };

  test("accepts a 100-character short title", () => {
    expect(
      saveDocVersionDraftRequestSchema.safeParse({ ...request, shortTitle: "a".repeat(100) })
        .success,
    ).toBe(true);
  });

  test("rejects a short title longer than 100 characters", () => {
    expect(
      saveDocVersionDraftRequestSchema.safeParse({ ...request, shortTitle: "a".repeat(101) })
        .success,
    ).toBe(false);
  });
});
