import { describe, it, expect } from "bun:test";

import type { DocVersionListItemResponseRaw } from "../src/repositories/documentVersion";
import { groupDocumentVersions } from "../src/serverFunctions/documentVersion";

describe("documentVersions", () => {
  it("groups versions by contentId and versionNumber", () => {
    const input: DocVersionListItemResponseRaw[] = [
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "draft",
        locale: "en",
        title: "EN Draft",
      },
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "published",
        locale: "en",
        title: "EN Published",
      },
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "draft",
        locale: "ja",
        title: "JA Draft",
      },
    ];

    const result = groupDocumentVersions(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      contentId: "doc1",
      versionNumber: 1,
      translations: [
        {
          locale: "en",
          statuses: [
            { status: "draft", title: "EN Draft" },
            {
              status: "published",
              title: "EN Published",
            },
          ],
        },
        {
          locale: "ja",
          statuses: [{ status: "draft", title: "JA Draft" }],
        },
      ],
    });
  });
});
