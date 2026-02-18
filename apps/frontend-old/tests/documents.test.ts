import { describe, it, expect } from "bun:test";

import type {
  DocVersionListItemResponseRaw,
  DocVersionResponseRaw,
} from "../src/repositories/documentVersion";
import {
  groupDocumentVersions,
  groupDocVersion,
} from "../src/serverFunctions/documentVersion";

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

  // -----------------------------------------------------------------------
  // groupDocumentVersions — list shape after adding a new version
  // -----------------------------------------------------------------------

  it("new version appears in list with only draft statuses copying published locales", () => {
    // Simulates the DB rows after createVersionFromPublished copies
    // the latest published content (en + ja) into drafts at version 2.
    const input: DocVersionListItemResponseRaw[] = [
      // --- version 1: fully published in both locales ---
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "published",
        locale: "en",
        title: "V1 EN Published",
      },
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "published",
        locale: "ja",
        title: "V1 JA Published",
      },
      // --- version 2: newly created, drafts only ---
      {
        contentId: "doc1",
        versionNumber: 2,
        status: "draft",
        locale: "en",
        title: "V1 EN Published",
      },
      {
        contentId: "doc1",
        versionNumber: 2,
        status: "draft",
        locale: "ja",
        title: "V1 JA Published",
      },
    ];

    const result = groupDocumentVersions(input);

    expect(result).toHaveLength(2);

    // version 1 unchanged
    expect(result[0].versionNumber).toBe(1);
    expect(result[0].translations).toHaveLength(2);
    expect(result[0].translations[0]).toEqual({
      locale: "en",
      statuses: [{ status: "published", title: "V1 EN Published" }],
    });

    // version 2: each locale has exactly one draft status with the copied title
    expect(result[1].versionNumber).toBe(2);
    expect(result[1].translations).toHaveLength(2);
    expect(result[1].translations[0]).toEqual({
      locale: "en",
      statuses: [{ status: "draft", title: "V1 EN Published" }],
    });
    expect(result[1].translations[1]).toEqual({
      locale: "ja",
      statuses: [{ status: "draft", title: "V1 JA Published" }],
    });
  });

  it("new version created when no published content exists produces single default-locale draft", () => {
    // First version ever: createVersionFromPublished finds zero published rows,
    // so it inserts one empty draft for the default locale.
    const input: DocVersionListItemResponseRaw[] = [
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "draft",
        locale: "en",
        title: null,
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
          statuses: [{ status: "draft", title: "" }], // null title is normalised to ""
        },
      ],
    });
  });

  it("new version only copies the latest published content per locale, not older versions", () => {
    // en was published in both v1 and v2; ja only in v1.
    // createVersionFromPublished should copy v2/en and v1/ja into v3 drafts.
    const input: DocVersionListItemResponseRaw[] = [
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "published",
        locale: "en",
        title: "V1 EN",
      },
      {
        contentId: "doc1",
        versionNumber: 1,
        status: "published",
        locale: "ja",
        title: "V1 JA",
      },
      {
        contentId: "doc1",
        versionNumber: 2,
        status: "published",
        locale: "en",
        title: "V2 EN",
      },
      // v3: drafts reflect latest-per-locale
      {
        contentId: "doc1",
        versionNumber: 3,
        status: "draft",
        locale: "en",
        title: "V2 EN",
      },
      {
        contentId: "doc1",
        versionNumber: 3,
        status: "draft",
        locale: "ja",
        title: "V1 JA",
      },
    ];

    const result = groupDocumentVersions(input);

    expect(result).toHaveLength(3);

    const v3 = result[2];
    expect(v3.versionNumber).toBe(3);
    expect(v3.translations).toHaveLength(2);
    expect(v3.translations.find((t) => t.locale === "en")?.statuses).toEqual([
      { status: "draft", title: "V2 EN" },
    ]);
    expect(v3.translations.find((t) => t.locale === "ja")?.statuses).toEqual([
      { status: "draft", title: "V1 JA" },
    ]);
  });

  // -----------------------------------------------------------------------
  // groupDocVersion — single-version detail shape for a newly created version
  // -----------------------------------------------------------------------

  describe("groupDocVersion", () => {
    it("groups a new version's draft rows into the expected translations map", () => {
      // What getVersion returns for a freshly created version 2
      const input: DocVersionResponseRaw[] = [
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "en",
          status: "draft",
          title: "Copied EN",
          content: "EN body",
        },
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "ja",
          status: "draft",
          title: "Copied JA",
          content: "JA body",
        },
      ];

      const result = groupDocVersion(input);

      expect(result).toEqual({
        contentId: "doc1",
        versionNumber: 2,
        translations: {
          en: { draft: { title: "Copied EN", content: "EN body" } },
          ja: { draft: { title: "Copied JA", content: "JA body" } },
        },
      });
    });

    it("new version with null title and content from empty first version", () => {
      const input: DocVersionResponseRaw[] = [
        {
          contentId: "doc1",
          versionNumber: 1,
          locale: "en",
          status: "draft",
          title: null,
          content: null,
        },
      ];

      const result = groupDocVersion(input);

      expect(result).toEqual({
        contentId: "doc1",
        versionNumber: 1,
        translations: {
          en: { draft: { title: null, content: null } },
        },
      });
    });

    it("new version has no published key — only draft exists after creation", () => {
      const input: DocVersionResponseRaw[] = [
        {
          contentId: "doc1",
          versionNumber: 3,
          locale: "en",
          status: "draft",
          title: "T",
          content: "C",
        },
      ];

      const result = groupDocVersion(input);

      expect(result.translations.en?.published).toBeUndefined();
      expect(result.translations.en?.draft).toEqual({
        title: "T",
        content: "C",
      });
    });

    it("version with both draft and published rows for the same locale groups both statuses", () => {
      // After a user publishes, getVersion returns both rows.
      const input: DocVersionResponseRaw[] = [
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "en",
          status: "draft",
          title: "Draft Title",
          content: "Draft",
        },
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "en",
          status: "published",
          title: "Pub Title",
          content: "Published",
        },
      ];

      const result = groupDocVersion(input);

      expect(result.translations.en).toEqual({
        draft: { title: "Draft Title", content: "Draft" },
        published: { title: "Pub Title", content: "Published" },
      });
    });

    it("version with multiple locales each having draft and published", () => {
      const input: DocVersionResponseRaw[] = [
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "en",
          status: "draft",
          title: "EN D",
          content: "en-d",
        },
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "en",
          status: "published",
          title: "EN P",
          content: "en-p",
        },
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "ja",
          status: "draft",
          title: "JA D",
          content: "ja-d",
        },
        {
          contentId: "doc1",
          versionNumber: 2,
          locale: "ja",
          status: "published",
          title: "JA P",
          content: "ja-p",
        },
      ];

      const result = groupDocVersion(input);

      expect(result).toEqual({
        contentId: "doc1",
        versionNumber: 2,
        translations: {
          en: {
            draft: { title: "EN D", content: "en-d" },
            published: { title: "EN P", content: "en-p" },
          },
          ja: {
            draft: { title: "JA D", content: "ja-d" },
            published: { title: "JA P", content: "ja-p" },
          },
        },
      });
    });
  });
});
