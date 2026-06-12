import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { Locale } from "@/config/i18n";

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
    documentId: uuid("document_id")
      .references(() => document.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    status: documentVersionStatus("status").notNull().default("draft"),
    locale: text("locale").notNull().$type<Locale>(),
    title: text("name"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    authorId: text("author_id").references(() => user.id),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => user.id),
    publishedAt: timestamp("published_at"),
    publishedBy: text("publisher_id").references(() => user.id),
  },
  (table) => [
    primaryKey({
      columns: [table.documentId, table.versionNumber, table.locale, table.status],
    }),
  ],
);

export type DocumentVersion = typeof documentVersion.$inferSelect;

export const documentVersionRelations = relations(documentVersion, ({ one }) => ({
  document: one(document, {
    fields: [documentVersion.documentId],
    references: [document.id],
  }),
  author: one(user, {
    fields: [documentVersion.authorId],
    references: [user.id],
  }),
  publisher: one(user, {
    fields: [documentVersion.publishedBy],
    references: [user.id],
  }),
  updater: one(user, {
    fields: [documentVersion.updatedBy],
    references: [user.id],
  }),
}));
