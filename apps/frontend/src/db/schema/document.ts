import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const document = pgTable("document", {
  contentId: text("name").primaryKey(), // id for i18n to translate
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Document = typeof document.$inferSelect;
