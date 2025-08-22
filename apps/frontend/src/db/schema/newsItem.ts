import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";
import { alert } from "./alert";

export const newsItem = pgTable("news_item", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
});

export const newsItemRelations = relations(newsItem, ({ many, one }) => ({
  translations: many(newsTranslation),
  author: one(user, {
    fields: [newsItem.authorId],
    references: [user.id],
  }),
  alert: one(alert, {
    fields: [newsItem.id],
    references: [alert.newsId],
  }),
}));

export const newsTranslation = pgTable(
  "news_translation",
  {
    newsId: uuid("news_id")
      .notNull()
      .references(() => newsItem.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lang: text("locale").notNull(),
    updatedAt: timestamp("updated_at"),
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
