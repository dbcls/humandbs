import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const alert = pgTable("alert", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  activatedAt: timestamp("activated_at"), // when the alert was set to active
  deactivatedAt: timestamp("deactivated_at"), // when the alert was set to inactive
});

export const alertRelations = relations(alert, ({ many, one }) => ({
  translations: many(alertTranslation),
  author: one(user, {
    fields: [alert.authorId],
    references: [user.id],
  }),
}));

export const alertTranslation = pgTable(
  "alert_translation",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.alertId, table.locale] })]
);

export const alertTranslationRelations = relations(
  alertTranslation,
  ({ one }) => ({
    alert: one(alert, {
      fields: [alertTranslation.alertId],
      references: [alert.id],
    }),
  })
);

export type Alert = typeof alert.$inferSelect;
export type AlertTranslation = typeof alertTranslation.$inferSelect;
