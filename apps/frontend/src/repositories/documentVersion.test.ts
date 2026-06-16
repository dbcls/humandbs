import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as schema from "@/db/schema";
import { DOC_1_CONTENTID, mockDocuments, mockDocumentVersions } from "@/tests/fixtures/documents";
import { createTestDb } from "@/tests/fixtures/test-db";
import { AUTHOR_ID_1, mockUsers } from "@/tests/fixtures/users";

import { createDocumentRepository } from "./document";
import { createDocumentVersionRepository } from "./documentVersion";

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
  beforeAll(async () => {
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
});
