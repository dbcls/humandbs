import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { newsItem } from "./newsItem";
import { relations } from "drizzle-orm";

export const alert = pgTable("alert", {
  newsId: uuid("news_id")
    .notNull()
    .references(() => newsItem.id)
    .unique("alert_news_id_key"),
  from: timestamp("from").notNull(),
  to: timestamp("to").notNull(),
});

export const alertRelations = relations(alert, ({ one }) => ({
  newsItem: one(newsItem, {
    fields: [alert.newsId],
    references: [newsItem.id],
  }),
}));

export type Alert = typeof alert.$inferSelect;
