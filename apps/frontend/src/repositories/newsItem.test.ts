import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as schema from "@/db/schema";
import {
  mockNewsItems,
  mockNewsItemTags,
  mockNewsTags,
  mockNewsTranslations,
  NEWS_1_ID,
  NEWS_2_ID,
  TAG_1_ID,
  TAG_2_ID,
} from "@/tests/fixtures/news";
import { createTestDb } from "@/tests/fixtures/test-db";
import { mockUsers } from "@/tests/fixtures/users";

import { createNewsItemRepository } from "./newsItem";

/**
 * News item repo test
 */
const testDb = createTestDb();
const { db } = testDb;

const repo = createNewsItemRepository(db);

beforeAll(async () => {
  await testDb.setup();

  await db.insert(schema.user).values(mockUsers);
});

afterAll(async () => {
  await testDb.close();
});

describe("newsItemRepository.list", () => {
  beforeEach(async () => {
    await db.delete(schema.newsItemTag);
    await db.delete(schema.newsTranslation);
    await db.delete(schema.newsTag);
    await db.delete(schema.newsItem);

    await db.insert(schema.newsItem).values(mockNewsItems);
    await db.insert(schema.newsTag).values(mockNewsTags);
    await db.insert(schema.newsTranslation).values(mockNewsTranslations);
    await db.insert(schema.newsItemTag).values(mockNewsItemTags);
  });

  test("returns items ordered by createdAt desc", async () => {
    const list = await repo.list({});

    expect(list).toBeArrayOfSize(2);
    expect(list.map((i) => i.id)).toEqual([NEWS_2_ID, NEWS_1_ID]);
  });

  test("returns a news item in the correct format", async () => {
    const list = await repo.list({});

    const item = list.find((i) => i.id === NEWS_1_ID)!;

    expect(item).toEqual({
      id: NEWS_1_ID,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      publishedAt: new Date("2024-01-02T00:00:00Z"),
      author: { name: "Test User", email: "test@test.local" },
      translations: [
        {
          status: "published",
          lang: "ja",
          title: "News 1 ja",
          hasUnpublishedChanges: false,
        },
        {
          status: "published",
          lang: "en",
          title: "News 1 en",
          hasUnpublishedChanges: false,
        },
      ],
      tags: [
        { id: TAG_1_ID, name: "release", color: "#ff0000" },
        { id: TAG_2_ID, name: "maintenance", color: null },
      ],
    });
  });

  test("orders translations with default locale first", async () => {
    const list = await repo.list({});

    const item = list.find((i) => i.id === NEWS_1_ID)!;

    expect(item.translations.map((t) => t.lang)).toEqual(["ja", "en"]);
  });

  test("returns empty author fields gracefully and empty tags", async () => {
    const list = await repo.list({});

    const item = list.find((i) => i.id === NEWS_2_ID)!;

    expect(item.author).toEqual({ name: "Test User 2", email: "test2@test.local" });
    expect(item.tags).toEqual([]);
    expect(item.publishedAt).toBeNull();
    expect(item.translations).toEqual([
      {
        status: "published",
        lang: "en",
        title: "News 2 en",
        hasUnpublishedChanges: false,
      },
    ]);
  });

  test("respects limit and offset", async () => {
    const firstPage = await repo.list({ limit: 1, offset: 0 });
    const secondPage = await repo.list({ limit: 1, offset: 1 });

    expect(firstPage.map((i) => i.id)).toEqual([NEWS_2_ID]);
    expect(secondPage.map((i) => i.id)).toEqual([NEWS_1_ID]);
  });

  describe("filters", () => {
    test("filters by titleOrContent across all locales", async () => {
      const list = await repo.list({ filters: { titleOrContent: "News 1 ja" } });

      expect(list.map((i) => i.id)).toEqual([NEWS_1_ID]);
    });

    test("filters by tagIds", async () => {
      const list = await repo.list({ filters: { tagIds: [TAG_1_ID] } });

      expect(list.map((i) => i.id)).toEqual([NEWS_1_ID]);
    });

    test("filters by publishedFrom / publishedTo", async () => {
      const fromList = await repo.list({
        filters: { publishedFrom: new Date("2024-01-01T00:00:00Z") },
      });

      // NEWS_2 has null publishedAt, so it is excluded
      expect(fromList.map((i) => i.id)).toEqual([NEWS_1_ID]);
    });
  });
});
