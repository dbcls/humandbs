import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { createServerOnlyFn } from "@tanstack/react-start";
import tar from "tar-stream";
import { z } from "zod";

import { localeSchema } from "@/config/i18n";
import { navigationFlowchartConfigSchema } from "@/config/navigation-flowchart.schema";
import { siteNavigationConfigSchema } from "@/config/site-navigation.schema";
import { db } from "@/db/database";
import {
  alert,
  alertTranslation,
  contentItem,
  contentTranslation,
  document,
  documentVersion,
  NAVIGATION_FLOWCHART_STATUS,
  navigationFlowchart,
  navigationFlowchartRevision,
  newsItem,
  newsItemTag,
  newsTag,
  newsTranslation,
  siteNavigationConfig,
  siteNavigationConfigRevision,
  user,
} from "@/db/schema";
import type { CmsDataTransferCategory } from "@/serverFunctions/cmsDataTransfer";
import {
  CMS_DATA_TRANSFER_CATEGORIES,
  cmsDataTransferCategorySchema,
} from "@/serverFunctions/cmsDataTransfer";

export interface InspectCmsDataTransferArchiveParams {
  fileName: string;
  fileSize: number;
  lastModified: number;
  bytes: Uint8Array<ArrayBufferLike>;
}

export interface RestoreCmsDataTransferArchiveParams {
  fileName: string;
  bytes: Uint8Array<ArrayBufferLike>;
  categories: CmsDataTransferCategory[];
  restoredByUserId?: string;
}

type ArchiveFileInput = Record<string, string | Blob | ArrayBufferView | ArrayBufferLike>;

type Database = typeof db;

const looseObjectSchema = z.record(z.string(), z.unknown());
const archiveCreatedBySchema = z
  .object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
  })
  .nullable();
const archiveCountsSchema = z.partialRecord(
  cmsDataTransferCategorySchema,
  z.number().int().nonnegative(),
);

const headerFooterActiveConfigSchema = z.object({
  id: z.string(),
  config: siteNavigationConfigSchema,
  revision: z.number().int(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

const timestampStringSchema = z.string().min(1);
const nullableTimestampStringSchema = z.string().min(1).nullable();

const contentItemArchiveRowSchema = z.object({
  id: z.string().min(1),
  createdAt: timestampStringSchema,
  publishedAt: z.string().nullable(),
  authorId: z.string().min(1),
  hideTOC: z.boolean().nullable().optional(),
});

const contentTranslationArchiveRowSchema = z.object({
  contentId: z.string().min(1),
  title: z.string(),
  lang: z.string().min(1),
  updatedAt: nullableTimestampStringSchema,
  content: z.string(),
  status: z.enum(["draft", "published"]),
});

const contentPayloadSchema = z.object({
  items: z.array(contentItemArchiveRowSchema),
  translations: z.array(contentTranslationArchiveRowSchema),
});

const documentArchiveRowSchema = z.object({
  id: z.string().uuid(),
  contentId: z.string().min(1),
  createdAt: timestampStringSchema,
  hideTOC: z.boolean().nullable().optional(),
});

const documentVersionArchiveRowSchema = z.object({
  documentId: z.string().uuid(),
  versionNumber: z.number().int(),
  status: z.enum(["draft", "published"]),
  locale: localeSchema,
  title: z.string().nullable(),
  content: z.string().nullable(),
  authorId: z.string().nullable(),
  createdAt: timestampStringSchema,
  updatedAt: timestampStringSchema,
  publishedAt: nullableTimestampStringSchema.optional(),
});

const documentsPayloadSchema = z.object({
  documents: z.array(documentArchiveRowSchema),
  versions: z.array(documentVersionArchiveRowSchema),
});

const newsItemArchiveRowSchema = z.object({
  id: z.string().uuid(),
  createdAt: timestampStringSchema,
  publishedAt: z.string().nullable(),
  authorId: z.string().min(1),
});

const newsTranslationArchiveRowSchema = z.object({
  newsId: z.string().uuid(),
  title: z.string(),
  lang: z.string().min(1),
  updatedAt: nullableTimestampStringSchema,
  content: z.string(),
});

const newsTagArchiveRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().nullable(),
});

const newsItemTagArchiveRowSchema = z.object({
  newsId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const newsPayloadSchema = z.object({
  items: z.array(newsItemArchiveRowSchema),
  translations: z.array(newsTranslationArchiveRowSchema),
  tags: z.array(newsTagArchiveRowSchema),
  itemTags: z.array(newsItemTagArchiveRowSchema),
});

const alertArchiveRowSchema = z.object({
  id: z.string().uuid(),
  createdAt: timestampStringSchema,
  updatedAt: timestampStringSchema,
  enabled: z.boolean().nullable().optional(),
  authorId: z.string().min(1),
  updatedBy: z.string().min(1),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

const alertTranslationArchiveRowSchema = z.object({
  alertId: z.string().uuid(),
  content: z.string(),
  locale: localeSchema,
});

const alertsPayloadSchema = z.object({
  items: z.array(alertArchiveRowSchema),
  translations: z.array(alertTranslationArchiveRowSchema),
});

const headerFooterPayloadSchema = z.object({
  activeConfig: headerFooterActiveConfigSchema.nullable(),
});

const flowchartRowSchema = z.object({
  id: z.string().uuid(),
  isEntryPoint: z.boolean(),
  nameEn: z.string(),
  nameJa: z.string(),
  config: navigationFlowchartConfigSchema,
  status: z.enum([NAVIGATION_FLOWCHART_STATUS.DRAFT, NAVIGATION_FLOWCHART_STATUS.PUBLISHED]),
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
    createdBy: archiveCreatedBySchema,
    categories: z.array(cmsDataTransferCategorySchema),
    counts: archiveCountsSchema.default({}),
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

export type CmsDataTransferArchiveManifest = z.infer<typeof archiveManifestSchema>;

const inspectedCmsDataTransferArchiveSchema = z.object({
  archive: z.object({
    name: z.string(),
    size: z.number().int().nonnegative(),
    lastModified: z.number().int().nonnegative(),
    schemaVersion: z.literal(1),
    archiveFormat: z.literal("tar.gz"),
    createdAt: z.string(),
    createdBy: archiveCreatedBySchema,
    categories: z.array(cmsDataTransferCategorySchema),
    availableCategories: z.array(cmsDataTransferCategorySchema),
    counts: archiveCountsSchema,
    assetFileCount: z.number().int().nonnegative(),
  }),
});

export type InspectedCmsDataTransferArchive = z.infer<typeof inspectedCmsDataTransferArchiveSchema>;

const restoredCmsDataTransferArchiveSchema = z.object({
  archiveName: z.string(),
  restoredCategories: z.array(cmsDataTransferCategorySchema),
  counts: archiveCountsSchema,
});

export type RestoredCmsDataTransferArchive = z.infer<typeof restoredCmsDataTransferArchiveSchema>;

const $$getAssetDir = createServerOnlyFn(() => {
  const filesSubdir = process.env.HUMANDBS_FRONTEND_PUBLIC_FILES_DIR ?? "public-files";
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
  createArchive?: (files: ArchiveFileInput) =>
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

function collectStreamBytes(stream: NodeJS.ReadableStream): Promise<Uint8Array<ArrayBufferLike>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    });
  });
}

async function createTarGzArchive(files: ArchiveFileInput) {
  const pack = tar.pack();
  const tarBytesPromise = collectStreamBytes(pack);

  for (const name of Object.keys(files).sort()) {
    const content = await toUint8Array(files[name]!);

    await new Promise<void>((resolve, reject) => {
      pack.entry({ name, size: content.byteLength }, Buffer.from(content), (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  pack.finalize();

  const tarBytes = await tarBytesPromise;
  const gzipped = gzipSync(Buffer.from(tarBytes));

  return {
    bytes: async () => new Uint8Array(gzipped.buffer, gzipped.byteOffset, gzipped.byteLength),
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
        const payload = parseJsonFile(entryBytes, contentPayloadSchema, "categories/content.json");
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
        const payload = parseJsonFile(entryBytes, newsPayloadSchema, "categories/news.json");
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
        const payload = parseJsonFile(entryBytes, alertsPayloadSchema, "categories/alerts.json");
        return {
          count: payload.items.length + payload.translations.length,
        };
      }
    case "header-footer":
      if (!entryBytes) {
        throw new Error('Archive is missing required file "categories/header-footer.json".');
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
        throw new Error('Archive is missing required file "categories/flowcharts.json".');
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

  const done = new Promise<Record<string, Uint8Array<ArrayBufferLike>>>((resolve, reject) => {
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
        entries[header.name] = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        next();
      });
    });

    extract.on("finish", () => resolve(entries));
    extract.on("error", reject);
  });

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
  const assetFileCount = Object.keys(entries).filter((name) => name.startsWith("assets/")).length;

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

type ParsedArchivePayloadByCategory = {
  content: z.infer<typeof contentPayloadSchema>;
  documents: z.infer<typeof documentsPayloadSchema>;
  news: z.infer<typeof newsPayloadSchema>;
  alerts: z.infer<typeof alertsPayloadSchema>;
  "header-footer": z.infer<typeof headerFooterPayloadSchema>;
  flowcharts: z.infer<typeof flowchartsPayloadSchema>;
};

interface ParsedCmsDataTransferArchive {
  manifest: CmsDataTransferArchiveManifest;
  availableCategories: CmsDataTransferCategory[];
  assetFileCount: number;
  payloads: Partial<ParsedArchivePayloadByCategory>;
  assetEntries: Record<string, Uint8Array<ArrayBufferLike>>;
}

function normalizeArchiveAssetPath(entryName: string) {
  const relativePath = entryName.replace(/^assets\//, "");
  const normalized = path.posix.normalize(relativePath).replace(/^\/+/, "");

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Archive contains an invalid asset path "${entryName}".`);
  }

  return normalized;
}

async function parseCmsDataTransferArchive(
  fileName: string,
  bytes: Uint8Array<ArrayBufferLike>,
): Promise<ParsedCmsDataTransferArchive> {
  const lowerName = fileName.toLowerCase();
  const tarBytes = lowerName.endsWith(".tar")
    ? bytes
    : new Uint8Array(gunzipSync(Buffer.from(bytes)));

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

  const assetEntries: Record<string, Uint8Array<ArrayBufferLike>> = {};
  const payloads: Partial<ParsedArchivePayloadByCategory> = {};
  const availableCategories: CmsDataTransferCategory[] = [];

  for (const [name, value] of Object.entries(entries)) {
    if (!name.startsWith("assets/")) continue;
    normalizeArchiveAssetPath(name);
    assetEntries[name] = value;
  }

  const assetFileCount = Object.keys(assetEntries).length;

  for (const category of manifest.categories) {
    const payloadPath = getCategoryPayloadPath(category);
    const expectedCount = manifest.counts[category] ?? 0;

    switch (category) {
      case "content": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/content.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], contentPayloadSchema, payloadPath);
        const actualCount = payload.items.length + payload.translations.length;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads.content = payload;
        availableCategories.push(category);
        break;
      }
      case "documents": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/documents.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], documentsPayloadSchema, payloadPath);
        const actualCount = payload.documents.length + payload.versions.length;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads.documents = payload;
        availableCategories.push(category);
        break;
      }
      case "news": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/news.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], newsPayloadSchema, payloadPath);
        const actualCount =
          payload.items.length +
          payload.translations.length +
          payload.tags.length +
          payload.itemTags.length;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads.news = payload;
        availableCategories.push(category);
        break;
      }
      case "alerts": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/alerts.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], alertsPayloadSchema, payloadPath);
        const actualCount = payload.items.length + payload.translations.length;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads.alerts = payload;
        availableCategories.push(category);
        break;
      }
      case "header-footer": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/header-footer.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], headerFooterPayloadSchema, payloadPath);
        const actualCount = payload.activeConfig ? 1 : 0;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads["header-footer"] = payload;
        availableCategories.push(category);
        break;
      }
      case "flowcharts": {
        if (!payloadPath || !entries[payloadPath]) {
          throw new Error('Archive is missing required file "categories/flowcharts.json".');
        }
        const payload = parseJsonFile(entries[payloadPath], flowchartsPayloadSchema, payloadPath);
        const actualCount = payload.flowcharts.length;
        if (expectedCount !== actualCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${actualCount}.`,
          );
        }
        payloads.flowcharts = payload;
        availableCategories.push(category);
        break;
      }
      case "assets": {
        if (expectedCount !== assetFileCount) {
          throw new Error(
            `Archive count mismatch for "${category}": manifest=${expectedCount}, payload=${assetFileCount}.`,
          );
        }
        availableCategories.push(category);
        break;
      }
    }
  }

  return {
    manifest,
    availableCategories,
    assetFileCount,
    payloads,
    assetEntries,
  };
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}

function mapRestoredUserId(
  currentUserId: string | undefined,
  fallbackValue: string | null | undefined,
) {
  if (!currentUserId) {
    return fallbackValue ?? undefined;
  }

  return currentUserId;
}

async function writeArchiveAssetsToDirectory(
  assetEntries: Record<string, Uint8Array<ArrayBufferLike>>,
  targetDirectory: string,
) {
  await mkdir(targetDirectory, { recursive: true });

  for (const [entryName, bytes] of Object.entries(assetEntries)) {
    const relativePath = normalizeArchiveAssetPath(entryName);
    const absolutePath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(bytes));
  }
}

async function replaceAssetDirectory(assetDirectory: string, stagedDirectory: string) {
  const parentDirectory = path.dirname(assetDirectory);
  const backupDirectory = path.join(parentDirectory, `.cms-restore-backup-${Date.now()}`);

  await mkdir(parentDirectory, { recursive: true });

  let movedExistingDirectory = false;

  try {
    await rename(assetDirectory, backupDirectory);
    movedExistingDirectory = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  try {
    await rename(stagedDirectory, assetDirectory);
  } catch (error) {
    if (movedExistingDirectory) {
      await rename(backupDirectory, assetDirectory);
    }
    throw error;
  }

  if (movedExistingDirectory) {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

function assertSelectedRestoreCategories(
  selectedCategories: CmsDataTransferCategory[],
  availableCategories: CmsDataTransferCategory[],
) {
  const normalized = CMS_DATA_TRANSFER_CATEGORIES.filter((category) =>
    selectedCategories.includes(category),
  );

  if (normalized.length === 0) {
    throw new Error("Select at least one archive category to restore.");
  }

  for (const category of normalized) {
    if (!availableCategories.includes(category)) {
      throw new Error(`Archive does not include the selected "${category}" category.`);
    }
  }

  return normalized;
}

export interface CmsDataTransferArchiveRestorerDependencies {
  database: Database;
  getAssetDir?: () => string;
}

export function createCmsDataTransferArchiveRestorer({
  database,
  getAssetDir = $$getAssetDir,
}: CmsDataTransferArchiveRestorerDependencies) {
  return async function restoreCmsDataTransferArchive(
    params: RestoreCmsDataTransferArchiveParams,
  ): Promise<RestoredCmsDataTransferArchive> {
    const parsedArchive = await parseCmsDataTransferArchive(params.fileName, params.bytes);
    const restoredCategories = assertSelectedRestoreCategories(
      params.categories,
      parsedArchive.availableCategories,
    );

    let stagedAssetDirectory: string | null = null;

    try {
      if (restoredCategories.includes("assets")) {
        stagedAssetDirectory = await mkdtemp(path.join(tmpdir(), "cms-data-restore-assets-"));
        await writeArchiveAssetsToDirectory(parsedArchive.assetEntries, stagedAssetDirectory);
      }

      await database.transaction(async (tx) => {
        const effectiveUserId = params.restoredByUserId;

        if (effectiveUserId) {
          await tx
            .insert(user)
            .values({
              id: effectiveUserId,
              role: "admin",
            })
            .onConflictDoNothing();
        }

        if (restoredCategories.includes("content")) {
          const payload = parsedArchive.payloads.content;
          if (!payload) {
            throw new Error("Content payload is missing from the archive.");
          }

          await tx.delete(contentTranslation);
          await tx.delete(contentItem);

          if (payload.items.length > 0) {
            await tx.insert(contentItem).values(
              payload.items.map((item) => ({
                id: item.id,
                createdAt: new Date(item.createdAt),
                publishedAt: item.publishedAt,
                authorId: mapRestoredUserId(effectiveUserId, item.authorId) ?? item.authorId,
                hideTOC: item.hideTOC ?? true,
              })),
            );
          }

          if (payload.translations.length > 0) {
            await tx.insert(contentTranslation).values(
              payload.translations.map((translation) => ({
                contentId: translation.contentId,
                title: translation.title,
                lang: translation.lang,
                updatedAt: toDate(translation.updatedAt),
                content: translation.content,
                status: translation.status,
              })),
            );
          }
        }

        if (restoredCategories.includes("documents")) {
          const payload = parsedArchive.payloads.documents;
          if (!payload) {
            throw new Error("Documents payload is missing from the archive.");
          }

          await tx.delete(documentVersion);
          await tx.delete(document);

          if (payload.documents.length > 0) {
            await tx.insert(document).values(
              payload.documents.map((item) => ({
                id: item.id,
                contentId: item.contentId,
                createdAt: new Date(item.createdAt),
                hideTOC: item.hideTOC ?? true,
              })),
            );
          }

          if (payload.versions.length > 0) {
            await tx.insert(documentVersion).values(
              payload.versions.map((version) => ({
                documentId: version.documentId,
                versionNumber: version.versionNumber,
                status: version.status,
                locale: version.locale,
                title: version.title,
                content: version.content,
                authorId: mapRestoredUserId(effectiveUserId, version.authorId),
                createdAt: new Date(version.createdAt),
                updatedAt: new Date(version.updatedAt),
                publishedAt: version.publishedAt ? new Date(version.publishedAt) : null,
              })),
            );
          }
        }

        if (restoredCategories.includes("news")) {
          const payload = parsedArchive.payloads.news;
          if (!payload) {
            throw new Error("News payload is missing from the archive.");
          }

          await tx.delete(newsItemTag);
          await tx.delete(newsTranslation);
          await tx.delete(newsItem);
          await tx.delete(newsTag);

          if (payload.tags.length > 0) {
            await tx.insert(newsTag).values(payload.tags);
          }

          if (payload.items.length > 0) {
            await tx.insert(newsItem).values(
              payload.items.map((item) => ({
                id: item.id,
                createdAt: new Date(item.createdAt),
                publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
                authorId: mapRestoredUserId(effectiveUserId, item.authorId) ?? item.authorId,
              })),
            );
          }

          if (payload.translations.length > 0) {
            await tx.insert(newsTranslation).values(
              payload.translations.map((translation) => ({
                newsId: translation.newsId,
                title: translation.title,
                lang: translation.lang,
                updatedAt: toDate(translation.updatedAt),
                content: translation.content,
              })),
            );
          }

          if (payload.itemTags.length > 0) {
            await tx.insert(newsItemTag).values(payload.itemTags);
          }
        }

        if (restoredCategories.includes("alerts")) {
          const payload = parsedArchive.payloads.alerts;
          if (!payload) {
            throw new Error("Alerts payload is missing from the archive.");
          }

          await tx.delete(alertTranslation);
          await tx.delete(alert);

          if (payload.items.length > 0) {
            await tx.insert(alert).values(
              payload.items.map((item) => ({
                id: item.id,
                createdAt: new Date(item.createdAt),
                updatedAt: new Date(item.updatedAt),
                enabled: item.enabled ?? true,
                authorId: mapRestoredUserId(effectiveUserId, item.authorId) ?? item.authorId,
                updatedBy: mapRestoredUserId(effectiveUserId, item.updatedBy) ?? item.updatedBy,
                from: item.from,
                to: item.to,
              })),
            );
          }

          if (payload.translations.length > 0) {
            await tx.insert(alertTranslation).values(payload.translations);
          }
        }

        if (restoredCategories.includes("header-footer")) {
          const payload = parsedArchive.payloads["header-footer"];
          if (!payload) {
            throw new Error("Header & Footer payload is missing from the archive.");
          }

          await tx.delete(siteNavigationConfigRevision);
          await tx.delete(siteNavigationConfig);

          if (payload.activeConfig) {
            await tx.insert(siteNavigationConfig).values({
              id: payload.activeConfig.id,
              config: payload.activeConfig.config,
              revision: 1,
              updatedAt: new Date(),
              updatedBy: effectiveUserId,
            });

            await tx.insert(siteNavigationConfigRevision).values({
              configId: payload.activeConfig.id,
              config: payload.activeConfig.config,
              revision: 1,
              createdBy: effectiveUserId,
            });
          }
        }

        if (restoredCategories.includes("flowcharts")) {
          const payload = parsedArchive.payloads.flowcharts;
          if (!payload) {
            throw new Error("Flowcharts payload is missing from the archive.");
          }

          await tx.delete(navigationFlowchartRevision);
          await tx.delete(navigationFlowchart);

          if (payload.flowcharts.length > 0) {
            await tx.insert(navigationFlowchart).values(
              payload.flowcharts.map((item) => ({
                id: item.id,
                isEntryPoint: item.isEntryPoint,
                nameEn: item.nameEn,
                nameJa: item.nameJa,
                config: item.config,
                status: item.status,
                revision: 1,
                updatedAt: new Date(),
                updatedBy: effectiveUserId,
              })),
            );

            await tx.insert(navigationFlowchartRevision).values(
              payload.flowcharts.map((item) => ({
                flowchartId: item.id,
                config: item.config,
                revision: 1,
                createdBy: effectiveUserId,
              })),
            );
          }
        }

        if (restoredCategories.includes("assets")) {
          if (!stagedAssetDirectory) {
            throw new Error("Asset staging directory is missing.");
          }

          await replaceAssetDirectory(getAssetDir(), stagedAssetDirectory);
          stagedAssetDirectory = null;
        }
      });

      return {
        archiveName: params.fileName,
        restoredCategories,
        counts: Object.fromEntries(
          restoredCategories.map((category) => [
            category,
            parsedArchive.manifest.counts[category] ?? 0,
          ]),
        ) as Partial<Record<CmsDataTransferCategory, number>>,
      };
    } finally {
      if (stagedAssetDirectory) {
        await rm(stagedAssetDirectory, { recursive: true, force: true });
      }
    }
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
          "categories/content.json": JSON.stringify({ items, translations }, null, 2),
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
          "categories/documents.json": JSON.stringify({ documents, versions }, null, 2),
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
          "categories/news.json": JSON.stringify({ items, translations, tags, itemTags }, null, 2),
        },
        count: items.length + translations.length + tags.length + itemTags.length,
      };
    }

    case "alerts": {
      const [items, translations] = await Promise.all([
        database.select().from(alert),
        database.select().from(alertTranslation),
      ]);

      return {
        files: {
          "categories/alerts.json": JSON.stringify({ items, translations }, null, 2),
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
          "categories/header-footer.json": JSON.stringify({ activeConfig }, null, 2),
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
  return async function createCmsDataTransferArchive(params: CreateCmsDataTransferArchiveParams) {
    const normalizedCategories = CMS_DATA_TRANSFER_CATEGORIES.filter((category) =>
      params.categories.includes(category),
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

const restoreCmsDataTransferArchive = createCmsDataTransferArchiveRestorer({
  database: db,
});

export const $$createCmsDataTransferArchive = createServerOnlyFn(
  async (params: CreateCmsDataTransferArchiveParams) => createCmsDataTransferArchive(params),
);

export const $$restoreCmsDataTransferArchive = createServerOnlyFn(
  async (params: RestoreCmsDataTransferArchiveParams) => restoreCmsDataTransferArchive(params),
);
