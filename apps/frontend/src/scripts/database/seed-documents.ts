import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import * as schema from "@/db/schema";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";

import { buildDatabaseUrl } from "./utils";

const DOCUMENTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "seed-data",
  "documents",
);

const SUPPORTED_LOCALES = i18n.locales;

type DocumentLocaleMap = Map<string, Map<Locale, { content: string; dir: string }>>;

function extractTitle(content: string): {
  title: string | null;
  content: string;
} {
  let workingContent = content;
  let title: string | null = null;

  // Check for YAML frontmatter (starts with ---)
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n?/.exec(workingContent);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    // Extract title from frontmatter
    const titleMatch = /^title:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    // Remove frontmatter from content
    workingContent = workingContent.slice(frontmatterMatch[0].length).trimStart();
  }

  // If no frontmatter title, try to extract from first # heading
  if (!title) {
    const headingMatch = /^#\s+(.+)$/m.exec(workingContent);
    if (headingMatch) {
      title = headingMatch[1].trim();
      // Remove the title line and any immediately following blank lines
      workingContent = workingContent.replace(/^#\s+.+\n*/, "").trimStart();
    }
  }

  return { title, content: workingContent };
}

async function ensureSystemUser(db: ReturnType<typeof drizzle<typeof schema>>): Promise<string> {
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

async function resolveAuthorId(db: ReturnType<typeof drizzle<typeof schema>>): Promise<string> {
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

  const [anyUser] = await db.select({ id: schema.user.id }).from(schema.user).limit(1).execute();

  if (anyUser) return anyUser.id;

  return ensureSystemUser(db);
}

async function collectDocumentPaths(
  dir: string,
  prefix: string,
  documents: DocumentLocaleMap,
  locale: Locale,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as { code?: unknown })?.code === "ENOENT") {
      console.warn(`Missing folder: ${dir}`);
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const segmentId = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = path.join(dir, entry.name);
    const contentPath = path.join(entryPath, "content.md");

    let content: string | undefined;
    try {
      content = await readFile(contentPath, "utf8");
    } catch (error: unknown) {
      if ((error as { code?: unknown })?.code !== "ENOENT") throw error;
      // No content.md here — treat as namespace folder and recurse
    }

    if (content !== undefined) {
      if (!documents.has(segmentId)) documents.set(segmentId, new Map());
      documents.get(segmentId)!.set(locale, { content, dir: entryPath });
      console.log(`Loaded ${locale} content for document: ${segmentId}`);
    }

    // Always recurse to find nested documents
    await collectDocumentPaths(entryPath, segmentId, documents, locale);
  }
}

async function loadDocuments(): Promise<DocumentLocaleMap> {
  const documents: DocumentLocaleMap = new Map();

  for (const locale of SUPPORTED_LOCALES) {
    const localeDir = path.join(DOCUMENTS_DIR, locale);
    console.log(`Reading locale folder: ${localeDir}`);
    await collectDocumentPaths(localeDir, "", documents, locale);
  }

  return documents;
}

async function seedDocuments(overwrite = false) {
  console.log("Starting document seed...");

  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    console.log("Loading documents from disk...");
    const documents = await loadDocuments();
    console.log(`Found ${documents.size} document(s) to seed`);

    if (documents.size === 0) {
      console.log("No documents to seed.");
      return;
    }

    console.log("\nResolving author...");
    const authorId = await resolveAuthorId(db);
    console.log(`Using author ID: ${authorId}`);

    console.log("\nSeeding documents...");
    let createdCount = 0;

    for (const [documentId, localeMap] of documents) {
      // Ensure document record exists
      const [existingDocument] = await db
        .select({ contentId: schema.document.contentId })
        .from(schema.document)
        .where(eq(schema.document.contentId, documentId))
        .limit(1)
        .execute();

      let docUuid: string;
      if (!existingDocument) {
        const [inserted] = await db
          .insert(schema.document)
          .values({ contentId: documentId })
          .returning({ id: schema.document.id })
          .execute();
        docUuid = inserted.id;
        console.log(`Created document: ${documentId}`);
      } else {
        const [found] = await db
          .select({ id: schema.document.id })
          .from(schema.document)
          .where(eq(schema.document.contentId, documentId))
          .limit(1)
          .execute();
        docUuid = found.id;
      }

      // Find the latest version number for this document
      const existingVersions = await db
        .select({ versionNumber: schema.documentVersion.versionNumber })
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.documentId, docUuid))
        .execute();

      const maxVersion =
        existingVersions.length > 0 ? Math.max(...existingVersions.map((v) => v.versionNumber)) : 0;

      const versionNumber = maxVersion === 0 ? 1 : maxVersion;

      // Process each locale
      for (const [locale, { content }] of localeMap) {
        // Extract title from content
        const { title, content: contentWithoutTitle } = extractTitle(content);

        const values = {
          documentId: docUuid,
          versionNumber,
          locale,
          status: DOCUMENT_VERSION_STATUS.PUBLISHED,
          title: title ?? documentId,
          content: contentWithoutTitle,
          translatedBy: authorId,
        };

        const query = db.insert(schema.documentVersion).values(values);

        if (overwrite) {
          await query
            .onConflictDoUpdate({
              target: [
                schema.documentVersion.documentId,
                schema.documentVersion.versionNumber,
                schema.documentVersion.locale,
                schema.documentVersion.status,
              ],
              set: {
                title: values.title,
                content: values.content,
                translatedBy: values.translatedBy,
                updatedAt: new Date(),
              },
            })
            .execute();
        } else {
          await query.onConflictDoNothing().execute();
        }

        console.log(`Seeded ${locale}/${documentId} v${versionNumber}`);
        createdCount++;
      }
    }

    console.log(`\nSeeding complete!`);
    console.log(`  Upserted: ${createdCount} version(s)`);
  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  const overwrite = process.argv.includes("--overwrite");
  seedDocuments(overwrite)
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
