import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDefaultSiteNavigationConfig } from "@/config/site-navigation";
import * as schema from "@/db/schema";
import { buildDatabaseUrl } from "./utils";

const NAV_CONFIG_ID = "global";

async function seedNavigation() {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });
  const config = getDefaultSiteNavigationConfig();

  try {
    console.log("Resetting site navigation config...");

    await db.transaction(async (tx) => {
      await tx.delete(schema.siteNavigationConfigRevision).execute();
      await tx.delete(schema.siteNavigationConfig).execute();

      const [created] = await tx
        .insert(schema.siteNavigationConfig)
        .values({
          id: NAV_CONFIG_ID,
          config,
          revision: 1,
        })
        .returning();

      await tx.insert(schema.siteNavigationConfigRevision).values({
        configId: created.id,
        config,
        revision: created.revision,
        createdBy: null,
      });
    });

    console.log(`Site navigation config seeded as "${NAV_CONFIG_ID}".`);
  } finally {
    await pool.end();
  }
}

seedNavigation().catch((error) => {
  console.error("Failed to seed site navigation config.");
  console.error(error);
  process.exit(1);
});
