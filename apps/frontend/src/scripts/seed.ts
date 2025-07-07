import { drizzle } from "drizzle-orm/bun-sql";

import * as schema from "@/db/schema";
import { CONTENT_IDS } from "@/lib/content-config";

async function main() {
  const db = drizzle(
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
    {
      schema,
    }
  );

  const documentIds = Object.values(CONTENT_IDS).flat();

  await db
    .insert(schema.document)
    .values(documentIds.map((d) => ({ name: d })))
    .execute();

  console.log("Seed data inserted successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
