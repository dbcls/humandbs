import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const newsItem = pgTable("news_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
});

export const newsTranslation = pgTable(
  "news_translations",
  {
    newsId: uuid("news_id")
      .notNull()
      .references(() => newsItem.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lang: text("locale").notNull(),

    content: text("content").notNull(),
  },
  (table) => [primaryKey({ columns: [table.newsId, table.lang] })]
);
