import { relations } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import { newsItem } from "./newsItem";

export const alert = pgTable("alert", {
  newsId: uuid("news_id")
    .notNull()
    .references(() => newsItem.id, { onDelete: "cascade" })
    .unique("alert_news_id_key"),
  from: text("from"),
  to: text("to"),
});

export const alertRelations = relations(alert, ({ one }) => ({
  newsItem: one(newsItem, {
    fields: [alert.newsId],
    references: [newsItem.id],
  }),
}));
