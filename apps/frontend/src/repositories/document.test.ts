import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { i18n } from "@/config/i18n";
import * as schema from "@/db/schema";
import {
  DOC_1_CONTENTID,
  DOC_1_ID,
  DOC_2_CONTENTID,
  DOC_2_ID,
  DOC_3_ID,
  mockDocuments,
  mockDocumentVersions,
} from "@/tests/fixtures/documents";
import { createTestDb } from "@/tests/fixtures/test-db";
import { AUTHOR_ID_1, AUTHOR_ID_2, mockUsers } from "@/tests/fixtures/users";

import {
  createDocumentRepository,
  groupDocumentVersions,
  type RawDocumentsListItem,
} from "./document";
import { createDocumentVersionRepository } from "./documentVersion";

/**
 * Documents repo test
 */
const testDb = createTestDb();
const { db } = testDb;

const repo = createDocumentRepository(db);
const versionsRepo = createDocumentVersionRepository(db);

beforeAll(async () => {
  await testDb.setup();

  await db.insert(schema.user).values(mockUsers);
});

afterAll(async () => {
  await testDb.close();
});

describe("group document's versions", () => {
  test("leave only published title if draft and published present", () => {
    const documentRows: RawDocumentsListItem[] = [
      {
        contentId: "d1",
        id: "d1",
        lang: "en",
        status: "draft",
        title: "hello en draft",
        latestVersionNumber: 1,
        hideFromNav: false,
        hasUnpublishedChanges: true,
      },
      {
        contentId: "d1",
        id: "d1",
        lang: "en",
        status: "published",
        title: "hello en published",
        latestVersionNumber: 1,
        hideFromNav: false,
        hasUnpublishedChanges: true,
      },
    ];

    const grouped = groupDocumentVersions(documentRows);

    expect(grouped[0].translations).toBeArrayOfSize(1);
    expect(grouped[0].translations).toEqual([
      {
        hasUnpublishedChanges: true,
        lang: "en",
        title: "hello en published",
        status: "published",
      },
    ]);
  });
  test("leave draft only if only draft present for a lang", () => {
    const documentRows: RawDocumentsListItem[] = [
      {
        contentId: "d1",
        id: "d1",
        lang: "en",
        status: "draft",
        title: "hello en draft",
        latestVersionNumber: 1,
        hideFromNav: false,
        hasUnpublishedChanges: false,
      },
      {
        contentId: "d1",
        id: "d1",
        lang: "ja",
        status: "published",
        title: "hello ja published",
        latestVersionNumber: 1,
        hideFromNav: false,
        hasUnpublishedChanges: false,
      },
    ];

    const grouped = groupDocumentVersions(documentRows);

    expect(grouped[0].translations).toBeArrayOfSize(2);
    expect(grouped[0].translations).toEqual([
      {
        title: "hello en draft",
        status: "draft",
        lang: "en",
      },
      {
        title: "hello ja published",
        status: "published",
        lang: "ja",
        hasUnpublishedChanges: false,
      },
    ]);
  });
});

describe("documentRepository db actions", () => {
  beforeEach(async () => {
    await db.delete(schema.document);
    await db.delete(schema.documentVersion);

    await db.insert(schema.document).values(mockDocuments);
    await db.insert(schema.documentVersion).values(mockDocumentVersions);
  });

  test("fetches list of all documents", async () => {
    const docList = await repo.getList(undefined);

    expect(docList).toBeArrayOfSize(3);
    expect(docList.find((d) => d.id === DOC_1_ID)?.latestVersionNumber).toEqual(1);
    expect(docList.find((d) => d.id === DOC_2_ID)?.latestVersionNumber).toEqual(1);
    expect(docList.find((d) => d.id === DOC_3_ID)?.latestVersionNumber).toBeNull();
  });

  test("exposes hideFromNav flag for each document", async () => {
    const docList = await repo.getList(undefined);

    expect(docList.find((d) => d.id === DOC_1_ID)?.hideFromNav).toBe(false);
    expect(docList.find((d) => d.id === DOC_2_ID)?.hideFromNav).toBe(true);
    expect(docList.find((d) => d.id === DOC_3_ID)?.hideFromNav).toBe(false);
  });

  test("translations array have version translations", async () => {
    const docList = await repo.getList(undefined);

    const doc = docList.find((d) => d.contentId === DOC_2_CONTENTID)!;

    expect(doc.translations).toEqual([
      {
        status: "published",
        lang: "ja",
        title: "Document 2 ja",
        hasUnpublishedChanges: true,
      },
      {
        status: "published",
        lang: "en",
        title: "Document 2",
        hasUnpublishedChanges: true,
      },
    ]);
  });

  test("hasUnpublishedChanges is false if only draft exists for locale", async () => {
    // add new version with only draft
    await versionsRepo.createVersionFromPublished(DOC_1_CONTENTID, AUTHOR_ID_1);

    const docList = await repo.getList(undefined);

    const doc1 = docList.find((d) => d.contentId === DOC_1_CONTENTID);

    expect(doc1?.translations).toBeArrayOfSize(2);
    expect(doc1?.translations.map((d) => d.lang)).toEqual(["ja", "en"]);
    expect(doc1?.translations.find((t) => t.lang === i18n.defaultLocale)?.status).toBe("draft");
    expect(doc1?.translations.find((t) => t.lang === i18n.defaultLocale)?.title).toBe(
      "Document 1 ja",
    );
    expect(doc1?.translations.find((t) => t.lang === i18n.defaultLocale)).not.toHaveProperty(
      "hasUnpublishedChanges",
    );
  });

  test("hasUnpublishedChanges is false if draft & published have same title & content", async () => {
    // add new version with same title & content as published
    await versionsRepo.createVersionFromPublished(DOC_1_CONTENTID, AUTHOR_ID_1);

    await db.insert(schema.documentVersion).values({
      documentId: DOC_1_ID,
      content: "Lorem ipsum 1 ja",
      title: "Document 1 ja",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
      publishedAt: new Date("2024-01-03T00:00:00Z"),
      publishedBy: AUTHOR_ID_1,
      updatedBy: AUTHOR_ID_2,
      versionNumber: 2,
      status: "published",
      locale: "ja",
      authorId: AUTHOR_ID_1,
    });

    const docList = await repo.getList(undefined);

    const doc1 = docList.find((d) => d.contentId === "document1");

    expect(doc1?.translations).toBeArrayOfSize(2);
    expect(doc1?.translations.find((t) => t.lang === "ja")?.status).toBe("published");
    expect(doc1?.translations.find((t) => t.lang === "ja")?.hasUnpublishedChanges).toBe(false);
  });

  test("correctly reads latestVersion after appending", async () => {
    await versionsRepo.createVersionFromPublished("document1", AUTHOR_ID_1);

    const docList = await repo.getList("document1");

    const doc1 = docList.find((d) => d.contentId === "document1");

    expect(doc1?.latestVersionNumber).toEqual(2);
  });

  test("correctly reads latestVersion after deletion", async () => {
    await versionsRepo.createVersionFromPublished("document1", AUTHOR_ID_1);

    await versionsRepo.delete("document1", 1);

    const docList = await repo.getList("document1");

    const doc1 = docList.find((d) => d.contentId === "document1");

    expect(doc1?.latestVersionNumber).toEqual(2);
  });

  test("creates draft rows for all locales when creating a new document", async () => {
    const result = await repo.create("new-doc-all-locales", AUTHOR_ID_1);

    const rows = await db.query.documentVersion.findMany({
      where: (t, { eq }) => eq(t.documentId, result.id),
    });

    expect(rows).toBeArrayOfSize(i18n.locales.length);
    for (const locale of i18n.locales) {
      const row = rows.find((r) => r.locale === locale);
      expect(row).toBeDefined();
      expect(row?.status).toBe("draft");
      expect(row?.versionNumber).toBe(1);
    }

    expect(result.translations).toBeArrayOfSize(i18n.locales.length);
    expect(result.translations.every((t) => t.status === "draft")).toBeTrue();
  });

  test("version list groups translations per version using document list semantics", async () => {
    await versionsRepo.createVersionFromPublished(DOC_1_CONTENTID, AUTHOR_ID_1);

    // before - have ver1 - both published and draft, both hasUnpublishedChanges
    const versionList = await versionsRepo.getVersionList(DOC_1_CONTENTID);

    expect(versionList.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(versionList[0]?.translations).toEqual([
      {
        status: "draft",
        lang: "ja",
        title: "Document 1 ja",
      },
      {
        status: "draft",
        lang: "en",
        title: "Document 1",
      },
    ]);
    expect(versionList[1]?.translations).toEqual([
      {
        status: "published",
        lang: "ja",
        title: "Document 1 ja",
        hasUnpublishedChanges: true,
      },
      {
        status: "published",
        lang: "en",
        title: "Document 1",
        hasUnpublishedChanges: true,
      },
    ]);
  });
});
