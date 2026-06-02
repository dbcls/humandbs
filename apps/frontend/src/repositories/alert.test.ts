import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import {
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "@/tests/fixtures/test-db";

import { createAlertsRepository } from "./alert";

const { db, pool } = createTestDb();
const repo = createAlertsRepository(db);

const AUTHOR_ID = "test-user";

async function clearAlertTables() {
  await db.execute(sql`SET session_replication_role = replica`);
  await db.execute(sql`TRUNCATE TABLE alert_translation, alert, "user" RESTART IDENTITY CASCADE`);
  await db.execute(sql`SET session_replication_role = DEFAULT`);
}

beforeAll(async () => {
  await createTestDatabase();
  await pushSchema();
  await db.insert(schema.user).values({
    id: AUTHOR_ID,
    name: "Test User",
    email: "test@test.local",
    role: "admin",
  });
});

afterAll(async () => {
  await pool.end();
  await dropTestDatabase();
});

afterEach(async () => {
  await clearAlertTables();
  await db.insert(schema.user).values({
    id: AUTHOR_ID,
    name: "Test User",
    email: "test@test.local",
    role: "admin",
  });
});

describe("alertsRepository.create", () => {
  test("creates alert with translations", async () => {
    await repo.create(
      {
        translations: [
          { lang: "en", content: "Test alert" },
          { lang: "ja", content: "テストアラート" },
        ],
      },
      AUTHOR_ID,
    );

    const alerts = await db.select().from(schema.alert);
    expect(alerts).toHaveLength(1);

    const translations = await db.select().from(schema.alertTranslation);
    expect(translations).toHaveLength(2);
  });

  test("defaults enabled to true", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Test" }],
      },
      AUTHOR_ID,
    );

    const [a] = await db.select().from(schema.alert);
    expect(a?.enabled).toBe(true);
  });

  test("stores from/to dates", async () => {
    await repo.create(
      {
        from: "2026-01-01",
        to: "2026-12-31",
        translations: [{ lang: "en", content: "Test" }],
      },
      AUTHOR_ID,
    );

    const [a] = await db.select().from(schema.alert);
    expect(a?.from).toBe("2026-01-01");
    expect(a?.to).toBe("2026-12-31");
  });

  test("sets updated metadata on create", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Test" }],
      },
      AUTHOR_ID,
    );

    const [a] = await db.select().from(schema.alert);
    expect(a?.updatedBy).toBe(AUTHOR_ID);
    expect(a?.updatedAt).toBeDefined();
  });
});

describe("alertsRepository.listActive", () => {
  test("returns active alert for locale", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Active alert" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe("Active alert");
  });

  test("filters by locale", async () => {
    await repo.create(
      {
        translations: [
          { lang: "en", content: "English alert" },
          { lang: "ja", content: "日本語アラート" },
        ],
      },
      AUTHOR_ID,
    );

    const en = await repo.listActive({ lang: "en" });
    expect(en).toHaveLength(1);
    expect(en[0]?.content).toBe("English alert");

    const ja = await repo.listActive({ lang: "ja" });
    expect(ja).toHaveLength(1);
    expect(ja[0]?.content).toBe("日本語アラート");
  });

  test("excludes disabled alerts", async () => {
    await repo.create(
      {
        enabled: false,
        translations: [{ lang: "en", content: "Disabled alert" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("excludes alerts where from is in the future", async () => {
    await repo.create(
      {
        from: "2099-01-01",
        translations: [{ lang: "en", content: "Future alert" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("excludes alerts where to is in the past", async () => {
    await repo.create(
      {
        to: "2000-01-01",
        translations: [{ lang: "en", content: "Expired alert" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("includes alerts with no date bounds", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Unbounded alert" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
  });

  test("includes alert whose date range spans today", async () => {
    await repo.create(
      {
        from: "2020-01-01",
        to: "2099-12-31",
        translations: [{ lang: "en", content: "Active range" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
  });
});

describe("alertsRepository.list", () => {
  test("returns grouped alerts", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Alert one" }],
      },
      AUTHOR_ID,
    );
    await repo.create(
      {
        translations: [{ lang: "en", content: "Alert two" }],
      },
      AUTHOR_ID,
    );

    const results = await repo.list();
    expect(results).toHaveLength(2);
    expect(results[0]?.translations.en?.content).toBe("Alert one");
    expect(results[1]?.translations.en?.content).toBe("Alert two");
  });

  test("groups translations under one alert id", async () => {
    await repo.create(
      {
        translations: [
          { lang: "en", content: "Maintenance scheduled" },
          { lang: "ja", content: "メンテナンスの予定" },
        ],
      },
      AUTHOR_ID,
    );

    const results = await repo.list();
    expect(results).toHaveLength(1);
    expect(results[0]?.translations.en?.content).toBe("Maintenance scheduled");
    expect(results[0]?.translations.ja?.content).toBe("メンテナンスの予定");
    expect(results[0]?.author.name).toBe("Test User");
    expect(results[0]?.updatedBy.name).toBe("Test User");
  });
});

describe("alertsRepository.update", () => {
  test("updates enabled flag", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Original" }],
      },
      AUTHOR_ID,
    );
    const [a] = await db.select().from(schema.alert);

    await repo.update(
      {
        id: a!.id,
        enabled: false,
        translations: [{ lang: "en", content: "Original" }],
      },
      AUTHOR_ID,
    );

    const [updated] = await db.select().from(schema.alert);
    expect(updated?.enabled).toBe(false);
  });

  test("replaces translations", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Original" }],
      },
      AUTHOR_ID,
    );
    const [a] = await db.select().from(schema.alert);

    await repo.update(
      {
        id: a!.id,
        translations: [{ lang: "en", content: "Updated" }],
      },
      AUTHOR_ID,
    );

    const translations = await db.select().from(schema.alertTranslation);
    expect(translations).toHaveLength(1);
    expect(translations[0]?.content).toBe("Updated");
  });

  test("updates updated metadata", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "Original" }],
      },
      AUTHOR_ID,
    );
    const [a] = await db.select().from(schema.alert);

    await repo.update(
      {
        id: a!.id,
        translations: [{ lang: "en", content: "Updated" }],
      },
      AUTHOR_ID,
    );

    const [updated] = await db.select().from(schema.alert);
    expect(updated?.updatedBy).toBe(AUTHOR_ID);
    expect(updated?.updatedAt).toBeDefined();
  });
});

describe("alertsRepository.delete", () => {
  test("deletes alert and cascades to translations", async () => {
    await repo.create(
      {
        translations: [{ lang: "en", content: "To delete" }],
      },
      AUTHOR_ID,
    );
    const [a] = await db.select().from(schema.alert);

    await repo.delete(a!.id);

    const alerts = await db.select().from(schema.alert);
    const translations = await db.select().from(schema.alertTranslation);
    expect(alerts).toHaveLength(0);
    expect(translations).toHaveLength(0);
  });
});
