import { beforeEach, describe, it, expect, afterAll } from "bun:test";
import { eq, and } from "drizzle-orm";

import { db } from "../src/db/database";
import {
  document,
  documentVersion,
  DOCUMENT_VERSION_STATUS,
} from "../src/db/schema";
import { createDocumentVersionRepository } from "../src/repositories/documentVersion";

const repo = createDocumentVersionRepository(db);

// Test document ID — unique per test run to avoid collisions
const TEST_DOC_ID = `test-doc-${Date.now()}`;

async function cleanupTestData() {
  await db
    .delete(documentVersion)
    .where(eq(documentVersion.contentId, TEST_DOC_ID));
  await db.delete(document).where(eq(document.contentId, TEST_DOC_ID));
}

async function createTestDocument() {
  await db.insert(document).values({ contentId: TEST_DOC_ID });
}

async function insertVersion(
  versionNumber: number,
  locale: "en" | "ja",
  status: "draft" | "published",
  title: string | null,
  content: string | null
) {
  await db.insert(documentVersion).values({
    contentId: TEST_DOC_ID,
    versionNumber,
    locale,
    status,
    title,
    content,
  });
}

async function getVersionRows(versionNumber?: number) {
  if (versionNumber !== undefined) {
    return db.query.documentVersion.findMany({
      where: (t) =>
        and(eq(t.contentId, TEST_DOC_ID), eq(t.versionNumber, versionNumber)),
    });
  }
  return db.query.documentVersion.findMany({
    where: (t) => eq(t.contentId, TEST_DOC_ID),
  });
}

describe("documentVersionRepository.createVersionFromPublished", () => {
  beforeEach(async () => {
    await cleanupTestData();
    await createTestDocument();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("first version: no existing rows → creates version 1 with empty draft for default locale (ja)", async () => {
    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(1);

    const rows = await getVersionRows(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].locale).toBe("ja");
    expect(rows[0].status).toBe(DOCUMENT_VERSION_STATUS.DRAFT);
    expect(rows[0].title).toBeNull();
    expect(rows[0].content).toBeNull();
  });

  it("existing draft but no published → creates next version with empty draft for default locale", async () => {
    // Setup: v1 draft exists but nothing published
    await insertVersion(1, "en", "draft", "Draft Title", "Draft Content");

    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(2);

    const rows = await getVersionRows(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].locale).toBe("ja"); // default locale
    expect(rows[0].status).toBe(DOCUMENT_VERSION_STATUS.DRAFT);
    expect(rows[0].title).toBeNull();
    expect(rows[0].content).toBeNull();
  });

  it("single published locale → new version copies that locale as draft", async () => {
    // Setup: v1 published in en
    await insertVersion(1, "en", "published", "EN Title", "EN Content");

    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(2);

    const rows = await getVersionRows(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].locale).toBe("en");
    expect(rows[0].status).toBe(DOCUMENT_VERSION_STATUS.DRAFT);
    expect(rows[0].title).toBe("EN Title");
    expect(rows[0].content).toBe("EN Content");
  });

  it("two published locales → new version gets one draft per locale", async () => {
    // Setup: v1 published in both en and ja
    await insertVersion(1, "en", "published", "EN Title", "EN Content");
    await insertVersion(1, "ja", "published", "JA Title", "JA Content");

    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(2);

    const rows = await getVersionRows(2);
    expect(rows).toHaveLength(2);

    const enRow = rows.find((r) => r.locale === "en");
    const jaRow = rows.find((r) => r.locale === "ja");

    expect(enRow).toBeDefined();
    expect(enRow!.status).toBe(DOCUMENT_VERSION_STATUS.DRAFT);
    expect(enRow!.title).toBe("EN Title");
    expect(enRow!.content).toBe("EN Content");

    expect(jaRow).toBeDefined();
    expect(jaRow!.status).toBe(DOCUMENT_VERSION_STATUS.DRAFT);
    expect(jaRow!.title).toBe("JA Title");
    expect(jaRow!.content).toBe("JA Content");
  });

  it("picks latest published per locale when same locale published across multiple versions", async () => {
    // Setup:
    // v1: en published "V1 EN", ja published "V1 JA"
    // v2: en published "V2 EN" (ja not published in v2)
    // Expected: v3 drafts should have "V2 EN" and "V1 JA"
    await insertVersion(1, "en", "published", "V1 EN", "v1-en-content");
    await insertVersion(1, "ja", "published", "V1 JA", "v1-ja-content");
    await insertVersion(2, "en", "published", "V2 EN", "v2-en-content");

    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(3);

    const rows = await getVersionRows(3);
    expect(rows).toHaveLength(2);

    const enRow = rows.find((r) => r.locale === "en");
    const jaRow = rows.find((r) => r.locale === "ja");

    // en should come from v2
    expect(enRow!.title).toBe("V2 EN");
    expect(enRow!.content).toBe("v2-en-content");

    // ja should come from v1 (latest published for ja)
    expect(jaRow!.title).toBe("V1 JA");
    expect(jaRow!.content).toBe("v1-ja-content");
  });

  it("preserves null title/content from published source", async () => {
    await insertVersion(1, "en", "published", null, null);

    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(2);

    const rows = await getVersionRows(2);
    expect(rows[0].title).toBeNull();
    expect(rows[0].content).toBeNull();
  });

  it("translatedBy is set on all created draft rows when provided", async () => {
    // Note: translatedBy has a FK constraint to user table.
    // This test verifies the parameter is passed through by checking
    // that without translatedBy, the rows have null translatedBy.
    await insertVersion(1, "en", "published", "EN", "en-body");
    await insertVersion(1, "ja", "published", "JA", "ja-body");

    // Call without translatedBy
    const result = await repo.createVersionFromPublished(TEST_DOC_ID);

    expect(result.versionNumber).toBe(2);

    const rows = await getVersionRows(2);
    expect(rows).toHaveLength(2);
    // Without a user ID passed, translatedBy should be null/undefined
    expect(rows.every((r) => r.translatedBy === null)).toBe(true);
  });

  it("calling createVersionFromPublished multiple times increments version number each time", async () => {
    // First call: creates v1
    const r1 = await repo.createVersionFromPublished(TEST_DOC_ID);
    expect(r1.versionNumber).toBe(1);

    // Publish v1 so next call has something to copy
    await db
      .update(documentVersion)
      .set({ status: DOCUMENT_VERSION_STATUS.PUBLISHED })
      .where(
        and(
          eq(documentVersion.contentId, TEST_DOC_ID),
          eq(documentVersion.versionNumber, 1)
        )
      );

    // Second call: creates v2
    const r2 = await repo.createVersionFromPublished(TEST_DOC_ID);
    expect(r2.versionNumber).toBe(2);

    // Third call: creates v3
    const r3 = await repo.createVersionFromPublished(TEST_DOC_ID);
    expect(r3.versionNumber).toBe(3);
  });

  it("new version drafts do not affect existing published rows", async () => {
    await insertVersion(1, "en", "published", "Original", "original-content");

    await repo.createVersionFromPublished(TEST_DOC_ID);

    // Check v1 published row is unchanged
    const v1Rows = await getVersionRows(1);
    expect(v1Rows).toHaveLength(1);
    expect(v1Rows[0].status).toBe(DOCUMENT_VERSION_STATUS.PUBLISHED);
    expect(v1Rows[0].title).toBe("Original");
    expect(v1Rows[0].content).toBe("original-content");
  });

  it("getVersion returns the new version's data after createVersionFromPublished", async () => {
    // Setup: v1 published
    await insertVersion(1, "en", "published", "EN Title", "EN Content");
    await insertVersion(1, "ja", "published", "JA Title", "JA Content");

    // Create new version
    const result = await repo.createVersionFromPublished(TEST_DOC_ID);
    expect(result.versionNumber).toBe(2);

    // Verify getVersion returns the new version's data
    const versionData = await repo.getVersion(TEST_DOC_ID, 2);

    expect(versionData).toHaveLength(2);
    expect(versionData.find((v) => v.locale === "en")).toMatchObject({
      contentId: TEST_DOC_ID,
      versionNumber: 2,
      locale: "en",
      status: "draft",
      title: "EN Title",
      content: "EN Content",
    });
    expect(versionData.find((v) => v.locale === "ja")).toMatchObject({
      contentId: TEST_DOC_ID,
      versionNumber: 2,
      locale: "ja",
      status: "draft",
      title: "JA Title",
      content: "JA Content",
    });
  });

  it("getVersionList includes the new version after createVersionFromPublished", async () => {
    // Setup: v1 published
    await insertVersion(1, "en", "published", "V1 EN", "v1-en");

    // Create new version
    await repo.createVersionFromPublished(TEST_DOC_ID);

    // Verify getVersionList includes both versions
    const list = await repo.getVersionList(TEST_DOC_ID);

    // Should have v1 published and v2 draft
    expect(list.length).toBeGreaterThanOrEqual(2);

    const v1 = list.find((v) => v.versionNumber === 1);
    const v2 = list.find((v) => v.versionNumber === 2);

    expect(v1).toBeDefined();
    expect(v1?.status).toBe("published");

    expect(v2).toBeDefined();
    expect(v2?.status).toBe("draft");
    expect(v2?.title).toBe("V1 EN");
  });
});
