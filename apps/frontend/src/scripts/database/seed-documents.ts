import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { CONTENT_IDS } from "@/config/content-config";
import * as schema from "@/db/schema";

/** Absolute path to the documents seed folder. */
const DOCUMENTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "seed-data",
  "documents"
);
/** Absolute path to the public assets folder. */
const PUBLIC_ASSETS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "public",
  "assets"
);
/** Locales expected under the documents seed folder. */
const SUPPORTED_LOCALES = ["en", "ja"] as const;

/** Valid document IDs from content configuration */
const VALID_DOCUMENT_IDS = new Set(Object.values(CONTENT_IDS).flat());

type DocumentLocaleMap = Map<
  string,
  Record<string, { content: string; dir: string }>
>;

/** Builds a Postgres connection string from environment variables. */
function buildDatabaseUrl() {
  const {
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
  } = process.env;

  if (
    !POSTGRES_USER ||
    !POSTGRES_PASSWORD ||
    !POSTGRES_HOST ||
    !POSTGRES_PORT ||
    !POSTGRES_DB
  ) {
    throw new Error("Missing required Postgres environment variables.");
  }

  return `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
}

/** Extracts image references from markdown. */
function extractImageFilenames(content: string) {
  const results = new Set<string>();
  const pattern = /!\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    const cleaned = raw.split(/\s+/)[0]?.replace(/^<|>$/g, "");
    if (
      !cleaned ||
      cleaned.startsWith("http://") ||
      cleaned.startsWith("https://")
    ) {
      continue;
    }

    results.add(path.basename(cleaned));
  }

  return Array.from(results);
}

/** Extracts file references from markdown links. */
function extractFileFilenames(content: string) {
  const results = new Set<string>();
  const pattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const raw = match[2]?.trim();
    if (!raw) continue;

    const cleaned = raw.split(/\s+/)[0]?.replace(/^<|>$/g, "");
    if (
      !cleaned ||
      cleaned.startsWith("http://") ||
      cleaned.startsWith("https://") ||
      cleaned.startsWith("/") ||
      cleaned.startsWith("#")
    ) {
      continue;
    }

    // Check if it's a downloadable file by extension
    const ext = path.extname(cleaned).toLowerCase();
    const downloadableExts = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".zip",
      ".tar",
      ".gz",
      ".rar",
      ".7z",
      ".txt",
      ".csv",
      ".json",
      ".xml",
    ];

    if (downloadableExts.includes(ext)) {
      results.add(path.basename(cleaned));
    }
  }

  return Array.from(results);
}

/** Rewrites relative image URLs to public assets paths. */
function rewriteImageReferences(content: string, fileNames: Iterable<string>) {
  const names = new Set(fileNames);
  if (names.size === 0) return content;

  const pattern = /!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;

  return content.replace(pattern, (full, alt, url, rest) => {
    if (typeof url !== "string") return full;
    const trimmed = url.trim().replace(/^<|>$/g, "");
    if (
      trimmed.startsWith("/") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      return full;
    }

    const fileName = path.basename(trimmed);
    if (!names.has(fileName)) return full;

    return `![${alt}](/assets/${fileName}${rest ?? ""})`;
  });
}

/** Rewrites relative file URLs to public assets paths. */
function rewriteFileReferences(content: string, fileNames: Iterable<string>) {
  const names = new Set(fileNames);
  if (names.size === 0) return content;

  const pattern = /\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;

  return content.replace(pattern, (full, text, url, rest) => {
    if (typeof url !== "string") return full;
    const trimmed = url.trim().replace(/^<|>$/g, "");
    if (
      trimmed.startsWith("/") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("#")
    ) {
      return full;
    }

    const fileName = path.basename(trimmed);
    if (!names.has(fileName)) return full;

    return `[${text}](/assets/${fileName}${rest ?? ""})`;
  });
}

/** Determines a mime type based on file extension. */
function getMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".zip":
      return "application/zip";
    case ".tar":
      return "application/x-tar";
    case ".gz":
      return "application/gzip";
    case ".rar":
      return "application/vnd.rar";
    case ".7z":
      return "application/x-7z-compressed";
    case ".txt":
      return "text/plain";
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".xml":
      return "application/xml";
    default:
      return "application/octet-stream";
  }
}

/** Ensures a system user exists for seeding and returns its id. */
async function ensureSystemUser(
  db: ReturnType<typeof drizzle>,
  id: string,
  name: string,
  email: string
) {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, id))
    .limit(1)
    .execute();

  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.user)
    .values({
      id,
      name,
      email,
      emailVerified: true,
      role: "editor",
    })
    .returning({ id: schema.user.id })
    .execute();

  return created.id;
}

/** Resolves the author to attribute seeded versions to. */
async function resolveAuthorId(db: ReturnType<typeof drizzle>) {
  if (process.env.SEED_AUTHOR_ID) {
    const seedId = process.env.SEED_AUTHOR_ID;
    const email = process.env.SEED_AUTHOR_EMAIL ?? `${seedId}@seed.local`;
    const name = process.env.SEED_AUTHOR_NAME ?? "System Seed";
    return ensureSystemUser(db, seedId, name, email);
  }

  const [admin] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"))
    .limit(1)
    .execute();

  if (admin) return admin.id;

  const [anyUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .limit(1)
    .execute();

  if (anyUser) return anyUser.id;

  return ensureSystemUser(
    db,
    "system-seed",
    "System Seed",
    "system-seed@seed.local"
  );
}

/** Loads markdown content grouped by document id and locale. */
async function loadDocuments(): Promise<DocumentLocaleMap> {
  const documents = new Map<
    string,
    Record<string, { content: string; dir: string }>
  >();

  for (const locale of SUPPORTED_LOCALES) {
    const localeDir = path.join(DOCUMENTS_DIR, locale);
    let entries;

    try {
      console.log(`Reading locale folder: ${localeDir}`);
      entries = await readdir(localeDir, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        console.warn(`Missing locale folder: ${localeDir}`);
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const documentId = entry.name;

      // Validate document ID against CONTENT_IDS
      if (!VALID_DOCUMENT_IDS.has(documentId)) {
        console.warn(
          `Skipping document '${documentId}' - not found in CONTENT_IDS configuration`
        );
        continue;
      }

      const contentPath = path.join(localeDir, documentId, "content.md");

      let content: string;
      try {
        content = await readFile(contentPath, "utf8");
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          console.warn(`Missing content file: ${contentPath}`);
          continue;
        }
        throw error;
      }

      const existing = documents.get(documentId) ?? {};
      existing[locale] = { content, dir: path.join(localeDir, documentId) };
      documents.set(documentId, existing);
      console.log(`Loaded ${locale} content for document: ${documentId}`);
    }
  }

  return documents;
}

/** Seeds documents, versions, and translations from local markdown files. */
async function seedDocuments() {
  console.log("Starting CMS document seed...");
  const db = drizzle(new Pool({ connectionString: buildDatabaseUrl() }), {
    schema,
  });

  const authorId = await resolveAuthorId(db);
  console.log(`Using author id: ${authorId}`);
  const documents = await loadDocuments();
  const processedAssets = new Set<string>();
  let assetsDirReady = false;

  if (documents.size === 0) {
    console.log("No documents found to seed.");
    return;
  }

  console.log(`Total documents discovered: ${documents.size}`);

  const existingDocuments = await db
    .select({ contentId: schema.document.contentId })
    .from(schema.document)
    .execute();
  const existingIds = new Set(existingDocuments.map((doc) => doc.contentId));
  console.log(`Existing documents in DB: ${existingIds.size}`);

  let createdCount = 0;
  let skippedCount = 0;

  await db.transaction(async (tx) => {
    for (const [documentId, locales] of documents) {
      const hasDocument = existingIds.has(documentId);
      if (!hasDocument) {
        console.log(`Creating document: ${documentId}`);
        await tx
          .insert(schema.document)
          .values({ contentId: documentId })
          .execute();
      }

      const existingTranslations = await tx
        .select({
          locale: schema.documentVersionTranslation.locale,
        })
        .from(schema.documentVersionTranslation)
        .innerJoin(
          schema.documentVersion,
          eq(
            schema.documentVersionTranslation.documentVersionId,
            schema.documentVersion.id
          )
        )
        .where(eq(schema.documentVersion.contentId, documentId))
        .execute();

      if (existingTranslations.length > 0) {
        console.log(
          `Skipping document with existing translations: ${documentId}`
        );
        skippedCount += 1;
        continue;
      }

      const localeEntries = Object.entries(locales);
      if (localeEntries.length === 0) {
        console.log(`Skipping document with no locale content: ${documentId}`);
        skippedCount += 1;
        continue;
      }

      const [publishedVersion] = await tx
        .select({
          id: schema.documentVersion.id,
          versionNumber: schema.documentVersion.versionNumber,
        })
        .from(schema.documentVersion)
        .where(
          and(
            eq(schema.documentVersion.contentId, documentId),
            eq(
              schema.documentVersion.status,
              schema.DOCUMENT_VERSION_STATUS.PUBLISHED
            )
          )
        )
        .orderBy(desc(schema.documentVersion.versionNumber))
        .limit(1)
        .execute();

      let versionId = publishedVersion?.id;

      if (!versionId) {
        const [maxVersion] = await tx
          .select({
            maxVersion: sql<number>`max(${schema.documentVersion.versionNumber})`,
          })
          .from(schema.documentVersion)
          .where(eq(schema.documentVersion.contentId, documentId))
          .execute();

        const nextVersionNumber = maxVersion?.maxVersion
          ? maxVersion.maxVersion
          : 1;

        const [version] = await tx
          .insert(schema.documentVersion)
          .values({
            versionNumber: nextVersionNumber,
            authorId,
            contentId: documentId,
            status: schema.DOCUMENT_VERSION_STATUS.PUBLISHED,
            publishedAt: new Date(),
          })
          .returning({ id: schema.documentVersion.id })
          .execute();

        versionId = version.id;
        console.log(`Created published version for: ${documentId}`);
      }

      const contentByLocale = new Map<string, string>();

      for (const [locale, data] of localeEntries) {
        const images = extractImageFilenames(data.content);
        const files = extractFileFilenames(data.content);
        const allAssets = [...images, ...files];
        if (allAssets.length === 0) continue;

        if (!assetsDirReady) {
          await mkdir(PUBLIC_ASSETS_DIR, { recursive: true });
          assetsDirReady = true;
        }

        const availableAssets = new Set<string>();

        for (const fileName of allAssets) {
          if (processedAssets.has(fileName)) {
            availableAssets.add(fileName);
            continue;
          }
          const sourcePath = path.join(data.dir, fileName);
          try {
            await stat(sourcePath);
          } catch (error: any) {
            if (error?.code === "ENOENT") {
              console.warn(`Missing asset file: ${sourcePath}`);
              continue;
            }
            throw error;
          }

          availableAssets.add(fileName);
          const [existingAsset] = await tx
            .select({ id: schema.asset.id })
            .from(schema.asset)
            .where(eq(schema.asset.name, fileName))
            .limit(1)
            .execute();

          if (existingAsset) {
            processedAssets.add(fileName);
            continue;
          }

          const destinationPath = path.join(PUBLIC_ASSETS_DIR, fileName);
          await copyFile(sourcePath, destinationPath);

          await tx
            .insert(schema.asset)
            .values({
              name: fileName,
              url: `/assets/${fileName}`,
              description: `Seeded asset ${fileName}`,
              mimeType: getMimeType(fileName),
            })
            .execute();

          processedAssets.add(fileName);
          console.log(`Seeded asset: ${fileName}`);
        }

        if (availableAssets.size > 0) {
          const availableImages = new Set(
            Array.from(availableAssets).filter((name) => images.includes(name))
          );
          const availableFiles = new Set(
            Array.from(availableAssets).filter((name) => files.includes(name))
          );

          let updatedContent = data.content;

          if (availableImages.size > 0) {
            updatedContent = rewriteImageReferences(
              updatedContent,
              availableImages
            );
          }

          if (availableFiles.size > 0) {
            updatedContent = rewriteFileReferences(
              updatedContent,
              availableFiles
            );
          }

          if (updatedContent !== data.content) {
            console.log(`Rewrote asset URLs for: ${documentId} (${locale})`);
          }
          contentByLocale.set(locale, updatedContent);
        }
      }

      const translations = localeEntries.map(([locale, data]) => ({
        documentVersionId: versionId,
        locale,
        content: contentByLocale.get(locale) ?? data.content,
        translatedBy: authorId,
      }));

      console.log(
        `Creating ${translations.length} translation(s) for: ${documentId}`
      );
      await tx
        .insert(schema.documentVersionTranslation)
        .values(translations)
        .execute();

      createdCount += 1;
    }
  });

  console.log(
    `Seeding complete. Created: ${createdCount}, skipped existing: ${skippedCount}.`
  );
}

if (import.meta.main) {
  seedDocuments().catch((error) => {
    console.error("Failed to seed documents:", error);
    process.exit(1);
  });
}
