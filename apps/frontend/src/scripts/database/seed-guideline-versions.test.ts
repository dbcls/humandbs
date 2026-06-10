import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import {
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "@/tests/fixtures/test-db";

import { seedGuidelineVersions } from "./seed-guideline-versions";

const { db, pool } = createTestDb();

// Minimal fixture: one document with 2 historical versions (v1 ja/en, v2 ja/en)
const DOC_CONTENT_ID = "guidelines/data-sharing-guidelines";

const PAGES = [
  {
    path: "data-sharing-guidelines-v1",
    lang: "ja" as const,
    title: "データ共有 v1",
    contentHtml: "<p>v1 ja</p>",
    contentText: "v1 ja",
    originalUrl: "",
    releaseDate: "2010-01-01",
    modifiedDate: "2010-01-01",
  },
  {
    path: "data-sharing-guidelines-v1",
    lang: "en" as const,
    title: "Data Sharing v1",
    contentHtml: "<p>v1 en</p>",
    contentText: "v1 en",
    originalUrl: "",
    releaseDate: "2010-01-01",
    modifiedDate: "2010-01-01",
  },
  {
    path: "data-sharing-guidelines-v2",
    lang: "ja" as const,
    title: "データ共有 v2",
    contentHtml: "<p>v2 ja</p>",
    contentText: "v2 ja",
    originalUrl: "",
    releaseDate: "2012-01-01",
    modifiedDate: "2012-01-01",
  },
];

async function insertDocument(contentId = DOC_CONTENT_ID): Promise<string> {
  const [doc] = await db
    .insert(schema.document)
    .values({ contentId })
    .returning({ id: schema.document.id })
    .execute();
  return doc!.id;
}

async function insertUser(id = "system"): Promise<void> {
  await db.insert(schema.user).values({ id, name: "System", email: "system@seed.local", role: "admin" }).execute();
}

async function versionsFor(docId: string) {
  return db
    .select()
    .from(schema.documentVersion)
    .where(eq(schema.documentVersion.documentId, docId))
    .orderBy(schema.documentVersion.versionNumber, schema.documentVersion.locale)
    .execute();
}

beforeAll(async () => {
  await createTestDatabase();
  await pushSchema();
});

afterAll(async () => {
  await pool.end();
  await dropTestDatabase();
});

afterEach(async () => {
  await db.execute(sql`SET session_replication_role = replica`);
  await db.execute(sql`TRUNCATE TABLE document_version, document, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`SET session_replication_role = DEFAULT`);
});

describe("seedGuidelineVersions", () => {
  test("inserts historical versions into empty document", async () => {
    await insertUser();
    const docId = await insertDocument();

    await seedGuidelineVersions(false, db, PAGES);

    const versions = await versionsFor(docId);
    // v1 (ja + en) and v2 (ja) = 3 rows
    expect(versions).toHaveLength(3);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 1, 2]);
    expect(versions.map((v) => v.locale)).toEqual(["en", "ja", "ja"]);
  });

  test("all inserted versions have status PUBLISHED", async () => {
    await insertUser();
    await insertDocument();

    await seedGuidelineVersions(false, db, PAGES);

    const versions = await db.select().from(schema.documentVersion).execute();
    expect(versions.every((v) => v.status === DOCUMENT_VERSION_STATUS.PUBLISHED)).toBe(true);
  });

  test("skips re-seeding when fingerprint already present (idempotency)", async () => {
    await insertUser();
    const docId = await insertDocument();

    await seedGuidelineVersions(false, db, PAGES);
    const before = await versionsFor(docId);

    // Second run with same pages — should detect fingerprint and skip
    await seedGuidelineVersions(false, db, PAGES);
    const after = await versionsFor(docId);

    expect(after).toHaveLength(before.length);
    expect(after.map((v) => v.versionNumber)).toEqual(before.map((v) => v.versionNumber));
  });

  test("renumbers pre-existing versions upward before inserting historical ones", async () => {
    await insertUser();
    const docId = await insertDocument();

    // Pre-seed a "current" version at v1 (simulating a CMS-created version before seeding)
    await db.insert(schema.documentVersion).values({
      documentId: docId,
      versionNumber: 1,
      locale: "en",
      status: DOCUMENT_VERSION_STATUS.PUBLISHED,
      title: "Current EN",
      content: "<p>current</p>",
      translatedBy: "system",
    });

    await seedGuidelineVersions(false, db, PAGES);

    const versions = await versionsFor(docId);
    const versionNumbers = versions.map((v) => v.versionNumber);

    // Historical max for data-sharing-guidelines = 9, so pre-existing v1 → v10
    expect(versionNumbers).toContain(10);
    // Historical v1 and v2 should now occupy low slots
    expect(versionNumbers).toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("renumbers draft-only pre-existing versions upward", async () => {
    await insertUser();
    const docId = await insertDocument();

    await db.insert(schema.documentVersion).values({
      documentId: docId,
      versionNumber: 1,
      locale: "en",
      status: DOCUMENT_VERSION_STATUS.DRAFT,
      title: "Draft EN",
      content: "<p>draft</p>",
      translatedBy: "system",
    });

    await seedGuidelineVersions(false, db, PAGES);

    const versions = await versionsFor(docId);
    const draftRow = versions.find((v) => v.status === DOCUMENT_VERSION_STATUS.DRAFT);
    const publishedNumbers = versions
      .filter((v) => v.status === DOCUMENT_VERSION_STATUS.PUBLISHED)
      .map((v) => v.versionNumber);

    // Draft moved up by historicalMax (9), historical published rows fill v1–v2
    expect(draftRow?.versionNumber).toBe(10);
    expect(publishedNumbers).toContain(1);
    expect(publishedNumbers).toContain(2);
  });

  test("renumbers mixed draft and published at same version number", async () => {
    await insertUser();
    const docId = await insertDocument();

    await db.insert(schema.documentVersion).values([
      {
        documentId: docId,
        versionNumber: 1,
        locale: "en",
        status: DOCUMENT_VERSION_STATUS.PUBLISHED,
        title: "Published EN",
        content: "<p>published</p>",
        translatedBy: "system",
      },
      {
        documentId: docId,
        versionNumber: 1,
        locale: "en",
        status: DOCUMENT_VERSION_STATUS.DRAFT,
        title: "Draft EN",
        content: "<p>draft</p>",
        translatedBy: "system",
      },
    ]);

    await seedGuidelineVersions(false, db, PAGES);

    const versions = await versionsFor(docId);
    const at10 = versions.filter((v) => v.versionNumber === 10);

    // Both the published and draft rows should have been renumbered to v10
    expect(at10).toHaveLength(2);
    expect(at10.map((v) => v.status).sort()).toEqual(["draft", "published"]);
    // Historical v1 published rows are now at v1
    const at1 = versions.filter((v) => v.versionNumber === 1);
    expect(at1.every((v) => v.status === DOCUMENT_VERSION_STATUS.PUBLISHED)).toBe(true);
  });

  test("two slugs sharing a version number insert both locales at that version", async () => {
    await insertUser();
    const [doc] = await db
      .insert(schema.document)
      .values({ contentId: "guidelines/security-guidelines-for-dbcenters" })
      .returning({ id: schema.document.id })
      .execute();
    const docId = doc!.id;

    // v3-2 = EN for ver 4, v4 = JA for ver 4 — both map to versionNumber: 4
    const pages = [
      {
        path: "security-guidelines-for-dbcenters-v3-2",
        lang: "en" as const,
        title: "Security DB Centers v4 EN",
        contentHtml: "<p>dbcenters v4 en</p>",
        contentText: "",
        originalUrl: "",
        releaseDate: "2020-01-01",
        modifiedDate: "2020-01-01",
      },
      {
        path: "security-guidelines-for-dbcenters-v4",
        lang: "ja" as const,
        title: "セキュリティ DB センター v4",
        contentHtml: "<p>dbcenters v4 ja</p>",
        contentText: "",
        originalUrl: "",
        releaseDate: "2020-01-01",
        modifiedDate: "2020-01-01",
      },
    ];

    await seedGuidelineVersions(false, db, pages);

    const versions = await versionsFor(docId);
    const v4 = versions.filter((v) => v.versionNumber === 4);

    expect(v4).toHaveLength(2);
    expect(v4.map((v) => v.locale).sort()).toEqual(["en", "ja"]);
  });

  test("overwrites content when overwrite=true", async () => {
    await insertUser();
    const docId = await insertDocument();

    await seedGuidelineVersions(false, db, PAGES);

    const updatedPages = PAGES.map((p) =>
      p.path === "data-sharing-guidelines-v1" && p.lang === "ja"
        ? { ...p, contentHtml: "<p>updated ja</p>" }
        : p,
    );

    await seedGuidelineVersions(true, db, updatedPages);

    const [v1ja] = await db
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, docId))
      // versionNumber=1, locale=ja, status=published
      .execute()
      .then((rows) => rows.filter((r) => r.versionNumber === 1 && r.locale === "ja"));

    expect(v1ja?.content).toBe("<p>updated ja</p>");
  });
});
