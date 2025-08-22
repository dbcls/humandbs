import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { newsItem } from "./newsItem";
import { relations } from "drizzle-orm";

export const alert = pgTable("alert", {
  newsId: uuid("news_id")
    .notNull()
    .references(() => newsItem.id, { onDelete: "cascade" })
    .unique("alert_news_id_key"),
  from: timestamp("from"),
  to: timestamp("to"),
});

export const alertRelations = relations(alert, ({ one }) => ({
  newsItem: one(newsItem, {
    fields: [alert.newsId],
    references: [newsItem.id],
  }),
}));

export type Alert = typeof alert.$inferSelect;
