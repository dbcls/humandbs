import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { SiteNavigationConfig } from "@/config/site-navigation";

import { user } from "./auth-schema";

export const siteNavigationConfig = pgTable("site_navigation_config", {
  id: text("id").primaryKey(),
  config: jsonb("config")
    .$type<SiteNavigationConfig>()
    .notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id),
});

export const siteNavigationConfigRevision = pgTable(
  "site_navigation_config_revision",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    configId: text("config_id")
      .notNull()
      .references(() => siteNavigationConfig.id, { onDelete: "cascade" }),
    config: jsonb("config")
      .$type<SiteNavigationConfig>()
      .notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id),
  },
);

export const siteNavigationConfigRelations = relations(
  siteNavigationConfig,
  ({ many, one }) => ({
    revisions: many(siteNavigationConfigRevision),
    updater: one(user, {
      fields: [siteNavigationConfig.updatedBy],
      references: [user.id],
    }),
  }),
);

export const siteNavigationConfigRevisionRelations = relations(
  siteNavigationConfigRevision,
  ({ one }) => ({
    configEntry: one(siteNavigationConfig, {
      fields: [siteNavigationConfigRevision.configId],
      references: [siteNavigationConfig.id],
    }),
    creator: one(user, {
      fields: [siteNavigationConfigRevision.createdBy],
      references: [user.id],
    }),
  }),
);
