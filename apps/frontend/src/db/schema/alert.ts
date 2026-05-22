import { relations, sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { Locale } from "@/config/i18n";

import { user } from "./auth-schema";

export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  enabled: boolean().$default(() => true),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  from: text("from"),
  to: text("to"),
});

export const alertTranslation = pgTable(
  "alert_translation",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    locale: text("locale").notNull().$type<Locale>(),
  },
  (table) => [unique("alert_translation_unique").on(table.alertId, table.locale)],
);

export const alertRelations = relations(alert, ({ many, one }) => ({
  trnanslations: many(alertTranslation),
  author: one(user, {
    references: [user.id],
    fields: [alert.authorId],
  }),
  updatedByUser: one(user, {
    references: [user.id],
    fields: [alert.updatedBy],
    relationName: "alert_updated_by_user",
  }),
}));

export const alertTranslationRelations = relations(alertTranslation, ({ one }) => ({
  alert: one(alert, {
    fields: [alertTranslation.alertId],
    references: [alert.id],
  }),
}));
