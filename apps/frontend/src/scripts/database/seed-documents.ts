import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { CONTENT_IDS } from "@/config/content-config";
import { i18n, Locale } from "@/config/i18n-config";
import * as schema from "@/db/schema";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";

const DOCUMENTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "seed-data",
  "documents"
);

const PUBLIC_ASSETS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "public",
  "assets"
);

const SUPPORTED_LOCALES = i18n.locales;

const VALID_DOCUMENT_IDS = new Set(Object.values(CONTENT_IDS).flat());

type DocumentLocaleMap = Map<
  string,
  Map<Locale, { content: string; dir: string }>
>;

function buildDatabaseUrl(): string {
  const {
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    DATABASE_URL,
  } = process.env;

  if (DATABASE_URL) {
    return DATABASE_URL;
  }

  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      "Missing required database environment variables. " +
        "Set either DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB"
    );
  }

  const host = POSTGRES_HOST || "localhost";
  const port = POSTGRES_PORT || "5432";

  return `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${host}:${port}/${POSTGRES_DB}`;
}

function extractImageFilenames(content: string): string[] {
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

function extractFileFilenames(content: string): string[] {
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

function rewriteImageReferences(
  content: string,
  availableAssets: Set<string>
): string {
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
    if (!availableAssets.has(fileName)) return full;

    return `![${alt}](/assets/${fileName}${rest ?? ""})`;
  });
}

function rewriteFileReferences(
  content: string,
  availableAssets: Set<string>
): string {
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

    // Skip images
    if (/\.(png|jpe?g|gif|svg|webp)$/i.test(trimmed)) {
      return full;
    }

    const fileName = path.basename(trimmed);
    if (!availableAssets.has(fileName)) return full;

    return `[${text}](/assets/${fileName}${rest ?? ""})`;
  });
}

/**
 * Extracts the title from markdown content.
 * First checks for YAML frontmatter title, then falls back to first # heading.
 * Returns both the title and the content with frontmatter/title heading removed.
 */
function extractTitle(content: string): {
  title: string | null;
  content: string;
} {
  let workingContent = content;
  let title: string | null = null;

  // Check for YAML frontmatter (starts with ---)
  const frontmatterMatch = workingContent.match(/^---\n([\s\S]*?)\n---\n?/);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    // Extract title from frontmatter
    const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    // Remove frontmatter from content
    workingContent = workingContent
      .slice(frontmatterMatch[0].length)
      .trimStart();
  }

  // If no frontmatter title, try to extract from first # heading
  if (!title) {
    const headingMatch = workingContent.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
      // Remove the title line and any immediately following blank lines
      workingContent = workingContent.replace(/^#\s+.+\n*/, "").trimStart();
    }
  }

  return { title, content: workingContent };
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function ensureSystemUser(
  db: ReturnType<typeof drizzle<typeof schema>>
): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, "system"))
    .limit(1)
    .execute();

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(schema.user)
    .values({
      id: "system",
      name: "System",
      email: "system@seed.local",
      role: "admin",
    })
    .returning({ id: schema.user.id })
    .execute();

  return created.id;
}

async function resolveAuthorId(
  db: ReturnType<typeof drizzle<typeof schema>>
): Promise<string> {
  const seedId = process.env.SEED_AUTHOR_ID;
  const email = process.env.SEED_AUTHOR_EMAIL;
  const name = process.env.SEED_AUTHOR_NAME || "Seed User";

  if (seedId) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, seedId))
      .limit(1)
      .execute();

    if (existing) return existing.id;
  }

  if (email) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1)
      .execute();

    if (existing) return existing.id;

    const [created] = await db
      .insert(schema.user)
      .values({
        id: `seed-${Date.now()}`,
        name,
        email,
        role: "admin",
      })
      .returning({ id: schema.user.id })
      .execute();

    return created.id;
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

  return ensureSystemUser(db);
}

async function loadDocuments(): Promise<DocumentLocaleMap> {
  const documents: DocumentLocaleMap = new Map();

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

      if (!documents.has(documentId)) {
        documents.set(documentId, new Map());
      }

      documents.get(documentId)!.set(locale, {
        content,
        dir: path.join(localeDir, documentId),
      });

      console.log(`Loaded ${locale} content for document: ${documentId}`);
    }
  }

  return documents;
}

async function copyAssets(documents: DocumentLocaleMap): Promise<Set<string>> {
  const copiedAssets = new Set<string>();
  let assetsDirReady = false;

  for (const [documentId, localeMap] of documents) {
    for (const [locale, { content, dir }] of localeMap) {
      const images = extractImageFilenames(content);
      const files = extractFileFilenames(content);
      const allReferencedAssets = [...new Set([...images, ...files])];

      for (const assetName of allReferencedAssets) {
        if (copiedAssets.has(assetName)) continue;

        const sourcePath = path.join(dir, assetName);

        try {
          await stat(sourcePath);
        } catch (error: any) {
          if (error?.code === "ENOENT") {
            console.warn(
              `Asset not found: ${sourcePath} (referenced in ${locale}/${documentId})`
            );
            continue;
          }
          throw error;
        }

        if (!assetsDirReady) {
          await mkdir(PUBLIC_ASSETS_DIR, { recursive: true });
          assetsDirReady = true;
          console.log(`Created assets directory: ${PUBLIC_ASSETS_DIR}`);
        }

        const destPath = path.join(PUBLIC_ASSETS_DIR, assetName);
        await copyFile(sourcePath, destPath);
        copiedAssets.add(assetName);
        console.log(`Copied asset: ${assetName}`);
      }
    }
  }

  return copiedAssets;
}

async function seedAssets(
  db: ReturnType<typeof drizzle<typeof schema>>,
  copiedAssets: Set<string>,
  documents: DocumentLocaleMap
): Promise<void> {
  for (const assetName of copiedAssets) {
    const [existingAsset] = await db
      .select({ id: schema.asset.id })
      .from(schema.asset)
      .where(eq(schema.asset.name, assetName))
      .limit(1)
      .execute();

    if (!existingAsset) {
      let docId = "unknown";
      outer: for (const [documentId, localeMap] of documents) {
        for (const [, { content }] of localeMap) {
          if (content.includes(assetName)) {
            docId = documentId;
            break outer;
          }
        }
      }

      await db
        .insert(schema.asset)
        .values({
          name: assetName,
          url: `/assets/${assetName}`,
          description: `Seeded asset for ${docId}`,
          mimeType: getMimeType(assetName),
        })
        .execute();

      console.log(`Created asset record: ${assetName}`);
    }
  }
}

async function seedDocuments() {
  console.log("Starting document seed...");

  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    console.log("Loading documents from disk...");
    const documents = await loadDocuments();
    console.log(`Found ${documents.size} document(s) to seed`);

    if (documents.size === 0) {
      console.log("No documents to seed. Exiting.");
      return;
    }

    console.log("\nCopying assets...");
    const copiedAssets = await copyAssets(documents);
    console.log(`Copied ${copiedAssets.size} asset(s)`);

    console.log("\nSeeding asset records...");
    await seedAssets(db, copiedAssets, documents);

    console.log("\nResolving author...");
    const authorId = await resolveAuthorId(db);
    console.log(`Using author ID: ${authorId}`);

    console.log("\nSeeding documents...");
    let createdCount = 0;
    let skippedCount = 0;

    for (const [documentId, localeMap] of documents) {
      // Ensure document record exists
      const [existingDocument] = await db
        .select({ contentId: schema.document.contentId })
        .from(schema.document)
        .where(eq(schema.document.contentId, documentId))
        .limit(1)
        .execute();

      if (!existingDocument) {
        await db
          .insert(schema.document)
          .values({ contentId: documentId })
          .execute();
        console.log(`Created document: ${documentId}`);
      }

      // Find the latest version number for this document
      const existingVersions = await db
        .select({ versionNumber: schema.documentVersion.versionNumber })
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.contentId, documentId))
        .execute();

      const maxVersion =
        existingVersions.length > 0
          ? Math.max(...existingVersions.map((v) => v.versionNumber))
          : 0;

      const versionNumber = maxVersion === 0 ? 1 : maxVersion;

      // Process each locale
      for (const [locale, { content }] of localeMap) {
        // Check if this version already exists (published)
        const [existingPublished] = await db
          .select({ contentId: schema.documentVersion.contentId })
          .from(schema.documentVersion)
          .where(
            and(
              eq(schema.documentVersion.contentId, documentId),
              eq(schema.documentVersion.versionNumber, versionNumber),
              eq(schema.documentVersion.locale, locale),
              eq(
                schema.documentVersion.status,
                DOCUMENT_VERSION_STATUS.PUBLISHED
              )
            )
          )
          .limit(1)
          .execute();

        if (existingPublished) {
          console.log(
            `Skipping ${locale}/${documentId} v${versionNumber} (already published)`
          );
          skippedCount++;
          continue;
        }

        // Extract title from content
        const { title, content: contentWithoutTitle } = extractTitle(content);

        // Rewrite asset references
        let processedContent = rewriteImageReferences(
          contentWithoutTitle,
          copiedAssets
        );
        processedContent = rewriteFileReferences(
          processedContent,
          copiedAssets
        );

        // Insert as published version
        await db
          .insert(schema.documentVersion)
          .values({
            contentId: documentId,
            versionNumber,
            locale,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
            title: title ?? documentId,
            content: processedContent,
            translatedBy: authorId,
          })
          .onConflictDoNothing()
          .execute();

        console.log(`Seeded ${locale}/${documentId} v${versionNumber}`);
        createdCount++;
      }
    }

    console.log(`\nSeeding complete!`);
    console.log(`  Created: ${createdCount} version(s)`);
    console.log(`  Skipped: ${skippedCount} version(s)`);
  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  seedDocuments()
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
