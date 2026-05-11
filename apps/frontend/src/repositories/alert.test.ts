import * as schema from "@/db/schema";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import {
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "../scripts/database/tests/test-db";
import { createAlertsRepository } from "./alert";

const { db, pool } = createTestDb();
const repo = createAlertsRepository(db);

const AUTHOR_ID = "test-user";

async function clearAlertTables() {
  await db.execute(sql`SET session_replication_role = replica`);
  await db.execute(
    sql`TRUNCATE TABLE alert_translation, alert, "user" RESTART IDENTITY CASCADE`,
  );
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
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [
        { lang: "en", content: "Test alert" },
        { lang: "ja", content: "テストアラート" },
      ],
    });

    const alerts = await db.select().from(schema.alert);
    expect(alerts).toHaveLength(1);

    const translations = await db.select().from(schema.alertTranslation);
    expect(translations).toHaveLength(2);
  });

  test("defaults enabled to true", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Test" }],
    });

    const [a] = await db.select().from(schema.alert);
    expect(a?.enabled).toBe(true);
  });

  test("stores from/to dates", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      from: "2026-01-01",
      to: "2026-12-31",
      tranlations: [{ lang: "en", content: "Test" }],
    });

    const [a] = await db.select().from(schema.alert);
    expect(a?.from).toBe("2026-01-01");
    expect(a?.to).toBe("2026-12-31");
  });
});

describe("alertsRepository.listActive", () => {
  test("returns active alert for locale", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Active alert" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe("Active alert");
  });

  test("filters by locale", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [
        { lang: "en", content: "English alert" },
        { lang: "ja", content: "日本語アラート" },
      ],
    });

    const en = await repo.listActive({ lang: "en" });
    expect(en).toHaveLength(1);
    expect(en[0]?.content).toBe("English alert");

    const ja = await repo.listActive({ lang: "ja" });
    expect(ja).toHaveLength(1);
    expect(ja[0]?.content).toBe("日本語アラート");
  });

  test("excludes disabled alerts", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      enabled: false,
      tranlations: [{ lang: "en", content: "Disabled alert" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("excludes alerts where from is in the future", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      from: "2099-01-01",
      tranlations: [{ lang: "en", content: "Future alert" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("excludes alerts where to is in the past", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      to: "2000-01-01",
      tranlations: [{ lang: "en", content: "Expired alert" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(0);
  });

  test("includes alerts with no date bounds", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Unbounded alert" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
  });

  test("includes alert whose date range spans today", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      from: "2020-01-01",
      to: "2099-12-31",
      tranlations: [{ lang: "en", content: "Active range" }],
    });

    const results = await repo.listActive({ lang: "en" });
    expect(results).toHaveLength(1);
  });
});

describe("alertsRepository.list", () => {
  test("returns all alerts", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Alert one" }],
    });
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Alert two" }],
    });

    const results = await repo.list({});
    expect(results).toHaveLength(2);
  });

  test("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({
        authorId: AUTHOR_ID,
        tranlations: [{ lang: "en", content: `Alert ${i}` }],
      });
    }

    const results = await repo.list({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  test("respects offset", async () => {
    for (let i = 0; i < 3; i++) {
      await repo.create({
        authorId: AUTHOR_ID,
        tranlations: [{ lang: "en", content: `Alert ${i}` }],
      });
    }

    const all = await repo.list({});
    const paged = await repo.list({ offset: 1 });
    expect(paged).toHaveLength(all.length - 1);
  });

  test("content search matches substring", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "System maintenance warning" }],
    });
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Unrelated content" }],
    });

    const results = await repo.list({ content: "maintenance" });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe("System maintenance warning");
  });

  test("content search returns no results for non-matching term", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "System maintenance warning" }],
    });

    const results = await repo.list({ content: "downtime" });
    expect(results).toHaveLength(0);
  });

  test("content search matches Japanese substring", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "ja", content: "メンテナンスの予定" }],
    });

    const results = await repo.list({ content: "メンテナンス" });
    expect(results).toHaveLength(1);
  });

  test("content search matches across locales", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [
        { lang: "en", content: "Maintenance scheduled" },
        { lang: "ja", content: "メンテナンスの予定" },
      ],
    });

    const results = await repo.list({ content: "Maintenance" });
    expect(results).toHaveLength(1);
    expect(results[0]?.lang).toBe("en");
  });
});

describe("alertsRepository.update", () => {
  test("updates enabled flag", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Original" }],
    });
    const [a] = await db.select().from(schema.alert);

    await repo.update({
      id: a!.id,
      enabled: false,
      tranlations: [{ lang: "en", content: "Original" }],
    });

    const [updated] = await db.select().from(schema.alert);
    expect(updated?.enabled).toBe(false);
  });

  test("upserts translations", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "Original" }],
    });
    const [a] = await db.select().from(schema.alert);

    await repo.update({
      id: a!.id,
      tranlations: [{ lang: "en", content: "Updated" }],
    });

    const translations = await db.select().from(schema.alertTranslation);
    expect(translations).toHaveLength(1);
    expect(translations[0]?.content).toBe("Updated");
  });
});

describe("alertsRepository.delete", () => {
  test("deletes alert and cascades to translations", async () => {
    await repo.create({
      authorId: AUTHOR_ID,
      tranlations: [{ lang: "en", content: "To delete" }],
    });
    const [a] = await db.select().from(schema.alert);

    await repo.delete(a!.id);

    const alerts = await db.select().from(schema.alert);
    const translations = await db.select().from(schema.alertTranslation);
    expect(alerts).toHaveLength(0);
    expect(translations).toHaveLength(0);
  });
});
