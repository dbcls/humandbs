import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    id: uuid("id").primaryKey().defaultRandom(),
    versionNumber: integer("version_number").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    contentId: text("content_id")
      .notNull()
      .references(() => document.contentId, { onDelete: "cascade" }),
    status: documentVersionStatus("status").notNull().default("draft"),
    lastDraftSavedAt: timestamp("last_draft_saved_at"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Each version number can have at most one draft and one published version
    uniqueIndex().on(table.contentId, table.versionNumber, table.status),
  ]
);

export type DocumentVersion = typeof documentVersion.$inferSelect;

export const documentVersionTranslation = pgTable(
  "document_version_translation",
  {
    title: text("name"),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersion.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    content: text("content"),
    translatedBy: text("translated_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.documentVersionId, table.locale] })]
);

export type DocumentVersionTranslation =
  typeof documentVersionTranslation.$inferSelect;

export const documentVersionRelations = relations(
  documentVersion,
  ({ many, one }) => ({
    translations: many(documentVersionTranslation),
    author: one(user, {
      fields: [documentVersion.authorId],
      references: [user.id],
    }),
  })
);

export const documentVersionTranslationsRelations = relations(
  documentVersionTranslation,
  ({ one }) => ({
    version: one(documentVersion, {
      fields: [documentVersionTranslation.documentVersionId],
      references: [documentVersion.id],
    }),
    translator: one(user, {
      fields: [documentVersionTranslation.translatedBy],
      references: [user.id],
    }),
  })
);
