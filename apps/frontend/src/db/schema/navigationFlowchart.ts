import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { NavigationFlowchartConfig } from "@/config/navigation-flowchart";

import { user } from "./auth-schema";

export const NAVIGATION_FLOWCHART_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type NavigationFlowchartStatus =
  (typeof NAVIGATION_FLOWCHART_STATUS)[keyof typeof NAVIGATION_FLOWCHART_STATUS];

export const navigationFlowchart = pgTable("navigation_flowchart", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameJa: text("name_ja").notNull(),
  config: jsonb("config").$type<NavigationFlowchartConfig>().notNull(),
  isEntryPoint: boolean("is_entry_point").notNull().default(false),
  status: text("status")
    .$type<NavigationFlowchartStatus>()
    .notNull()
    .default(NAVIGATION_FLOWCHART_STATUS.DRAFT),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id),
});

export const navigationFlowchartRevision = pgTable(
  "navigation_flowchart_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowchartId: uuid("flowchart_id")
      .notNull()
      .references(() => navigationFlowchart.id, { onDelete: "cascade" }),
    config: jsonb("config").$type<NavigationFlowchartConfig>().notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id),
  },
);

export const navigationFlowchartRelations = relations(
  navigationFlowchart,
  ({ many, one }) => ({
    revisions: many(navigationFlowchartRevision),
    updater: one(user, {
      fields: [navigationFlowchart.updatedBy],
      references: [user.id],
    }),
  }),
);

export const navigationFlowchartRevisionRelations = relations(
  navigationFlowchartRevision,
  ({ one }) => ({
    flowchart: one(navigationFlowchart, {
      fields: [navigationFlowchartRevision.flowchartId],
      references: [navigationFlowchart.id],
    }),
    creator: one(user, {
      fields: [navigationFlowchartRevision.createdBy],
      references: [user.id],
    }),
  }),
);
