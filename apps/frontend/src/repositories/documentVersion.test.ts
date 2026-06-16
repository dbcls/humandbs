import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as schema from "@/db/schema";
import {
  DOC_1_CONTENTID,
  DOC_1_ID,
  mockDocuments,
  mockDocumentVersions,
} from "@/tests/fixtures/documents";
import { createTestDb } from "@/tests/fixtures/test-db";
import { AUTHOR_ID_1, mockUsers } from "@/tests/fixtures/users";

import { createDocumentRepository } from "./document";
import { createDocumentVersionRepository, groupDocVersion } from "./documentVersion";

const testDb = createTestDb();

const repo = createDocumentRepository(testDb.db);
const versionsRepo = createDocumentVersionRepository(testDb.db);

beforeAll(async () => {
  await testDb.setup();

  await testDb.db.insert(schema.user).values(mockUsers);
});

afterAll(async () => {
  await testDb.close();
});

describe("Document versions", () => {
  beforeEach(async () => {
    await testDb.db.insert(schema.document).values(mockDocuments);
    await testDb.db.insert(schema.documentVersion).values(mockDocumentVersions);
  });

  afterEach(async () => {
    await testDb.db.delete(schema.documentVersion).execute();
    await testDb.db.delete(schema.document).execute();
  });

  test("increments versionNumber on creating new version", async () => {
    await versionsRepo.createVersionFromPublished(DOC_1_CONTENTID, AUTHOR_ID_1);

    const doc = await repo.getByContentId(DOC_1_CONTENTID);

    const doc1Versions = await testDb.db.query.documentVersion.findMany({
      where: (t, { eq }) => eq(t.documentId, doc!.id),
    });

    expect(Math.max(...doc1Versions.map((dv) => dv.versionNumber))).toBe(2);
  });

  test("saves draft edits so they can be read after reload", async () => {
    await versionsRepo.saveDraft(
      DOC_1_CONTENTID,
      1,
      "en",
      {
        title: "Changed draft title",
        content: "Changed draft content",
      },
      AUTHOR_ID_1,
    );

    const versionRows = await versionsRepo.getVersion(DOC_1_CONTENTID, 1);

    expect(versionRows.translations.en?.draft?.title).toBe("Changed draft title");
    expect(versionRows.translations.en?.draft?.content).toBe("Changed draft content");
    const draftRow = await testDb.db.query.documentVersion.findFirst({
      where: (table, { and, eq }) =>
        and(
          eq(table.documentId, DOC_1_ID),
          eq(table.versionNumber, 1),
          eq(table.locale, "en"),
          eq(table.status, "draft"),
        ),
    });
    expect(draftRow?.updatedBy).toBe(AUTHOR_ID_1);
  });

  test("publish all creates draft and published rows with empty content when no prior draft exists", async () => {
    const NEW_DOC_ID = "123e4567-e89b-12d3-a456-426614174099";
    const NEW_DOC_CONTENTID = "new-document-no-draft";

    await testDb.db.insert(schema.document).values({
      id: NEW_DOC_ID,
      contentId: NEW_DOC_CONTENTID,
      hideFromNav: false,
      hideRevisions: false,
      hideTOC: false,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });

    // Simulate what publishAll does: saveDraft with empty strings, then publish
    await versionsRepo.saveDraft(NEW_DOC_CONTENTID, 1, "en", { title: "", content: "" });
    await versionsRepo.publish(NEW_DOC_CONTENTID, 1, "en");

    const rows = await testDb.db.query.documentVersion.findMany({
      where: (t, { eq }) => eq(t.documentId, NEW_DOC_ID),
    });

    const draftRow = rows.find((r) => r.status === "draft");
    const publishedRow = rows.find((r) => r.status === "published");

    expect(draftRow).toBeDefined();
    expect(draftRow?.title).toBe("");
    expect(draftRow?.content).toBe("");

    expect(publishedRow).toBeDefined();
    expect(publishedRow?.title).toBe("");
    expect(publishedRow?.content).toBe("");
  });

  test("saves draft edits even when updater user is missing locally", async () => {
    await versionsRepo.saveDraft(
      DOC_1_CONTENTID,
      1,
      "ja",
      {
        title: "Changed draft title without local user",
        content: "Changed draft content without local user",
      },
      "missing-user-id",
    );

    const versionRows = await versionsRepo.getVersion(DOC_1_CONTENTID, 1);

    expect(versionRows.translations.ja?.draft?.title).toBe(
      "Changed draft title without local user",
    );
    expect(versionRows.translations.ja?.draft?.content).toBe(
      "Changed draft content without local user",
    );
  });
});

describe("Grouping fn", () => {
  test("correctly groups versions for UI", () => {
    const docVersionsRaw: {
      contentId: string;
      hideTOC: boolean;
      hideRevisions: boolean;
      hideFromNav: boolean;
      author: {
        name: string;
        email: string;
      };
      createdAt: Date;
      updatedAt: Date;
      content: string | null;
      locale: "ja" | "en";
      title: string | null;
      status: "draft" | "published";
      documentId: string;
      versionNumber: number;
      document: {
        hideTOC: boolean | null;
        hideRevisions: boolean | null;
        hideFromNav: boolean | null;
      };
    }[] = [
      {
        contentId: "doc1",
        hideTOC: false,
        hideRevisions: false,
        hideFromNav: false,
        author: {
          name: "Author 1",
          email: "a@a.com",
        },
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
        content: "Lorem ipsum 1",
        locale: "en",
        title: "Document 1",
        status: "published",
        documentId: "doc1-id",
        versionNumber: 1,
        document: {
          hideTOC: false,
          hideRevisions: false,
          hideFromNav: false,
        },
      },
      {
        contentId: "doc1",
        hideTOC: false,
        hideRevisions: false,
        hideFromNav: false,
        author: {
          name: "Author 1",
          email: "a@a.com",
        },
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
        content: "Lorem ipsum 1",
        locale: "en",
        title: "Document 1-draft",
        status: "draft",
        documentId: "doc1-id",
        versionNumber: 1,
        document: {
          hideTOC: false,
          hideRevisions: false,
          hideFromNav: false,
        },
      },
      {
        contentId: "doc1",
        hideTOC: false,
        hideRevisions: false,
        hideFromNav: false,
        author: {
          name: "Author 1",
          email: "a@a.com",
        },
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
        content: "Lorem ipsum 1 ja",
        locale: "ja",
        title: "Document 1 ja",
        status: "published",
        documentId: "doc1-id",
        versionNumber: 1,
        document: {
          hideTOC: false,
          hideRevisions: false,
          hideFromNav: false,
        },
      },
      {
        contentId: "doc1",
        hideTOC: false,
        hideRevisions: false,
        hideFromNav: false,
        author: {
          name: "Author 1",
          email: "a@a.com",
        },
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
        content: "Lorem ipsum 1 ja",
        locale: "ja",
        title: "Document 1-draft",
        status: "draft",
        documentId: "doc1-id",
        versionNumber: 1,
        document: {
          hideTOC: false,
          hideRevisions: false,
          hideFromNav: false,
        },
      },
    ];

    const grouped = groupDocVersion(docVersionsRaw);
    expect(grouped).toEqual({
      contentId: "doc1",
      versionNumber: 1,
      translations: {
        en: {
          createdAt: new Date("2024-01-01T00:00:00Z"),
          updatedAt: new Date("2024-01-02T00:00:00Z"),
          author: {
            name: "Author 1",
            email: "a@a.com",
          },
          published: {
            title: "Document 1",
            content: "Lorem ipsum 1",
          },
          draft: {
            title: "Document 1-draft",
            content: "Lorem ipsum 1",
          },
        },
        ja: {
          createdAt: new Date("2024-01-01T00:00:00Z"),
          updatedAt: new Date("2024-01-02T00:00:00Z"),
          author: {
            name: "Author 1",
            email: "a@a.com",
          },
          published: {
            title: "Document 1 ja",
            content: "Lorem ipsum 1 ja",
          },
          draft: {
            title: "Document 1-draft",
            content: "Lorem ipsum 1 ja",
          },
        },
      },
    });
  });
});
