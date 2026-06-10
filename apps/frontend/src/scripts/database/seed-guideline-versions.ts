import path from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";

import type { MiscPageContent, MiscPagesOutput } from "../../../../backend/joomla/lib/types";
import { buildDatabaseUrl } from "./utils";

const MISC_JSON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/joomla/output/misc-pages.json",
);

// Hardcoded mapping of dirty content item slugs to (parentDocumentContentId, versionNumber).
// Version numbers are derived from slug suffixes, with overrides for dirty data:
//   - data-sharing-guidelines-v3-1 -> v4 (patch release, treated as next version)
//   - data-sharing-guidelines-v4 through v8 shift up by 1 accordingly
//   - security-guidelines-for-dbcenters-v3-2 (EN) pairs with v4 (JA) — both are Ver. 4.0 content
const SLUG_TO_VERSION: Record<string, { documentContentId: string; versionNumber: number }> = {
  "data-sharing-guidelines-v1": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 1 },
  "data-sharing-guidelines-v2": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 2 },
  "data-sharing-guidelines-v3": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 3 },
  "data-sharing-guidelines-v3-1": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 4 },
  "data-sharing-guidelines-v4": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 5 },
  "data-sharing-guidelines-v5": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 6 },
  "data-sharing-guidelines-v6": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 7 },
  "data-sharing-guidelines-v7": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 8 },
  "data-sharing-guidelines-v8": { documentContentId: "guidelines/data-sharing-guidelines", versionNumber: 9 },

  "security-guidelines-for-dbcenters-v1": { documentContentId: "guidelines/security-guidelines-for-dbcenters", versionNumber: 1 },
  "security-guidelines-for-dbcenters-v2": { documentContentId: "guidelines/security-guidelines-for-dbcenters", versionNumber: 2 },
  "security-guidelines-for-dbcenters-v3": { documentContentId: "guidelines/security-guidelines-for-dbcenters", versionNumber: 3 },
  "security-guidelines-for-dbcenters-v3-2": { documentContentId: "guidelines/security-guidelines-for-dbcenters", versionNumber: 4 },
  "security-guidelines-for-dbcenters-v4": { documentContentId: "guidelines/security-guidelines-for-dbcenters", versionNumber: 4 },

  "security-guidelines-for-submitters-v1": { documentContentId: "guidelines/security-guidelines-for-submitters", versionNumber: 1 },
  "security-guidelines-for-submitters-v2": { documentContentId: "guidelines/security-guidelines-for-submitters", versionNumber: 2 },
  "security-guidelines-for-submitters-v3": { documentContentId: "guidelines/security-guidelines-for-submitters", versionNumber: 3 },

  "security-guidelines-for-users-v1": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 1 },
  "security-guidelines-for-users-v2": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 2 },
  "security-guidelines-for-users-v3": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 3 },
  "security-guidelines-for-users-v4": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 4 },
  "security-guidelines-for-users-v5": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 5 },
  "security-guidelines-for-users-v6": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 6 },
  "security-guidelines-for-users-v7": { documentContentId: "guidelines/security-guidelines-for-users", versionNumber: 7 },
};

// Max historical version number per document — used to compute the offset for pre-existing versions.
const MAX_HISTORICAL_VERSION: Record<string, number> = {
  "guidelines/data-sharing-guidelines": 9,
  "guidelines/security-guidelines-for-dbcenters": 4,
  "guidelines/security-guidelines-for-submitters": 3,
  "guidelines/security-guidelines-for-users": 7,
};

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function ensureSystemUser(db: Db): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, "system"))
    .limit(1)
    .execute();

  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.user)
    .values({ id: "system", name: "System", email: "system@seed.local", role: "admin" })
    .returning({ id: schema.user.id })
    .execute();

  return created.id;
}

async function resolveAuthorId(db: Db): Promise<string> {
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
      .values({ id: `seed-${Date.now()}`, name, email, role: "admin" })
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

export async function seedGuidelineVersions(
  overwrite = false,
  injectedDb?: Db,
  injectedPages?: MiscPageContent[],
) {
  console.log("Starting guideline version seed...");

  let pool: Pool | undefined;
  let db: Db;

  if (injectedDb) {
    db = injectedDb;
  } else {
    pool = new Pool({ connectionString: buildDatabaseUrl() });
    db = drizzle(pool, { schema });
  }

  let pages: MiscPageContent[];
  if (injectedPages) {
    pages = injectedPages;
  } else {
    const { default: raw } = (await import(MISC_JSON_PATH, {
      with: { type: "json" },
    })) as { default: MiscPagesOutput };
    pages = raw.pages;
  }

  console.log(`Loaded ${pages.length} pages`);

  // Group relevant pages by slug
  const bySlug = new Map<string, MiscPageContent[]>();
  for (const page of pages) {
    if (!(page.path in SLUG_TO_VERSION)) continue;
    if (!bySlug.has(page.path)) bySlug.set(page.path, []);
    bySlug.get(page.path)!.push(page);
  }

  console.log(`Found ${bySlug.size} relevant slugs`);

  try {
    const authorId = await resolveAuthorId(db);
    console.log(`Using author ID: ${authorId}`);

    // Collect unique parent document contentIds referenced by the pages being processed
    const parentContentIds = new Set(
      [...bySlug.keys()].map((slug) => SLUG_TO_VERSION[slug]!.documentContentId),
    );

    // Build a content fingerprint for each document: the contentHtml of the first historical page.
    // Used to detect whether historical versions have already been seeded (idempotency check).
    const fingerprintByContentId = new Map<string, string>();
    for (const [slug, pages] of bySlug) {
      const { documentContentId } = SLUG_TO_VERSION[slug]!;
      if (!fingerprintByContentId.has(documentContentId) && pages.length > 0) {
        fingerprintByContentId.set(documentContentId, pages[0]!.contentHtml);
      }
    }

    // For each parent document: resolve its UUID, then renumber existing versions if needed
    const docUuidByContentId = new Map<string, string>();
    const versionOffsets = new Map<string, number>(); // contentId -> offset to add to historical versionNumber
    const skipInsert = new Set<string>(); // contentIds whose historical versions are already seeded

    for (const contentId of parentContentIds) {
      const [existing] = await db
        .select({ id: schema.document.id })
        .from(schema.document)
        .where(eq(schema.document.contentId, contentId))
        .limit(1)
        .execute();

      if (!existing) {
        console.error(`Document not found: ${contentId}. Run db:seed-documents first.`);
        process.exit(1);
      }

      docUuidByContentId.set(contentId, existing.id);
      const historicalMax = MAX_HISTORICAL_VERSION[contentId]!;

      // Check if historical versions are already seeded by looking for the fingerprint content.
      const fingerprint = fingerprintByContentId.get(contentId);
      const [alreadySeeded] = fingerprint
        ? await db
            .select({ versionNumber: schema.documentVersion.versionNumber })
            .from(schema.documentVersion)
            .where(
              and(
                eq(schema.documentVersion.documentId, existing.id),
                eq(schema.documentVersion.content, fingerprint),
              ),
            )
            .limit(1)
            .execute()
        : [undefined];

      if (alreadySeeded && !overwrite) {
        skipInsert.add(contentId);
        console.log(`  ${contentId}: already seeded (found fingerprint at v${alreadySeeded.versionNumber}), skipping`);
        continue;
      }

      // Check whether any versions exist at all
      const existingVersions = await db
        .select({
          documentId: schema.documentVersion.documentId,
          versionNumber: schema.documentVersion.versionNumber,
          locale: schema.documentVersion.locale,
          status: schema.documentVersion.status,
        })
        .from(schema.documentVersion)
        .where(eq(schema.documentVersion.documentId, existing.id))
        .orderBy(schema.documentVersion.versionNumber)
        .execute();

      if (existingVersions.length === 0) {
        versionOffsets.set(contentId, 0);
        console.log(`  ${contentId}: no existing versions, inserting historical v1–v${historicalMax}`);
      } else if (alreadySeeded && overwrite) {
        // Already seeded — overwrite in place without renumbering
        versionOffsets.set(contentId, 0);
        console.log(`  ${contentId}: already seeded, overwriting in place`);
      } else {
        // Renumber pre-existing versions upward to make room for historical ones.
        const offset = historicalMax;
        versionOffsets.set(contentId, 0);
        console.log(
          `  ${contentId}: renumbering ${existingVersions.length} existing version(s) +${offset}`,
        );

        // Update from highest to lowest to avoid composite PK collisions
        for (const v of [...existingVersions].reverse()) {
          await db
            .update(schema.documentVersion)
            .set({ versionNumber: v.versionNumber + offset })
            .where(
              and(
                eq(schema.documentVersion.documentId, v.documentId),
                eq(schema.documentVersion.versionNumber, v.versionNumber),
                eq(schema.documentVersion.locale, v.locale),
                eq(schema.documentVersion.status, v.status),
              ),
            )
            .execute();
        }
      }
    }

    // Insert historical versions
    let inserted = 0;
    let skipped = 0;

    for (const [slug, pages] of bySlug) {
      const { documentContentId, versionNumber } = SLUG_TO_VERSION[slug]!;
      if (skipInsert.has(documentContentId)) continue;
      const docUuid = docUuidByContentId.get(documentContentId)!;
      const offset = versionOffsets.get(documentContentId) ?? 0;
      const finalVersionNumber = versionNumber + offset;

      for (const page of pages) {
        const createdAt = page.releaseDate ? new Date(page.releaseDate) : undefined;
        const updatedAt = page.modifiedDate ? new Date(page.modifiedDate) : createdAt;
        const values = {
          documentId: docUuid,
          versionNumber: finalVersionNumber,
          locale: page.lang,
          status: DOCUMENT_VERSION_STATUS.PUBLISHED,
          title: page.title,
          content: page.contentHtml,
          translatedBy: authorId,
          ...(createdAt && { createdAt }),
          ...(updatedAt && { updatedAt }),
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
                createdAt: createdAt ?? new Date(),
                updatedAt: updatedAt ?? new Date(),
              },
            })
            .execute();
          inserted++;
        } else {
          const result = await query.onConflictDoNothing().execute();
          if ((result.rowCount ?? 0) > 0) {
            inserted++;
          } else {
            skipped++;
          }
        }

        console.log(
          `  [${page.lang}] ${documentContentId} v${finalVersionNumber} (from ${slug})`,
        );
      }
    }

    console.log(`\nSeeding complete!`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Skipped:  ${skipped} (already exist; use --overwrite to replace)`);
  } finally {
    await pool?.end();
  }
}

if (import.meta.main) {
  const overwrite = process.argv.includes("--overwrite");
  seedGuidelineVersions(overwrite)
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
