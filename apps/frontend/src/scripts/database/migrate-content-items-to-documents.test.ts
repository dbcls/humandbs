import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { createTestDb } from "@/tests/fixtures/test-db";

import { migrateContentItemsToDocuments } from "./migrate-content-items-to-documents";

const testDb = createTestDb();
const { db } = testDb;

async function insertUser(id = "system"): Promise<void> {
  await db
    .insert(schema.user)
    .values({ id, name: "System", email: "system@seed.local", role: "admin" })
    .execute();
}

async function insertContentItem(
  id: string,
  opts: { publishedAt?: string; hideTOC?: boolean } = {},
): Promise<void> {
  await db
    .insert(schema.contentItem)
    .values({
      id,
      authorId: "system",
      publishedAt: opts.publishedAt ?? null,
      hideTOC: opts.hideTOC ?? true,
    })
    .execute();
}

async function insertTranslation(
  contentId: string,
  lang: "en" | "ja",
  opts: {
    title?: string;
    content?: string;
    status?: "published" | "draft";
    updatedAt?: Date | null;
  } = {},
): Promise<void> {
  await db
    .insert(schema.contentTranslation)
    .values({
      contentId,
      lang,
      title: opts.title ?? `Title ${lang}`,
      content: opts.content ?? `<p>Content ${lang}</p>`,
      status: opts.status ?? "published",
      updatedAt: opts.updatedAt ?? null,
    })
    .execute();
}

beforeAll(async () => {
  await testDb.setup();
});

afterAll(async () => {
  await testDb.close();
});

afterEach(async () => {
  await testDb.clearTables([
    "document_version",
    "document",
    "content_translation",
    "content_item",
    '"user"',
  ]);
});

describe("migrateContentItemsToDocuments", () => {
  test("creates a document for each non-excluded content item", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertContentItem("guidelines");

    await migrateContentItemsToDocuments(false, db);

    const docs = await db.select().from(schema.document).execute();
    expect(docs.map((d) => d.contentId).sort()).toEqual(["acknowledgement", "guidelines"]);
  });

  test("sets hideFromNav=true on migrated documents", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    expect(doc?.hideFromNav).toBe(true);
  });

  test("preserves hideTOC from content item", async () => {
    await insertUser();
    await insertContentItem("acknowledgement", { hideTOC: false });

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    expect(doc?.hideTOC).toBe(false);
  });

  test("creates document version v1 for each published translation", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertTranslation("acknowledgement", "ja", { title: "謝辞", content: "<p>ja</p>" });
    await insertTranslation("acknowledgement", "en", {
      title: "Acknowledgement",
      content: "<p>en</p>",
    });

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    const versions = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, doc!.id))
      .execute();

    expect(versions).toHaveLength(2);
    expect(versions.every((v) => v.versionNumber === 1)).toBe(true);
    expect(versions.map((v) => v.locale).sort()).toEqual(["en", "ja"]);
  });

  test("migrated versions preserve the original translation status", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertTranslation("acknowledgement", "en", { status: "published" });
    await insertTranslation("acknowledgement", "ja", { status: "draft" });

    await migrateContentItemsToDocuments(false, db);

    const versions = await db.select().from(schema.documentVersion).execute();
    const statuses = versions.map((v) => v.status).sort();
    expect(statuses).toEqual(["draft", "published"]);
  });

  test("sets createdAt from publishedAt and updatedAt from translation.updatedAt", async () => {
    await insertUser();
    await insertContentItem("acknowledgement", { publishedAt: "2013-11-30" });
    await insertTranslation("acknowledgement", "en", { updatedAt: new Date("2024-10-31") });

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    const [version] = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, doc!.id))
      .execute();

    expect(version?.createdAt).toEqual(new Date("2013-11-30"));
    expect(version?.updatedAt).toEqual(new Date("2024-10-31"));
  });

  test("falls back updatedAt to publishedAt when translation.updatedAt is null", async () => {
    await insertUser();
    await insertContentItem("acknowledgement", { publishedAt: "2013-11-30" });
    await insertTranslation("acknowledgement", "en", { updatedAt: null });

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    const [version] = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, doc!.id))
      .execute();

    expect(version?.updatedAt).toEqual(new Date("2013-11-30"));
  });

  test("skips guideline version content items", async () => {
    await insertUser();
    await insertContentItem("data-sharing-guidelines-v1");

    const result = await migrateContentItemsToDocuments(false, db);

    expect(result.skipped).toBe(1);
    expect(result.skippedIds).toContain("data-sharing-guidelines-v1");
    expect(await db.select().from(schema.document).execute()).toHaveLength(0);
  });

  test("returns correct migrated/skipped counts", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertContentItem("guidelines");
    await insertContentItem("data-sharing-guidelines-v1");

    const result = await migrateContentItemsToDocuments(false, db);

    expect(result.migrated).toBe(2);
    expect(result.skipped).toBe(1);
  });

  test("skips existing document on second run without overwrite", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertTranslation("acknowledgement", "en");

    await migrateContentItemsToDocuments(false, db);
    const result = await migrateContentItemsToDocuments(false, db);

    expect(result.skipped).toBe(1);
    expect(await db.select().from(schema.document).execute()).toHaveLength(1);
  });

  test("overwrites existing document version when overwrite=true", async () => {
    await insertUser();
    await insertContentItem("acknowledgement");
    await insertTranslation("acknowledgement", "en", { content: "<p>original</p>" });

    await migrateContentItemsToDocuments(false, db);

    await db
      .update(schema.contentTranslation)
      .set({ content: "<p>updated</p>" })
      .where(eq(schema.contentTranslation.contentId, "acknowledgement"))
      .execute();

    const result = await migrateContentItemsToDocuments(true, db);

    expect(result.migrated).toBe(1);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "acknowledgement"))
      .execute();

    const [version] = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, doc!.id))
      .execute();

    expect(version?.content).toBe("<p>updated</p>");
  });

  test("content item with no translations creates document but no versions", async () => {
    await insertUser();
    await insertContentItem("empty-item");

    await migrateContentItemsToDocuments(false, db);

    const [doc] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.contentId, "empty-item"))
      .execute();

    expect(doc).toBeDefined();

    const versions = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, doc!.id))
      .execute();

    expect(versions).toHaveLength(0);
  });

  test("guideline-revision slugs are excluded", async () => {
    await insertUser();
    for (const id of ["guideline-revision", "guideline-revision2", "guideline-revision7"]) {
      await insertContentItem(id);
    }

    const result = await migrateContentItemsToDocuments(false, db);

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(3);
  });
});
