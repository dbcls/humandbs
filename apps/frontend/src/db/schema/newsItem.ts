import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";

export const newsItem = pgTable("news_item", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"), // nullable for drafts
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
});

export const newsItemRelations = relations(newsItem, ({ many, one }) => ({
  translations: many(newsTranslation),
}));

export const newsTranslation = pgTable(
  "news_translation",
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

export const newsTranslationRelations = relations(
  newsTranslation,
  ({ one }) => ({
    newsItem: one(newsItem, {
      fields: [newsTranslation.newsId],
      references: [newsItem.id],
    }),
  })
);

export type NewsItem = typeof newsItem.$inferSelect;
