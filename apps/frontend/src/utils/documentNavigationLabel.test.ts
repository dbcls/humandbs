import { describe, expect, test } from "bun:test";

import type { DocumentsListItemResponse } from "@/repositories/document";
import { getDocumentLabel } from "@/routes/{-$lang}/_layout/_authed/admin/-components/site-navigation-editor/shared";

import {
  formatDocumentListLabel,
  getEffectiveDocumentNavigationLabel,
} from "./documentNavigationLabel";

describe("getEffectiveDocumentNavigationLabel", () => {
  test("prefers a non-empty short title", () => {
    expect(
      getEffectiveDocumentNavigationLabel({
        shortTitle: "FAQ",
        title: "Frequently Asked Questions",
      }),
    ).toBe("FAQ");
  });

  test("falls back to the long title for absent or blank short titles", () => {
    expect(getEffectiveDocumentNavigationLabel({ title: "Long title" })).toBe("Long title");
    expect(getEffectiveDocumentNavigationLabel({ shortTitle: "  ", title: "Long title" })).toBe(
      "Long title",
    );
  });
});

describe("formatDocumentListLabel", () => {
  test("shows compact and long titles only when the compact title is non-empty", () => {
    expect(
      formatDocumentListLabel({ shortTitle: "FAQ", title: "Frequently Asked Questions" }),
    ).toBe("FAQ (Frequently Asked Questions)");
    expect(formatDocumentListLabel({ shortTitle: "  ", title: "Frequently Asked Questions" })).toBe(
      "Frequently Asked Questions",
    );
  });
});

describe("Header & Footer document labels", () => {
  test("uses the current draft short title and its long-title fallback", () => {
    const document: DocumentsListItemResponse = {
      id: "document-id",
      contentId: "faq",
      latestVersionNumber: 1,
      hideFromNav: false,
      translations: [
        {
          status: "published",
          lang: "en",
          title: "Frequently Asked Questions",
          shortTitle: "FAQ",
          editableTitle: "Frequently Asked Questions",
          editableShortTitle: "Help",
          hasUnpublishedChanges: true,
        },
      ],
    };

    expect(getDocumentLabel(document, "en")).toBe("Help");
    expect(
      getDocumentLabel(
        {
          ...document,
          translations: [
            {
              ...document.translations[0]!,
              editableShortTitle: " ",
            },
          ],
        },
        "en",
      ),
    ).toBe("Frequently Asked Questions");
  });
});
