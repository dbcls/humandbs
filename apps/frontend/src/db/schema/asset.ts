import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documentVersion } from "./documentVersion";
import { relations } from "drizzle-orm";

export const asset = pgTable("asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  mimeType: text("mime_type").notNull(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => documentVersion.id),
});

export const assetRelations = relations(asset, ({ one }) => ({
  documentVersion: one(documentVersion),
}));
