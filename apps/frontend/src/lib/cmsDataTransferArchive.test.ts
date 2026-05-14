import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import tar from "tar-stream";

import * as schema from "@/db/schema";
import {
  clearTables,
  createTestDatabase,
  createTestDb,
  dropTestDatabase,
  pushSchema,
} from "@/scripts/database/tests/test-db";

import {
  createCmsDataTransferArchiveBuilder,
  type CmsDataTransferArchiveManifest,
  inspectCmsDataTransferArchive,
} from "./cmsDataTransferArchive";

const { db, pool } = createTestDb();

const AUTHOR_ID = "cms-transfer-test-user";

let tempAssetDir: string | null = null;

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

async function seedContentFixture() {
  await db.insert(schema.user).values({
    id: AUTHOR_ID,
    name: "CMS Transfer Tester",
    email: "cms-transfer@test.local",
    role: "admin",
  });

  await db.insert(schema.contentItem).values({
    id: "faq",
    authorId: AUTHOR_ID,
    publishedAt: "2026-05-14",
    hideTOC: false,
  });

  await db.insert(schema.contentTranslation).values([
    {
      contentId: "faq",
      title: "FAQ",
      lang: "en",
      content: "<p>English FAQ</p>",
      status: "published",
    },
    {
      contentId: "faq",
      title: "FAQ JA",
      lang: "ja",
      content: "<p>Japanese FAQ</p>",
      status: "draft",
    },
  ]);
}

async function seedAssetFixture() {
  tempAssetDir = await mkdtemp(path.join(tmpdir(), "cms-transfer-assets-"));
  await mkdir(path.join(tempAssetDir, "nested"), { recursive: true });
  await writeFile(path.join(tempAssetDir, "logo.txt"), "asset-root");
  await writeFile(
    path.join(tempAssetDir, "nested", "diagram.txt"),
    "asset-nested",
  );
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
  await clearTables(db);

  if (tempAssetDir) {
    await rm(tempAssetDir, { recursive: true, force: true });
    tempAssetDir = null;
  }
});

describe("createCmsDataTransferArchiveBuilder", () => {
  test("builds an archive from injected db and asset directory dependencies", async () => {
    await seedContentFixture();
    await seedAssetFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: () => tempAssetDir!,
    });

    const { bytes } = await buildArchive({
      categories: ["content", "assets"],
      createdBy: {
        id: AUTHOR_ID,
        email: "cms-transfer@test.local",
        name: "CMS Transfer Tester",
      },
    });

    const files = await extractArchiveEntries(bytes);

    expect(Object.hasOwn(files, "manifest.json")).toBe(true);
    expect(Object.hasOwn(files, "categories/content.json")).toBe(true);
    expect(Object.hasOwn(files, "assets/logo.txt")).toBe(true);
    expect(Object.hasOwn(files, "assets/nested/diagram.txt")).toBe(true);

    const manifest = JSON.parse(
      files["manifest.json"] as string,
    ) as CmsDataTransferArchiveManifest;

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.archiveFormat).toBe("tar.gz");
    expect(manifest.categories).toEqual(["content", "assets"]);
    expect(manifest.counts.content).toBe(3);
    expect(manifest.counts.assets).toBe(2);
    expect(manifest.createdBy?.id).toBe(AUTHOR_ID);

    const contentPayload = JSON.parse(
      files["categories/content.json"] as string,
    ) as {
      items: Array<{ id: string }>;
      translations: Array<{ contentId: string; lang: string; status: string }>;
    };

    expect(contentPayload.items).toHaveLength(1);
    expect(contentPayload.items[0]?.id).toBe("faq");
    expect(contentPayload.translations).toHaveLength(2);
    expect(
      contentPayload.translations.map((item) => item.status).sort(),
    ).toEqual(["draft", "published"]);

    expect(files["assets/logo.txt"]).toBe("asset-root");
    expect(files["assets/nested/diagram.txt"]).toBe("asset-nested");
  });

  test("inspects a valid archive and reports available restore categories", async () => {
    await seedContentFixture();
    await seedAssetFixture();

    const buildArchive = createCmsDataTransferArchiveBuilder({
      database: db,
      getAssetDir: () => tempAssetDir!,
    });

    const { bytes } = await buildArchive({
      categories: ["content", "assets"],
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

    expect(result.archive.categories).toEqual(["content", "assets"]);
    expect(result.archive.availableCategories).toEqual(["content", "assets"]);
    expect(result.archive.counts.content).toBe(3);
    expect(result.archive.assetFileCount).toBe(2);
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
              resolve(
                new Uint8Array(
                  buffer.buffer,
                  buffer.byteOffset,
                  buffer.byteLength,
                ),
              );
            });
          });

          pack.entry({ name: "categories/content.json" }, "{}");
          pack.finalize();

          return done;
        },
      }),
    });

    const { bytes } = await buildArchive({
      categories: ["content"],
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
    await seedContentFixture();

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
            resolve(
              new Uint8Array(
                buffer.buffer,
                buffer.byteOffset,
                buffer.byteLength,
              ),
            );
          });
        });

        for (const [name, value] of Object.entries(files)) {
          if (name === "categories/content.json") continue;

          let entryValue = value;
          if (typeof entryValue !== "string") {
            entryValue = Buffer.from(await (entryValue as Blob).arrayBuffer()).toString(
              "utf8",
            );
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
      categories: ["content"],
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
    ).rejects.toThrow(
      'Archive is missing required file "categories/content.json".',
    );
  });
});
