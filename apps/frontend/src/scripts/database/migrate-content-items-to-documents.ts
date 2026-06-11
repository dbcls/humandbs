import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

import { buildDatabaseUrl } from "./utils";

// Content item IDs that are guideline historical versions or revision changelogs —
// handled by dedicated seed scripts and must not be migrated as standalone documents.
const EXCLUDED_CONTENT_IDS = new Set([
  // Guideline version archives (seed-guideline-versions.ts)
  "data-sharing-guidelines-v1",
  "data-sharing-guidelines-v2",
  "data-sharing-guidelines-v3",
  "data-sharing-guidelines-v3-1",
  "data-sharing-guidelines-v4",
  "data-sharing-guidelines-v5",
  "data-sharing-guidelines-v6",
  "data-sharing-guidelines-v7",
  "data-sharing-guidelines-v8",
  "security-guidelines-for-dbcenters-v1",
  "security-guidelines-for-dbcenters-v2",
  "security-guidelines-for-dbcenters-v3",
  "security-guidelines-for-dbcenters-v3-2",
  "security-guidelines-for-dbcenters-v4",
  "security-guidelines-for-submitters-v1",
  "security-guidelines-for-submitters-v2",
  "security-guidelines-for-submitters-v3",
  "security-guidelines-for-users-v1",
  "security-guidelines-for-users-v2",
  "security-guidelines-for-users-v3",
  "security-guidelines-for-users-v4",
  "security-guidelines-for-users-v5",
  "security-guidelines-for-users-v6",
  "security-guidelines-for-users-v7",

  // Guideline revision changelogs
  "guideline-revision",
  "guideline-revision-2",
  "guideline-revision-3",
  "guideline-revision2",
  "guideline-revision3",
  "guideline-revision4",
  "guideline-revision5",
  "guideline-revision6",
  "guideline-revision7",
]);

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type MigrateResult = {
  migrated: number;
  skipped: number;
  skippedIds: string[];
};

export async function migrateContentItemsToDocuments(
  overwrite = false,
  injectedDb?: Db,
): Promise<MigrateResult> {
  console.log("Starting content item → document migration...");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool: any;
  let db: Db;

  if (injectedDb) {
    db = injectedDb;
  } else {
    pool = new Pool({ connectionString: buildDatabaseUrl() });
    db = drizzle(pool, { schema });
  }

  let migrated = 0;
  let skipped = 0;
  const skippedIds: string[] = [];

  try {
    const allItems = await db.select().from(schema.contentItem).execute();

    console.log(`Found ${allItems.length} content item(s)`);

    for (const item of allItems) {
      if (EXCLUDED_CONTENT_IDS.has(item.id)) {
        console.log(`  Skipping (excluded): ${item.id}`);
        skipped++;
        skippedIds.push(item.id);
        continue;
      }

      const [existingDoc] = await db
        .select({ id: schema.document.id })
        .from(schema.document)
        .where(eq(schema.document.contentId, item.id))
        .limit(1)
        .execute();

      let docId: string;

      if (existingDoc) {
        if (!overwrite) {
          console.log(`  Skipping (document already exists): ${item.id}`);
          skipped++;
          skippedIds.push(item.id);
          continue;
        }
        docId = existingDoc.id;
        await db
          .update(schema.document)
          .set({ hideTOC: item.hideTOC ?? true, hideFromNav: true })
          .where(eq(schema.document.id, docId))
          .execute();
        console.log(`  Updated document: ${item.id}`);
      } else {
        const [inserted] = await db
          .insert(schema.document)
          .values({
            contentId: item.id,
            hideTOC: item.hideTOC ?? true,
            hideFromNav: true,
          })
          .returning({ id: schema.document.id })
          .execute();
        docId = inserted.id;
        console.log(`  Created document: ${item.id}`);
      }

      const translations = await db
        .select()
        .from(schema.contentTranslation)
        .where(eq(schema.contentTranslation.contentId, item.id))
        .execute();

      for (const translation of translations) {
        const createdAt = item.publishedAt ? new Date(item.publishedAt) : undefined;
        const updatedAt = translation.updatedAt ?? createdAt;
        const publishedAt = translation.status === "published" ? createdAt : undefined;

        const values = {
          documentId: docId,
          versionNumber: 1,
          locale: translation.lang as "en" | "ja",
          status: translation.status,
          title: translation.title,
          content: translation.content,
          authorId: item.authorId,
          ...(createdAt && { createdAt }),
          ...(updatedAt && { updatedAt }),
          ...(publishedAt && { publishedAt }),
        };

        if (overwrite) {
          await db
            .insert(schema.documentVersion)
            .values(values)
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
                authorId: values.authorId,
                updatedAt: updatedAt ?? new Date(),
              },
            })
            .execute();
        } else {
          await db
            .insert(schema.documentVersion)
            .values(values)
            .onConflictDoNothing()
            .execute();
        }

        console.log(`  [${translation.lang}] ${item.id} → document v1`);
      }

      migrated++;
    }

    console.log(`\nMigration complete!`);
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped}`);
  } finally {
    await pool?.end();
  }

  return { migrated, skipped, skippedIds };
}

if (import.meta.main) {
  const overwrite = process.argv.includes("--overwrite");
  migrateContentItemsToDocuments(overwrite)
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
