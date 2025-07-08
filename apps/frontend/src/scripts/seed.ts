import { drizzle } from "drizzle-orm/bun-sql";

import * as schema from "@/db/schema";
import { CONTENT_IDS } from "@/lib/content-config";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
    {
      schema,
    }
  );

  await db.execute(sql`CREATE TABLE IF NOT EXISTS seed_history (
        seed_name TEXT PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`);

  const seedName = "initial_documents_seed";

  const existingSeed = await db.execute(sql`
      SELECT seed_name FROM seed_history WHERE seed_name = ${seedName}
    `);

  if (existingSeed.length > 0) {
    console.log("Seed was already executed. Skipping...");
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const documentIds = Object.values(CONTENT_IDS).flat();

      await tx
        .insert(schema.document)
        .values(documentIds.map((d) => ({ contentId: d })))
        .execute();

      await tx.execute(sql`
       INSERT INTO seed_history (seed_name) VALUES (${seedName})
     `);
    });
  } catch (error) {
    console.error("Error during seeding:", error);
    throw error;
  }

  console.log("Seed data inserted successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
