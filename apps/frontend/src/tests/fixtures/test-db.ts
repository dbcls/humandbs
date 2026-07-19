import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

const ALL_TABLES = [
  "navigation_flowchart_revision",
  "navigation_flowchart",
  "moldata_key_catalog_entry",
  "moldata_key_catalog",
  "site_navigation_config_revision",
  "site_navigation_config",
  "alert_translation",
  "alert",
  "news_item_tag",
  "news_tag",
  "news_translation",
  "news_item",
  "document_version",
  "document",
  "content_translation",
  "content_item",
  '"user"',
] as const;

export function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  let isSetup = false;

  return {
    db,
    async setup() {
      if (isSetup) {
        return;
      }

      const { apply } = await pushSchema(schema, db as unknown as Parameters<typeof pushSchema>[1]);
      await apply();
      isSetup = true;
    },
    async clearTables(tables: readonly string[] = ALL_TABLES) {
      await clearTables(db, tables);
    },
    async close() {
      await client.close();
    },
  };
}

export async function clearTables(
  db: ReturnType<typeof drizzle<typeof schema>>,
  tables: readonly string[] = ALL_TABLES,
): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
}
