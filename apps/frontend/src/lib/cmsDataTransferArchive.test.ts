import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import tar from "tar-stream";

import * as schema from "@/db/schema";
import { clearTables, createTestDb } from "@/tests/fixtures/test-db";

import {
  type CmsDataTransferArchiveManifest,
  createCmsDataTransferArchiveBuilder,
  createCmsDataTransferArchiveRestorer,
  inspectCmsDataTransferArchive,
} from "./cmsDataTransferArchive";

const testDb = createTestDb();
const { db } = testDb;

const AUTHOR_ID = "cms-transfer-test-user";
const DOC_ID = "11111111-1111-1111-8111-111111111111";

let tempAssetDir: string | null = null;
let restoreAssetDir: string | null = null;

async function extractArchiveEntries(
  archiveBytes: Uint8Array<ArrayBufferLike>,
): Promise<Record<string, string>> {
  const extract = tar.extract();
  const entries: Record<string, string> = {};

  const done = new Promise<Record<string, string>>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => {
        entries[header.name] = Buffer.concat(chunks).toString("utf8");
        next();
      });
      stream.resume();
    });

    extract.on("finish", () => resolve(entries));
    extract.on("error", reject);
  });

  extract.end(gunzipSync(Buffer.from(archiveBytes)));

  return done;
}

async function seedDocumentsFixture() {
  await db.insert(schema.user).values({
    id: AUTHOR_ID,
    name: "CMS Transfer Tester",
    email: "cms-transfer@test.local",
    role: "admin",
  });

  await db.insert(schema.document).values({
    id: DOC_ID,
    contentId: "faq",
  });

  await db.insert(schema.documentVersion).values([
    {
      documentId: DOC_ID,
      versionNumber: 1,
      status: "published",
      locale: "en",
      title: "FAQ",
      content: "<p>English FAQ</p>",
      authorId: AUTHOR_ID,
    },
    {
      documentId: DOC_ID,
      versionNumber: 1,
      status: "draft",
      locale: "ja",
      title: "FAQ JA",
      content: "<p>Japanese FAQ</p>",
      authorId: AUTHOR_ID,
    },
  ]);
}

async function seedAssetFixture() {
  tempAssetDir = await mkdtemp(path.join(tmpdir(), "cms-transfer-assets-"));
  await mkdir(path.join(tempAssetDir, "nested"), { recursive: true });
  await writeFile(path.join(tempAssetDir, "logo.txt"), "asset-root");
  await writeFile(path.join(tempAssetDir, "nested", "diagram.txt"), "asset-nested");
}

async function seedMoldataKeysFixture(revision = 1) {
  await db.insert(schema.moldataKeyCatalog).values({ id: "global", revision });
  return db
    .insert(schema.moldataKeyCatalogEntry)
    .values([
      { english: "First key", japanese: "最初のキー", position: 0 },
      { english: "Second key", japanese: "2番目のキー", position: 1 },
    ])
    .returning();
}

beforeAll(async () => {
  await testDb.setup();
});

afterAll(async () => {
  await testDb.close();
});

afterEach(async () => {
  await clearTables(db);

  if (tempAssetDir) {
    await rm(tempAssetDir, { recursive: true, force: true });
    tempAssetDir = null;
  }

  if (restoreAssetDir) {
    await rm(restoreAssetDir, { recursive: true, force: true });
    restoreAssetDir = null;
  }
});

describe("createCmsDataTransferArchiveBuilder", () => {
  test("builds an archive from injected db and asset directory dependencies", async () => {
    await seedDocumentsFixture();
    await seedAssetFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: () => tempAssetDir!,
    });

    const { bytes } = await buildArchive({
      categories: ["documents", "assets"],
      createdBy: {
        id: AUTHOR_ID,
        email: "cms-transfer@test.local",
        name: "CMS Transfer Tester",
      },
    });

    const files = await extractArchiveEntries(bytes);

    expect(Object.hasOwn(files, "manifest.json")).toBe(true);
    expect(Object.hasOwn(files, "categories/documents.json")).toBe(true);
    expect(Object.hasOwn(files, "assets/logo.txt")).toBe(true);
    expect(Object.hasOwn(files, "assets/nested/diagram.txt")).toBe(true);

    const manifest = JSON.parse(files["manifest.json"] as string) as CmsDataTransferArchiveManifest;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.archiveFormat).toBe("tar.gz");
    expect(manifest.categories).toEqual(["documents", "assets"]);
    expect(manifest.counts.documents).toBe(3);
    expect(manifest.counts.assets).toBe(2);
    expect(manifest.createdBy?.id).toBe(AUTHOR_ID);

    const documentsPayload = JSON.parse(files["categories/documents.json"] as string) as {
      documents: Array<{ id: string; contentId: string }>;
      versions: Array<{ documentId: string; locale: string; status: string }>;
    };

    expect(documentsPayload.documents).toHaveLength(1);
    expect(documentsPayload.documents[0]?.contentId).toBe("faq");
    expect(documentsPayload.versions).toHaveLength(2);
    expect(documentsPayload.versions.map((v) => v.status).sort()).toEqual(["draft", "published"]);

    expect(files["assets/logo.txt"]).toBe("asset-root");
    expect(files["assets/nested/diagram.txt"]).toBe("asset-nested");
  });

  test("inspects a valid archive and reports available restore categories", async () => {
    await seedDocumentsFixture();
    await seedAssetFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: () => tempAssetDir!,
    });

    const { bytes } = await buildArchive({
      categories: ["documents", "assets"],
      createdBy: {
        id: AUTHOR_ID,
        email: "cms-transfer@test.local",
        name: "CMS Transfer Tester",
      },
    });

    const result = await inspectCmsDataTransferArchive({
      fileName: "cms-data-export.tar.gz",
      fileSize: bytes.byteLength,
      lastModified: Date.now(),
      bytes,
    });

    expect(result.archive.categories).toEqual(["documents", "assets"]);
    expect(result.archive.availableCategories).toEqual(["documents", "assets"]);
    expect(result.archive.counts.documents).toBe(3);
    expect(result.archive.assetFileCount).toBe(2);
  });

  test("exports Moldata keys as ordered bilingual pairs and validates the category", async () => {
    await seedMoldataKeysFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({ database: db });
    const { bytes } = await buildArchive({ categories: ["moldata-keys"], createdBy: null });
    const files = await extractArchiveEntries(bytes);
    const inspected = await inspectCmsDataTransferArchive({
      fileName: "cms-data-export.tar.gz",
      fileSize: bytes.byteLength,
      lastModified: Date.now(),
      bytes,
    });

    expect(JSON.parse(files["categories/moldata-keys.json"] as string)).toEqual([
      ["First key", "最初のキー"],
      ["Second key", "2番目のキー"],
    ]);
    expect(inspected.archive.availableCategories).toEqual(["moldata-keys"]);
    expect(inspected.archive.counts["moldata-keys"]).toBe(2);
  });

  test("rejects an invalid Moldata keys payload during archive inspection", async () => {
    const pack = tar.pack();
    const chunks: Buffer[] = [];
    const bytes = await new Promise<Uint8Array<ArrayBufferLike>>((resolve, reject) => {
      pack.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      pack.on("error", reject);
      pack.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
      });
      pack.entry(
        { name: "manifest.json" },
        JSON.stringify({
          schemaVersion: 1,
          archiveFormat: "tar.gz",
          createdAt: new Date().toISOString(),
          createdBy: null,
          categories: ["moldata-keys"],
          counts: { "moldata-keys": 1 },
        }),
      );
      pack.entry({ name: "categories/moldata-keys.json" }, JSON.stringify([["English", ""]]));
      pack.finalize();
    });

    await expect(
      inspectCmsDataTransferArchive({
        fileName: "invalid-moldata-keys.tar",
        fileSize: bytes.byteLength,
        lastModified: Date.now(),
        bytes,
      }),
    ).rejects.toThrow(
      'Archive file "categories/moldata-keys.json" does not match the expected schema.',
    );
  });

  test("silently ignores legacy 'content' category in old archives", async () => {
    const legacyManifest = {
      schemaVersion: 1,
      archiveFormat: "tar.gz",
      createdAt: new Date().toISOString(),
      createdBy: null,
      categories: ["content"],
      counts: { content: 0 },
    };

    const pack = tar.pack();
    const chunks: Buffer[] = [];
    const done = new Promise<Uint8Array<ArrayBufferLike>>((resolve, reject) => {
      pack.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      pack.on("error", reject);
      pack.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
      });
    });

    pack.entry({ name: "manifest.json" }, JSON.stringify(legacyManifest));
    pack.entry(
      { name: "categories/content.json" },
      JSON.stringify({ items: [], translations: [] }),
    );
    pack.finalize();

    const bytes = await done;

    const result = await inspectCmsDataTransferArchive({
      fileName: "cms-data-export.tar",
      fileSize: bytes.byteLength,
      lastModified: Date.now(),
      bytes,
    });

    expect(result.archive.categories).toEqual([]);
    expect(result.archive.availableCategories).toEqual([]);
  });

  test("rejects archives with a missing manifest", async () => {
    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      createArchive: async () => ({
        bytes: async () => {
          const pack = tar.pack();
          const chunks: Buffer[] = [];
          const done = new Promise<Uint8Array<ArrayBufferLike>>((resolve, reject) => {
            pack.on("data", (chunk) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            pack.on("error", reject);
            pack.on("end", () => {
              const buffer = Buffer.concat(chunks);
              resolve(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
            });
          });

          pack.entry({ name: "categories/documents.json" }, "{}");
          pack.finalize();

          return done;
        },
      }),
    });

    const { bytes } = await buildArchive({
      categories: ["documents"],
      createdBy: null,
    });

    await expect(
      inspectCmsDataTransferArchive({
        fileName: "cms-data-export.tar",
        fileSize: bytes.byteLength,
        lastModified: Date.now(),
        bytes,
      }),
    ).rejects.toThrow('Archive is missing required file "manifest.json".');
  });

  test("rejects archives when the manifest declares a missing payload file", async () => {
    await seedDocumentsFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      createArchive: async (files) => {
        const pack = tar.pack();
        const chunks: Buffer[] = [];
        const done = new Promise<Uint8Array<ArrayBufferLike>>((resolve, reject) => {
          pack.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          pack.on("error", reject);
          pack.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
          });
        });

        for (const [name, value] of Object.entries(files)) {
          if (name === "categories/documents.json") continue;

          let entryValue = value;
          if (typeof entryValue !== "string") {
            entryValue = Buffer.from(await (entryValue as Blob).arrayBuffer()).toString("utf8");
          }
          pack.entry({ name }, entryValue as string);
        }

        pack.finalize();
        return {
          bytes: async () => done,
        };
      },
    });

    const { bytes } = await buildArchive({
      categories: ["documents"],
      createdBy: {
        id: AUTHOR_ID,
        email: "cms-transfer@test.local",
        name: "CMS Transfer Tester",
      },
    });

    await expect(
      inspectCmsDataTransferArchive({
        fileName: "cms-data-export.tar",
        fileSize: bytes.byteLength,
        lastModified: Date.now(),
        bytes,
      }),
    ).rejects.toThrow('Archive is missing required file "categories/documents.json".');
  });

  test("restores selected categories and replaces the asset directory", async () => {
    await seedDocumentsFixture();
    await seedAssetFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: () => tempAssetDir!,
    });

    const { bytes } = await buildArchive({
      categories: ["documents", "assets"],
      createdBy: {
        id: AUTHOR_ID,
        email: "cms-transfer@test.local",
        name: "CMS Transfer Tester",
      },
    });

    await clearTables(db);
    await db.insert(schema.user).values({
      id: AUTHOR_ID,
      name: "CMS Transfer Tester",
      email: "cms-transfer@test.local",
      role: "admin",
    });

    const STALE_DOC_ID = "22222222-2222-2222-8222-222222222222";
    await db.insert(schema.document).values({
      id: STALE_DOC_ID,
      contentId: "stale",
    });
    await db.insert(schema.documentVersion).values({
      documentId: STALE_DOC_ID,
      versionNumber: 1,
      status: "draft",
      locale: "en",
      title: "Stale",
      content: "<p>Stale</p>",
      authorId: AUTHOR_ID,
    });

    restoreAssetDir = await mkdtemp(path.join(tmpdir(), "cms-restore-assets-"));
    await writeFile(path.join(restoreAssetDir, "stale.txt"), "stale-asset");

    const restoreArchive = createCmsDataTransferArchiveRestorer({
      database: db,
      getAssetDir: () => restoreAssetDir!,
    });

    const result = await restoreArchive({
      fileName: "cms-data-export.tar.gz",
      bytes,
      categories: ["documents", "assets"],
      restoredByUserId: AUTHOR_ID,
    });

    expect(result.restoredCategories).toEqual(["documents", "assets"]);
    expect(result.counts.documents).toBe(3);
    expect(result.counts.assets).toBe(2);

    const documents = await db.select().from(schema.document);
    const versions = await db.select().from(schema.documentVersion);

    expect(documents).toHaveLength(1);
    expect(documents[0]?.contentId).toBe("faq");
    expect(versions).toHaveLength(2);

    const restoredFiles = await readdir(restoreAssetDir, { recursive: true });
    expect(restoredFiles).toContain("logo.txt");
    expect(restoredFiles).toContain(path.join("nested", "diagram.txt"));
    expect(restoredFiles).not.toContain("stale.txt");
  });

  test("restores Moldata keys only, with fresh IDs and an advanced target revision", async () => {
    const sourceEntries = await seedMoldataKeysFixture();
    const buildArchive = createCmsDataTransferArchiveBuilder({ database: db });
    const { bytes } = await buildArchive({ categories: ["moldata-keys"], createdBy: null });

    await clearTables(db);
    await db.insert(schema.document).values({
      id: "33333333-3333-3333-8333-333333333333",
      contentId: "unrelated-document",
    });
    await db.insert(schema.moldataKeyCatalog).values({ id: "global", revision: 7 });
    await db.insert(schema.moldataKeyCatalogEntry).values({
      english: "Stale key",
      japanese: "古いキー",
      position: 0,
    });

    const restoreArchive = createCmsDataTransferArchiveRestorer({ database: db });
    const result = await restoreArchive({
      fileName: "cms-data-export.tar.gz",
      bytes,
      categories: ["moldata-keys"],
    });

    const [catalog] = await db.select().from(schema.moldataKeyCatalog);
    const restoredEntries = await db
      .select()
      .from(schema.moldataKeyCatalogEntry)
      .orderBy(schema.moldataKeyCatalogEntry.position);
    const documents = await db.select().from(schema.document);

    expect(result.restoredCategories).toEqual(["moldata-keys"]);
    expect(result.counts["moldata-keys"]).toBe(2);
    expect(catalog?.revision).toBe(8);
    expect(
      restoredEntries.map(({ english, japanese, position }) => ({ english, japanese, position })),
    ).toEqual([
      { english: "First key", japanese: "最初のキー", position: 0 },
      { english: "Second key", japanese: "2番目のキー", position: 1 },
    ]);
    expect(restoredEntries.map((entry) => entry.id)).not.toEqual(
      sourceEntries.map((entry) => entry.id),
    );
    expect(documents).toHaveLength(1);
    expect(documents[0]?.contentId).toBe("unrelated-document");
  });
});
