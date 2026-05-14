import { readdir } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createServerOnlyFn } from "@tanstack/react-start";
import tar from "tar-stream";
import { z } from "zod";

import { siteNavigationConfigSchema } from "@/config/site-navigation.schema";
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
  cmsDataTransferCategorySchema,
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

export interface InspectCmsDataTransferArchiveParams {
  fileName: string;
  fileSize: number;
  lastModified: number;
  bytes: Uint8Array<ArrayBufferLike>;
}

export interface InspectedCmsDataTransferArchive {
  archive: {
    name: string;
    size: number;
    lastModified: number;
    schemaVersion: 1;
    archiveFormat: "tar.gz";
    createdAt: string;
    createdBy: CmsDataTransferArchiveManifest["createdBy"];
    categories: CmsDataTransferCategory[];
    availableCategories: CmsDataTransferCategory[];
    counts: Partial<Record<CmsDataTransferCategory, number>>;
    assetFileCount: number;
  };
}

type ArchiveFileInput = Record<
  string,
  string | Blob | ArrayBufferView | ArrayBufferLike
>;

type Database = typeof db;

const looseObjectSchema = z.record(z.string(), z.unknown());

const headerFooterActiveConfigSchema = z.object({
  id: z.string(),
  config: siteNavigationConfigSchema,
  revision: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

const contentPayloadSchema = z.object({
  items: z.array(looseObjectSchema),
  translations: z.array(looseObjectSchema),
});

const documentsPayloadSchema = z.object({
  documents: z.array(looseObjectSchema),
  versions: z.array(looseObjectSchema),
});

const newsPayloadSchema = z.object({
  items: z.array(looseObjectSchema),
  translations: z.array(looseObjectSchema),
  tags: z.array(looseObjectSchema),
  itemTags: z.array(looseObjectSchema),
});

const alertsPayloadSchema = z.object({
  items: z.array(looseObjectSchema),
  translations: z.array(looseObjectSchema),
});

const headerFooterPayloadSchema = z.object({
  activeConfig: headerFooterActiveConfigSchema.nullable(),
});

const flowchartRowSchema = z.object({
  id: z.string(),
  isEntryPoint: z.boolean(),
  nameEn: z.string(),
  nameJa: z.string(),
  config: looseObjectSchema,
  status: z.string(),
  revision: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

const flowchartsPayloadSchema = z.object({
  flowcharts: z.array(flowchartRowSchema),
});

const archiveManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    archiveFormat: z.literal("tar.gz"),
    createdAt: z.string(),
    createdBy: z
      .object({
        id: z.string(),
        email: z.string().email(),
        name: z.string(),
      })
      .nullable(),
    categories: z.array(cmsDataTransferCategorySchema),
    counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  })
  .superRefine((manifest, ctx) => {
    const uniqueCategories = new Set(manifest.categories);
    if (uniqueCategories.size !== manifest.categories.length) {
      ctx.addIssue({
        code: "custom",
        message: "Manifest categories must be unique.",
      });
    }

    for (const key of Object.keys(manifest.counts)) {
      if (!CMS_DATA_TRANSFER_CATEGORIES.includes(key as CmsDataTransferCategory)) {
        ctx.addIssue({
          code: "custom",
          message: `Manifest contains unsupported count key "${key}".`,
        });
      }
    }
  });

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

function getCategoryPayloadPath(category: CmsDataTransferCategory) {
  switch (category) {
    case "content":
      return "categories/content.json";
    case "documents":
      return "categories/documents.json";
    case "news":
      return "categories/news.json";
    case "alerts":
      return "categories/alerts.json";
    case "header-footer":
      return "categories/header-footer.json";
    case "flowcharts":
      return "categories/flowcharts.json";
    case "assets":
      return null;
  }
}

function parseJsonFile<T>(
  raw: Uint8Array<ArrayBufferLike>,
  schema: z.ZodType<T>,
  filePath: string,
) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    throw new Error(`Archive file "${filePath}" is not valid JSON.`);
  }

  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(`Archive file "${filePath}" does not match the expected schema.`);
  }

  return parsed.data;
}

function validateCategoryPayload(
  category: CmsDataTransferCategory,
  entryBytes: Uint8Array<ArrayBufferLike> | undefined,
  assetFileCount: number,
) {
  switch (category) {
    case "content":
      if (!entryBytes) {
        throw new Error('Archive is missing required file "categories/content.json".');
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          contentPayloadSchema,
          "categories/content.json",
        );
        return {
          count: payload.items.length + payload.translations.length,
        };
      }
    case "documents":
      if (!entryBytes) {
        throw new Error('Archive is missing required file "categories/documents.json".');
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          documentsPayloadSchema,
          "categories/documents.json",
        );
        return {
          count: payload.documents.length + payload.versions.length,
        };
      }
    case "news":
      if (!entryBytes) {
        throw new Error('Archive is missing required file "categories/news.json".');
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          newsPayloadSchema,
          "categories/news.json",
        );
        return {
          count:
            payload.items.length +
            payload.translations.length +
            payload.tags.length +
            payload.itemTags.length,
        };
      }
    case "alerts":
      if (!entryBytes) {
        throw new Error('Archive is missing required file "categories/alerts.json".');
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          alertsPayloadSchema,
          "categories/alerts.json",
        );
        return {
          count: payload.items.length + payload.translations.length,
        };
      }
    case "header-footer":
      if (!entryBytes) {
        throw new Error(
          'Archive is missing required file "categories/header-footer.json".',
        );
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          headerFooterPayloadSchema,
          "categories/header-footer.json",
        );
        return {
          count: payload.activeConfig ? 1 : 0,
        };
      }
    case "flowcharts":
      if (!entryBytes) {
        throw new Error(
          'Archive is missing required file "categories/flowcharts.json".',
        );
      }
      {
        const payload = parseJsonFile(
          entryBytes,
          flowchartsPayloadSchema,
          "categories/flowcharts.json",
        );
        return {
          count: payload.flowcharts.length,
        };
      }
    case "assets":
      return {
        count: assetFileCount,
      };
  }
}

async function extractArchiveEntries(
  archiveBytes: Uint8Array<ArrayBufferLike>,
): Promise<Record<string, Uint8Array<ArrayBufferLike>>> {
  const extract = tar.extract();
  const entries: Record<string, Uint8Array<ArrayBufferLike>> = {};

  const done = new Promise<Record<string, Uint8Array<ArrayBufferLike>>>(
    (resolve, reject) => {
      extract.on("entry", (header, stream, next) => {
        if (header.type === "directory") {
          stream.resume();
          stream.on("end", next);
          return;
        }

        if (
          header.name.startsWith("/") ||
          header.name.split("/").includes("..") ||
          header.name.length === 0
        ) {
          reject(new Error(`Archive contains an invalid entry path "${header.name}".`));
          stream.resume();
          return;
        }

        if (Object.hasOwn(entries, header.name)) {
          reject(new Error(`Archive contains duplicate entry "${header.name}".`));
          stream.resume();
          return;
        }

        const chunks: Buffer[] = [];

        stream.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on("error", reject);
        stream.on("end", () => {
          const buffer = Buffer.concat(chunks);
          entries[header.name] = new Uint8Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          );
          next();
        });
      });

      extract.on("finish", () => resolve(entries));
      extract.on("error", reject);
    },
  );

  extract.end(Buffer.from(archiveBytes));

  return done;
}

export async function inspectCmsDataTransferArchive(
  params: InspectCmsDataTransferArchiveParams,
): Promise<InspectedCmsDataTransferArchive> {
  const lowerName = params.fileName.toLowerCase();
  const tarBytes = lowerName.endsWith(".tar")
    ? params.bytes
    : new Uint8Array(gunzipSync(Buffer.from(params.bytes)));

  const entries = await extractArchiveEntries(tarBytes);
  const manifestBytes = entries["manifest.json"];

  if (!manifestBytes) {
    throw new Error('Archive is missing required file "manifest.json".');
  }

  const manifest = parseJsonFile(
    manifestBytes,
    archiveManifestSchema,
    "manifest.json",
  ) as CmsDataTransferArchiveManifest;

  const availableCategories: CmsDataTransferCategory[] = [];
  const assetFileCount = Object.keys(entries).filter((name) =>
    name.startsWith("assets/"),
  ).length;

  for (const category of manifest.categories) {
    const payloadPath = getCategoryPayloadPath(category);
    const result = validateCategoryPayload(
      category,
      payloadPath ? entries[payloadPath] : undefined,
      assetFileCount,
    );
    const actualCount = result.count;
    const expectedCount = manifest.counts[category] ?? 0;

    if (expectedCount !== actualCount) {
      throw new Error(
        `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
      );
    }

    availableCategories.push(category);
  }

  return {
    archive: {
      name: params.fileName,
      size: params.fileSize,
      lastModified: params.lastModified,
      schemaVersion: manifest.schemaVersion,
      archiveFormat: manifest.archiveFormat,
      createdAt: manifest.createdAt,
      createdBy: manifest.createdBy,
      categories: manifest.categories,
      availableCategories,
      counts: manifest.counts,
      assetFileCount,
    },
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
