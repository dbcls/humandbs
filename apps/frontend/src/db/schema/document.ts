import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const document = pgTable("document", {
  contentId: text("name").primaryKey(), // id for i18n to translate
  createdAt: timestamp("created_at").notNull().defaultNow(),
  hideTOC: boolean(),
});

export type Document = typeof document.$inferSelect;
