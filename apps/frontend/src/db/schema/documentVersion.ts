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

export const documentVersionTranslations = pgTable(
  "document_version_translations",
  {
    title: text("name").notNull(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    content: text("content").notNull(),
    translatedBy: text("translated_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.documentVersionId, table.locale] })]
);
