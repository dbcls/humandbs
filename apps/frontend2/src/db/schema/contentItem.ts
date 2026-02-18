import { relations } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { documentVersionStatus } from "./documentVersion";

export const contentItem = pgTable("content_item", {
  id: text("id").notNull().primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: text("published_at"),
  authorId: text("author_id").notNull(),
});

export const contentItemRelations = relations(contentItem, ({ many, one }) => ({
  translations: many(contentTranslation),
  author: one(user, {
    fields: [contentItem.authorId],
    references: [user.id],
  }),
}));

export const contentTranslation = pgTable(
  "content_translation",
  {
    contentId: text("content_id")
      .notNull()
      .references(() => contentItem.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lang: text("locale").notNull(),
    updatedAt: timestamp("updated_at"),
    content: text("content").notNull(),
    status: documentVersionStatus("status").notNull().default("draft"),
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.lang, table.status] }),
  ]
);

export const contentTranslationRelations = relations(
  contentTranslation,
  ({ one }) => ({
    contentItem: one(contentItem, {
      fields: [contentTranslation.contentId],
      references: [contentItem.id],
    }),
  })
);
