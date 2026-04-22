import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import type { NewsPagesOutput } from "../../../../backend/joomla/lib/types";
import { buildDatabaseUrl } from "./utils";

const NEWS_JSON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../backend/joomla/output/news-pages.json",
);

async function ensureSystemUser(
  db: ReturnType<typeof drizzle<typeof schema>>,
): Promise<string> {
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

async function resolveAuthorId(
  db: ReturnType<typeof drizzle<typeof schema>>,
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

async function seedNews(overwrite = false) {
  console.log("Checking for news-pages.json...");

  try {
    await access(NEWS_JSON_PATH);
  } catch {
    console.error(`Error: news-pages.json not found at:\n  ${NEWS_JSON_PATH}`);
    console.error("Run the Joomla crawler first to generate the output file.");
    process.exit(1);
  }

  console.log(`Found: ${NEWS_JSON_PATH}`);

  const { default: raw } = (await import(NEWS_JSON_PATH, {
    with: { type: "json" },
  })) as { default: NewsPagesOutput };

  console.log(
    `Loaded ${raw.pages.length} pages (generated at ${raw.generatedAt})`,
  );

  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    console.log("\nResolving author...");
    const authorId = await resolveAuthorId(db);
    console.log(`Using author ID: ${authorId}`);

    console.log(`\nSeeding ${raw.pages.length} news pages...`);

    let created = 0;

    for (const page of raw.pages) {
      const [inserted] = await db
        .insert(schema.newsItem)
        .values({
          authorId,
          publishedAt: page.publishedAt,
        })
        .returning({ id: schema.newsItem.id })
        .execute();

      await db
        .insert(schema.newsTranslation)
        .values({
          newsId: inserted.id,
          lang: page.lang,
          title: page.title,
          content: page.contentHtml,
          updatedAt: page.modifiedDate ? new Date(page.modifiedDate) : null,
        })
        .execute();

      created++;
      console.log(`  [${page.lang}] "${page.title.slice(0, 60)}"`);
    }

    console.log(`\nSeeding complete!`);
    console.log(`  Created: ${created} news item(s)`);
  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  const overwrite = process.argv.includes("--overwrite");
  seedNews(overwrite)
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
