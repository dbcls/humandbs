import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const asset = pgTable("asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  mimeType: text("mime_type").notNull(),
});
