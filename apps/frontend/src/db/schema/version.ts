import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { document } from "./document";

export const version = pgTable(
  "version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("name").notNull(),
    versionNumber: integer("version").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    content: text("content").notNull(),
    author: text("author_id")
      .notNull()
      .references(() => user.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
  },
  (table) => [
    uniqueIndex().on(
      table.documentId,
      table.versionNumber
    ),
  ]
);
