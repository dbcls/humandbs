import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  hideTOC: boolean("hide_toc").default(true),
  hideRevisions: boolean("hide_revisions").default(true),
  hideFromNav: boolean("hide_from_nav").default(true),
});

export type Document = typeof document.$inferSelect;
