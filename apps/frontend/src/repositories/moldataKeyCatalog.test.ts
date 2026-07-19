import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createTestDb } from "@/tests/fixtures/test-db";

import {
  createMoldataKeyCatalogRepository,
  MoldataKeyCatalogConflictError,
  MoldataKeyCatalogDuplicateKeyError,
  MoldataKeyCatalogValidationError,
} from "./moldataKeyCatalog";

const testDb = createTestDb();

beforeEach(async () => {
  await testDb.setup();
  await testDb.clearTables();
});

afterEach(async () => {
  await testDb.clearTables();
});

describe("moldata key catalog repository", () => {
  test("initializes the ordered defaults only for an empty catalog", async () => {
    const repository = createMoldataKeyCatalogRepository(testDb.db);

    const created = await repository.initializeDefaults();
    const rerun = await repository.initializeDefaults();

    expect(created.created).toBe(true);
    expect(created.catalog.revision).toBe(1);
    expect(created.catalog.entries).toHaveLength(71);
    expect(created.catalog.entries.slice(0, 3).map((entry) => entry.english)).toEqual([
      "Materials and Participants",
      "Experimental Method",
      "Targets",
    ]);
    expect(rerun.created).toBe(false);
    expect(rerun.catalog).toEqual(created.catalog);
  });

  test("reads an uninitialized catalog as empty", async () => {
    const catalog = await createMoldataKeyCatalogRepository(testDb.db).get();

    expect(catalog).toEqual({ revision: 0, entries: [] });
  });

  test("creates a new key at the final position and advances the revision", async () => {
    const repository = createMoldataKeyCatalogRepository(testDb.db);
    const seeded = await repository.initializeDefaults();

    const result = await repository.create({
      english: "Custom key",
      japanese: "カスタムキー",
      expectedRevision: seeded.catalog.revision,
    });

    expect(result.revision).toBe(2);
    expect(result.entry).toMatchObject({
      english: "Custom key",
      japanese: "カスタムキー",
      position: 71,
    });
  });

  test("rejects case-insensitive duplicates and stale catalog writes", async () => {
    const repository = createMoldataKeyCatalogRepository(testDb.db);
    await repository.initializeDefaults();

    await expect(
      repository.create({ english: "targets", japanese: "ターゲット", expectedRevision: 1 }),
    ).rejects.toBeInstanceOf(MoldataKeyCatalogDuplicateKeyError);
    await expect(
      repository.create({ english: "Custom key", japanese: "カスタムキー", expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(MoldataKeyCatalogConflictError);
  });

  test("reorders all entries atomically and advances the revision", async () => {
    const repository = createMoldataKeyCatalogRepository(testDb.db);
    const seeded = await repository.initializeDefaults();
    const originalIds = seeded.catalog.entries.map((entry) => entry.id);
    const orderedIds = [...originalIds].reverse();

    const result = await repository.reorder({
      orderedIds,
      expectedRevision: seeded.catalog.revision,
    });

    expect(result.revision).toBe(2);
    expect(result.entries.map((entry) => entry.id)).toEqual(orderedIds);
    expect(result.entries.map((entry) => entry.position)).toEqual(
      Array.from({ length: orderedIds.length }, (_, index) => index),
    );
  });

  test("rejects stale and incomplete reorders without changing the catalog", async () => {
    const repository = createMoldataKeyCatalogRepository(testDb.db);
    const seeded = await repository.initializeDefaults();
    const orderedIds = seeded.catalog.entries.map((entry) => entry.id);

    await expect(
      repository.reorder({
        orderedIds: orderedIds.slice(1),
        expectedRevision: seeded.catalog.revision,
      }),
    ).rejects.toBeInstanceOf(MoldataKeyCatalogValidationError);
    await expect(repository.reorder({ orderedIds, expectedRevision: 0 })).rejects.toBeInstanceOf(
      MoldataKeyCatalogConflictError,
    );
    expect(await repository.get()).toEqual(seeded.catalog);
  });
});
