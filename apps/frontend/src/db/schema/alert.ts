import type { Locale } from "@/config/i18n";
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const alertTranslation = pgTable(
  "alert_translation",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    locale: text("locale").notNull().$type<Locale>(),
    from: text("from"),
    to: text("to"),
  },
  (table) => [
    unique("alert_translation_unique").on(table.alertId, table.locale),
  ],
);

export const alertRelations = relations(alert, ({ many }) => ({
  trnanslations: many(alertTranslation),
}));

export const alertTranslationRelations = relations(
  alertTranslation,
  ({ one }) => ({
    alert: one(alert, {
      fields: [alertTranslation.alertId],
      references: [alert.id],
    }),
  }),
);
