import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { createMoldataKeyCatalogRepository } from "@/repositories/moldataKeyCatalog";

import { buildDatabaseUrl } from "./utils";

async function seedMoldataKeyCatalog() {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    const result = await createMoldataKeyCatalogRepository(db).initializeDefaults();
    console.log(
      result.created
        ? `Seeded ${result.catalog.entries.length} default moldata keys.`
        : "Moldata key catalog already has entries; left unchanged.",
    );
  } finally {
    await pool.end();
  }
}

seedMoldataKeyCatalog().catch((error) => {
  console.error("Failed to seed moldata key catalog.");
  console.error(error);
  process.exit(1);
});
