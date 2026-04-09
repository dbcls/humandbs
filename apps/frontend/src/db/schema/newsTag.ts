import { relations } from "drizzle-orm";
import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { newsItem } from "./newsItem";

export const newsTag = pgTable("news_tag", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color"),
});

export const newsTagRelations = relations(newsTag, ({ many }) => ({
  newsItems: many(newsItemTag),
}));

export const newsItemTag = pgTable(
  "news_item_tag",
  {
    newsId: uuid("news_id")
      .notNull()
      .references(() => newsItem.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => newsTag.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.newsId, table.tagId] })],
);

export const newsItemTagRelations = relations(newsItemTag, ({ one }) => ({
  newsItem: one(newsItem, {
    fields: [newsItemTag.newsId],
    references: [newsItem.id],
  }),
  tag: one(newsTag, {
    fields: [newsItemTag.tagId],
    references: [newsTag.id],
  }),
}));
