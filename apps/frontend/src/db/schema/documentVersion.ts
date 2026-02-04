import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { Locale } from "@/config/i18n-config";

import { user } from "./auth-schema";
import { document } from "./document";

export const DOCUMENT_VERSION_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type DocVersionStatus =
  (typeof DOCUMENT_VERSION_STATUS)[keyof typeof DOCUMENT_VERSION_STATUS];

export const documentVersionStatus = pgEnum("document_version_status", [
  DOCUMENT_VERSION_STATUS.DRAFT,
  DOCUMENT_VERSION_STATUS.PUBLISHED,
]);

export const documentVersion = pgTable(
  "document_version",
  {
    contentId: text("content_id")
      .references(() => document.contentId, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    status: documentVersionStatus("status").notNull().default("draft"),
    locale: text("locale").notNull().$type<Locale>(),
    title: text("name"),
    content: text("content"),
    translatedBy: text("translated_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.contentId,
        table.versionNumber,
        table.locale,
        table.status,
      ],
    }),
  ]
);

export type DocumentVersion = typeof documentVersion.$inferSelect;

export const documentVersionRelations = relations(
  documentVersion,
  ({ one }) => ({
    document: one(document, {
      fields: [documentVersion.contentId],
      references: [document.contentId],
    }),
    author: one(user, {
      fields: [documentVersion.translatedBy],
      references: [user.id],
    }),
  })
);
