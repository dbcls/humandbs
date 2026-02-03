import { relations } from "drizzle-orm";
import {
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
    contentId: text("content_id")
      .notNull()
      .references(() => document.contentId, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Each version number can have at most one draft and one published version
    primaryKey({ columns: [table.contentId, table.versionNumber] }),
  ]
);

export type DocumentVersion = typeof documentVersion.$inferSelect;

export const documentVersionTranslation = pgTable(
  "document_version_translation",
  {
    contentId: text("content_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    status: documentVersionStatus("status").notNull().default("draft"),
    locale: text("locale").notNull(),
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
    foreignKey({
      columns: [table.contentId, table.versionNumber],
      foreignColumns: [
        documentVersion.contentId,
        documentVersion.versionNumber,
      ],
    }).onDelete("cascade"),
  ]
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
      fields: [
        documentVersionTranslation.contentId,
        documentVersionTranslation.versionNumber,
      ],
      references: [documentVersion.contentId, documentVersion.versionNumber],
    }),
    translator: one(user, {
      fields: [documentVersionTranslation.translatedBy],
      references: [user.id],
    }),
  })
);
