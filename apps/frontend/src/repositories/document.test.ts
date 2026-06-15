import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { i18n } from "@/config/i18n";
import * as schema from "@/db/schema";
import {
  DOC_1_ID,
  DOC_2_ID,
  DOC_3_ID,
  mockDocuments,
  mockDocumentVersions,
} from "@/tests/fixtures/documents";
import {
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "@/tests/fixtures/test-db";
import { AUTHOR_ID_1, mockUsers } from "@/tests/fixtures/users";

import {
  createDocumentRepository,
  groupDocumentVersions,
  type RawDocumentsListItem,
} from "./document";
import { createDocumentVersionRepository } from "./documentVersion";

/**
 * Documents repo test
 */
const { db, pool } = createTestDb();

const repo = createDocumentRepository(db);
const versionsRepo = createDocumentVersionRepository(db);

beforeAll(async () => {
  await createTestDatabase();
  await pushSchema();

  await db.insert(schema.user).values(mockUsers);
});

afterAll(async () => {
  await pool.end();
  await dropTestDatabase();
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
        hasUnpublishedChanges: true,
      },
      {
        contentId: "d1",
        id: "d1",
        lang: "en",
        status: "published",
        title: "hello en published",
        latestVersionNumber: 1,
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
        hasUnpublishedChanges: false,
      },
      {
        contentId: "d1",
        id: "d1",
        lang: "ja",
        status: "published",
        title: "hello ja published",
        latestVersionNumber: 1,
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

    console.log("docList", JSON.stringify(docList, null, 2));

    expect(docList).toBeArrayOfSize(3);
    expect(docList.find((d) => d.id === DOC_1_ID)?.latestVersionNumber).toEqual(1);
    expect(docList.find((d) => d.id === DOC_2_ID)?.latestVersionNumber).toEqual(1);
    expect(docList.find((d) => d.id === DOC_3_ID)?.latestVersionNumber).toBeNull();
  });

  test("translations array have version translations", async () => {
    const docList = await repo.getList(undefined);

    const doc = docList.find((d) => d.contentId === "document2")!;

    expect(doc.translations).toEqual([
      {
        status: "published",
        lang: "en",
        title: "Document 2",
        hasUnpublishedChanges: true,
      },
      {
        status: "published",
        lang: "ja",
        title: "Document 2 ja",
        hasUnpublishedChanges: true,
      },
    ]);
  });

  test("hasUnpublishedChanges is false if only draft exists for locale", async () => {
    // add new version with only draft
    await versionsRepo.createVersionFromPublished("document1", AUTHOR_ID_1);

    const docList = await repo.getList(undefined);

    const doc1 = docList.find((d) => d.contentId === "document1");

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
});
