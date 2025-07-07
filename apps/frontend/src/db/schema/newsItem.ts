import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const newsItem = pgTable("news_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
