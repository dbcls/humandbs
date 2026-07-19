import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** The singleton row that owns the catalog-wide optimistic-lock revision. */
export const moldataKeyCatalog = pgTable("moldata_key_catalog", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
});

/**
 * View-layer labels for raw experiment keys. These identifiers are never
 * persisted into backend dataset payloads.
 */
export const moldataKeyCatalogEntry = pgTable(
  "moldata_key_catalog_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    english: text("english").notNull(),
    japanese: text("japanese").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("moldata_key_catalog_entry_position_idx").on(table.position),
    uniqueIndex("moldata_key_catalog_entry_english_lower_unique").on(sql`lower(${table.english})`),
  ],
);
