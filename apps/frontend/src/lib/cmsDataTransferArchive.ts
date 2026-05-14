import { readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createServerOnlyFn } from "@tanstack/react-start";
import tar from "tar-stream";

import { db } from "@/db/database";
import {
  alert,
  alertTranslation,
  contentItem,
  contentTranslation,
  document,
  documentVersion,
  navigationFlowchart,
  newsItem,
  newsItemTag,
  newsTag,
  newsTranslation,
} from "@/db/schema";
import {
  CMS_DATA_TRANSFER_CATEGORIES,
  type CmsDataTransferCategory,
} from "@/serverFunctions/cmsDataTransfer";

export interface CmsDataTransferArchiveManifest {
  schemaVersion: 1;
  archiveFormat: "tar.gz";
  createdAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  categories: CmsDataTransferCategory[];
  counts: Partial<Record<CmsDataTransferCategory, number>>;
}

type ArchiveFileInput = Record<
  string,
  string | Blob | ArrayBufferView | ArrayBufferLike
>;

type Database = typeof db;

const $$getAssetDir = createServerOnlyFn(() => {
  const filesSubdir =
    process.env.HUMANDBS_FRONTEND_PUBLIC_FILES_DIR ?? "public-files";
  return path.resolve(
    process.env.NODE_ENV === "development" ? "./public" : "./dist/client",
    filesSubdir,
  );
});

async function collectAssetFiles(
  directory: string,
  prefix = "",
): Promise<{
  files: ArchiveFileInput;
  count: number;
}> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT") {
      return {
        files: {},
        count: 0,
      };
    }

    throw error;
  }

  const files: ArchiveFileInput = {};
  let count = 0;

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectAssetFiles(fullPath, archivePath);
      Object.assign(files, nested.files);
      count += nested.count;
      continue;
    }

    if (!entry.isFile()) continue;

    files[`assets/${archivePath}`] = Bun.file(fullPath);
    count += 1;
  }

  return {
    files,
    count,
  };
}

export interface CreateCmsDataTransferArchiveParams {
  categories: CmsDataTransferCategory[];
  createdBy: CmsDataTransferArchiveManifest["createdBy"];
}

export interface CmsDataTransferArchiveBuilderDependencies {
  database: Database;
  getAssetDir?: () => string;
  createArchive?: (
    files: ArchiveFileInput,
  ) =>
    | {
        bytes: () => Promise<Uint8Array<ArrayBufferLike>>;
      }
    | Promise<{
        bytes: () => Promise<Uint8Array<ArrayBufferLike>>;
      }>;
}

async function toUint8Array(
  value: string | Blob | ArrayBufferView | ArrayBufferLike,
): Promise<Uint8Array<ArrayBufferLike>> {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

function collectStreamBytes(
  stream: NodeJS.ReadableStream,
): Promise<Uint8Array<ArrayBufferLike>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(
        new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      );
    });
  });
}

async function createTarGzArchive(files: ArchiveFileInput) {
  const pack = tar.pack();
  const tarBytesPromise = collectStreamBytes(pack);

  for (const name of Object.keys(files).sort()) {
    const content = await toUint8Array(files[name]!);

    await new Promise<void>((resolve, reject) => {
      pack.entry(
        { name, size: content.byteLength },
        Buffer.from(content),
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
  }

  pack.finalize();

  const tarBytes = await tarBytesPromise;
  const gzipped = gzipSync(Buffer.from(tarBytes));

  return {
    bytes: async () =>
      new Uint8Array(
        gzipped.buffer,
        gzipped.byteOffset,
        gzipped.byteLength,
      ),
  };
}

async function buildCategoryPayload(
  database: Database,
  getAssetDir: () => string,
  category: CmsDataTransferCategory,
): Promise<{
  files: ArchiveFileInput;
  count: number;
}> {
  switch (category) {
    case "content": {
      const [items, translations] = await Promise.all([
        database.select().from(contentItem),
        database.select().from(contentTranslation),
      ]);

      return {
        files: {
          "categories/content.json": JSON.stringify(
            { items, translations },
            null,
            2,
          ),
        },
        count: items.length + translations.length,
      };
    }

    case "documents": {
      const [documents, versions] = await Promise.all([
        database.select().from(document),
        database.select().from(documentVersion),
      ]);

      return {
        files: {
          "categories/documents.json": JSON.stringify(
            { documents, versions },
            null,
            2,
          ),
        },
        count: documents.length + versions.length,
      };
    }

    case "news": {
      const [items, translations, tags, itemTags] = await Promise.all([
        database.select().from(newsItem),
        database.select().from(newsTranslation),
        database.select().from(newsTag),
        database.select().from(newsItemTag),
      ]);

      return {
        files: {
          "categories/news.json": JSON.stringify(
            { items, translations, tags, itemTags },
            null,
            2,
          ),
        },
        count:
          items.length + translations.length + tags.length + itemTags.length,
      };
    }

    case "alerts": {
      const [items, translations] = await Promise.all([
        database.select().from(alert),
        database.select().from(alertTranslation),
      ]);

      return {
        files: {
          "categories/alerts.json": JSON.stringify(
            { items, translations },
            null,
            2,
          ),
        },
        count: items.length + translations.length,
      };
    }

    case "assets": {
      return collectAssetFiles(getAssetDir());
    }

    case "header-footer": {
      const activeConfig =
        (await database.query.siteNavigationConfig.findFirst({
          where: (table, { eq }) => eq(table.id, "global"),
        })) ?? null;

      return {
        files: {
          "categories/header-footer.json": JSON.stringify(
            { activeConfig },
            null,
            2,
          ),
        },
        count: activeConfig ? 1 : 0,
      };
    }

    case "flowcharts": {
      const flowcharts = await database.select().from(navigationFlowchart);

      return {
        files: {
          "categories/flowcharts.json": JSON.stringify({ flowcharts }, null, 2),
        },
        count: flowcharts.length,
      };
    }
  }
}

export function createCmsDataTransferArchiveBuilder({
  database,
  getAssetDir = $$getAssetDir,
  createArchive = createTarGzArchive,
}: CmsDataTransferArchiveBuilderDependencies) {
  return async function createCmsDataTransferArchive(
    params: CreateCmsDataTransferArchiveParams,
  ) {
    const normalizedCategories = CMS_DATA_TRANSFER_CATEGORIES.filter(
      (category) => params.categories.includes(category),
    );

    const archiveFiles: ArchiveFileInput = {};
    const counts: Partial<Record<CmsDataTransferCategory, number>> = {};

    for (const category of normalizedCategories) {
      const payload = await buildCategoryPayload(database, getAssetDir, category);
      Object.assign(archiveFiles, payload.files);
      counts[category] = payload.count;
    }

    const manifest: CmsDataTransferArchiveManifest = {
      schemaVersion: 1,
      archiveFormat: "tar.gz",
      createdAt: new Date().toISOString(),
      createdBy: params.createdBy,
      categories: normalizedCategories,
      counts,
    };

    archiveFiles["manifest.json"] = JSON.stringify(manifest, null, 2);

    const archive = await createArchive(archiveFiles);

    return {
      manifest,
      bytes: await archive.bytes(),
    };
  };
}

const createCmsDataTransferArchive = createCmsDataTransferArchiveBuilder({
  database: db,
});

export const $$createCmsDataTransferArchive = createServerOnlyFn(
  async (params: CreateCmsDataTransferArchiveParams) =>
    createCmsDataTransferArchive(params),
);
