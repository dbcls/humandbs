import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";

import { seedContent } from "../seed-content";
import {
  clearTables,
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "./test-db";

const { db, pool } = createTestDb();

beforeAll(async () => {
  await createTestDatabase();
  await pushSchema();
  await db.insert(schema.user).values({
    id: "system",
    name: "System",
    email: "system@seed.local",
    role: "admin",
  });
});

afterAll(async () => {
  await pool.end();
  await dropTestDatabase();
});

afterEach(async () => {
  await clearTables(db);
  await db.insert(schema.user).values({
    id: "system",
    name: "System",
    email: "system@seed.local",
    role: "admin",
  });
});

const SAMPLE_PAGES = [
  {
    path: "acknowledgement",
    lang: "ja" as const,
    originalUrl: "https://humandbs.dbcls.jp/acknowledgement",
    title: "謝辞",
    releaseDate: "2013-11-30",
    modifiedDate: "2024-10-31",
    contentHtml: "<p>謝辞のコンテンツ</p>",
    contentText: "謝辞のコンテンツ",
  },
  {
    path: "acknowledgement",
    lang: "en" as const,
    originalUrl: "https://humandbs.dbcls.jp/en/acknowledgement",
    title: "Acknowledgement",
    releaseDate: "2013-11-30",
    modifiedDate: "2024-10-31",
    contentHtml: "<p>Acknowledgement content</p>",
    contentText: "Acknowledgement content",
  },
  {
    path: "guidelines",
    lang: "ja" as const,
    originalUrl: "https://humandbs.dbcls.jp/guidelines",
    title: "ガイドライン",
    releaseDate: "2014-01-01",
    modifiedDate: "2024-09-01",
    contentHtml: "<p>ガイドラインのコンテンツ</p>",
    contentText: "ガイドラインのコンテンツ",
  },
];

describe("seedContent", () => {
  test("creates content items grouped by path", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const items = await db.select().from(schema.contentItem).execute();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(["acknowledgement", "guidelines"]);
  });

  test("sets publishedAt from releaseDate", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const [item] = await db
      .select()
      .from(schema.contentItem)
      .where(eq(schema.contentItem.id, "acknowledgement"))
      .execute();

    expect(item?.publishedAt).toBe("2013-11-30");
  });

  test("creates translations for each lang", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const translations = await db
      .select()
      .from(schema.contentTranslation)
      .where(eq(schema.contentTranslation.contentId, "acknowledgement"))
      .execute();

    expect(translations).toHaveLength(2);
    expect(translations.map((t) => t.lang).sort()).toEqual(["en", "ja"]);
  });

  test("translation content matches contentHtml", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const translations = await db
      .select()
      .from(schema.contentTranslation)
      .where(eq(schema.contentTranslation.contentId, "acknowledgement"))
      .execute();

    const ja = translations.find((t) => t.lang === "ja");
    expect(ja?.content).toBe("<p>謝辞のコンテンツ</p>");
  });

  test("translations are seeded with status published", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const translations = await db.select().from(schema.contentTranslation).execute();

    expect(translations.every((t) => t.status === "published")).toBe(true);
  });

  test("skips existing items on second run without overwrite", async () => {
    const first = await seedContent(SAMPLE_PAGES, false, db);
    const second = await seedContent(SAMPLE_PAGES, false, db);

    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const items = await db.select().from(schema.contentItem).execute();
    expect(items).toHaveLength(2);
  });

  test("overwrites translations when overwrite=true", async () => {
    await seedContent(SAMPLE_PAGES, false, db);

    const updated = SAMPLE_PAGES.map((p) =>
      p.path === "acknowledgement" && p.lang === "ja"
        ? { ...p, contentHtml: "<p>更新されたコンテンツ</p>" }
        : p,
    );
    await seedContent(updated, true, db);

    const translations = await db
      .select()
      .from(schema.contentTranslation)
      .where(eq(schema.contentTranslation.contentId, "acknowledgement"))
      .execute();

    const ja = translations.find((t) => t.lang === "ja");
    expect(ja?.content).toBe("<p>更新されたコンテンツ</p>");
  });

  test("handles items with only one language", async () => {
    await seedContent([SAMPLE_PAGES[0]!], false, db);

    const translations = await db
      .select()
      .from(schema.contentTranslation)
      .where(eq(schema.contentTranslation.contentId, "acknowledgement"))
      .execute();

    expect(translations).toHaveLength(1);
    expect(translations[0]?.lang).toBe("ja");
  });
});
