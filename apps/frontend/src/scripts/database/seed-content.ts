import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { DB } from "@/db/database";
import * as schema from "@/db/schema";

import type { MiscPageContent, MiscPagesOutput } from "../../../../backend/joomla/lib/types";
import { buildDatabaseUrl } from "./utils";

const MISC_JSON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/joomla/output/misc-pages.json",
);

async function ensureSystemUser(db: DB): Promise<string> {
  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, "system"))
    .limit(1)
    .execute();

  if (existing) return existing.id;

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

async function resolveAuthorId(db: DB): Promise<string> {
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

function groupByPath(pages: MiscPageContent[]): Map<string, MiscPageContent[]> {
  const grouped = new Map<string, MiscPageContent[]>();
  for (const page of pages) {
    if (!grouped.has(page.path)) grouped.set(page.path, []);
    grouped.get(page.path)!.push(page);
  }
  return grouped;
}

export async function seedContent(
  pages: MiscPageContent[],
  overwrite = false,
  db?: DB,
): Promise<{ created: number; skipped: number }> {
  const pool = db ? null : new Pool({ connectionString: buildDatabaseUrl() });
  const resolvedDb = db ?? drizzle(pool!, { schema });

  try {
    const authorId = await resolveAuthorId(resolvedDb);
    const grouped = groupByPath(pages);

    let created = 0;
    let skipped = 0;

    for (const [contentId, translations] of grouped) {
      const canonical = translations[0]!;

      const [existing] = await resolvedDb
        .select({ id: schema.contentItem.id })
        .from(schema.contentItem)
        .where(eq(schema.contentItem.id, contentId))
        .limit(1)
        .execute();

      if (existing) {
        if (!overwrite) {
          skipped++;
          continue;
        }
      } else {
        await resolvedDb
          .insert(schema.contentItem)
          .values({
            id: contentId,
            authorId,
            publishedAt: canonical.releaseDate,
          })
          .execute();

        created++;
      }

      for (const page of translations) {
        const translationValues = {
          contentId,
          lang: page.lang,
          title: page.title,
          content: page.contentHtml,
          updatedAt: page.modifiedDate ? new Date(page.modifiedDate) : null,
          status: "published" as const,
        };

        if (overwrite) {
          await resolvedDb
            .insert(schema.contentTranslation)
            .values(translationValues)
            .onConflictDoUpdate({
              target: [
                schema.contentTranslation.contentId,
                schema.contentTranslation.lang,
                schema.contentTranslation.status,
              ],
              set: {
                title: translationValues.title,
                content: translationValues.content,
                updatedAt: translationValues.updatedAt,
              },
            })
            .execute();
        } else {
          await resolvedDb
            .insert(schema.contentTranslation)
            .values(translationValues)
            .onConflictDoNothing()
            .execute();
        }
      }

      console.log(`  [${translations.map((t) => t.lang).join("/")}] ${contentId}`);
    }

    return { created, skipped };
  } finally {
    await pool?.end();
  }
}

async function run(overwrite = false) {
  console.log("Checking for misc-pages.json...");

  try {
    await access(MISC_JSON_PATH);
  } catch {
    console.error(`Error: misc-pages.json not found at:\n  ${MISC_JSON_PATH}`);
    console.error("Run the Joomla crawler first to generate the output file.");
    process.exit(1);
  }

  console.log(`Found: ${MISC_JSON_PATH}`);

  const { default: raw } = (await import(MISC_JSON_PATH, {
    with: { type: "json" },
  })) as { default: MiscPagesOutput };

  console.log(`Loaded ${raw.pages.length} pages (generated at ${raw.generatedAt})`);

  const { created, skipped } = await seedContent(raw.pages, overwrite);

  console.log(`\nSeeding complete!`);
  console.log(`  Created: ${created} content item(s)`);
  console.log(`  Skipped: ${skipped} (already exist; use --overwrite to replace)`);
}

if (import.meta.main) {
  const overwrite = process.argv.includes("--overwrite");
  run(overwrite)
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
