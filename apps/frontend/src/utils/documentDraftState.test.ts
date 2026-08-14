import { describe, expect, test } from "bun:test";

import { isDocumentDraftValueUnpublished } from "./documentDraftState";

describe("isDocumentDraftValueUnpublished", () => {
  test("continues to report a draft change after autosave", () => {
    const publishedTitle = "Frequently Asked Questions";
    const autosavedDraftTitle = "FAQ";

    expect(isDocumentDraftValueUnpublished(autosavedDraftTitle, publishedTitle, true)).toBe(true);
  });

  test("clears only when the draft matches published content or no published version exists", () => {
    expect(isDocumentDraftValueUnpublished("FAQ", "FAQ", true)).toBe(false);
    expect(isDocumentDraftValueUnpublished("FAQ", undefined, false)).toBe(false);
  });
});
