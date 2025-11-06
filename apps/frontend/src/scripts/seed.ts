import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { CONTENT_IDS } from "@/config/content-config";

async function main() {
  const db = drizzle(
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
    {
      schema,
    }
  );

  const seedName = "initial_documents_seed";

  const existingSeed = await db
    .select()
    .from(schema.seedHistory)
    .where(sql`seed_name = ${seedName}`)
    .execute();

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

      await tx.insert(schema.seedHistory).values({ seedName }).execute();
    });
  } catch (error) {
    console.error("Error during seeding:", error);
  }

  console.log("Seed data inserted successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
