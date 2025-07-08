import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { document } from "./document";
import { relations } from "drizzle-orm";

export const documentVersion = pgTable(
  "document_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionNumber: integer("version_number").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex().on(table.documentId, table.versionNumber)]
);

export const documentVersionTranslation = pgTable(
  "document_version_translation",
  {
    title: text("name").notNull(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersion.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    content: text("content").notNull(),
    translatedBy: text("translated_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.documentVersionId, table.locale] })]
);

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
