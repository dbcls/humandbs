import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import type { AlertContent, ArticleContent } from "~/content/types"

import { createdAt, primaryId, updatedAt } from "./common"

export const locale = pgEnum("locale", ["ja", "en"])

/**
 * A page of site content. **No versions and no pins** — the version machinery,
 * the ledger and fixes apply to research only, and site content is not part of
 * the public search either.
 *
 * Past revisions of a guideline are separate documents, not versions of one:
 * each is a self-contained text, and treating them as versions is what left the
 * English side of several of them as empty shells.
 *
 * `latestOfId` is how a version-less slug points at whichever revision is
 * current. An admin moves the pointer. It cannot be automatic: the slug without
 * a version is baked into submission metadata held elsewhere and must keep
 * answering forever.
 */
export const document = pgTable("document", {
  id: primaryId(),
  slug: text().notNull().unique(),
  latestOfId: uuid().references((): AnyPgColumn => document.id, { onDelete: "set null" }),
  position: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * One locale of a document, with its own published state and its own draft.
 * Splitting by locale is right here precisely because there is no version: the
 * rule that publication is per version rather than per language is a statement
 * about versions.
 */
export const documentContent = pgTable("document_content", {
  documentId: uuid().notNull().references(() => document.id, { onDelete: "cascade" }),
  locale: locale().notNull(),
  content: jsonb().$type<ArticleContent>().notNull(),
  published: boolean().notNull().default(false),
  publishedAt: date(),
  draftContent: jsonb().$type<ArticleContent>(),
  revision: integer().notNull().default(1),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.documentId, t.locale] }),
])

/**
 * A news item. Separate from documents because it is an announcement with a
 * date rather than a page with a slug. It gets a draft because the current
 * system has no way to hold an unpublished one.
 */
export const news = pgTable("news", {
  id: primaryId(),
  publishedAt: date(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index().on(t.publishedAt),
])

export const newsContent = pgTable("news_content", {
  newsId: uuid().notNull().references(() => news.id, { onDelete: "cascade" }),
  locale: locale().notNull(),
  content: jsonb().$type<ArticleContent>().notNull(),
  published: boolean().notNull().default(false),
  draftContent: jsonb().$type<ArticleContent>(),
  revision: integer().notNull().default(1),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.newsId, t.locale] }),
])

/**
 * The site-wide banner. On or off, with no schedule: the two banners the
 * current site carries both leave their window empty, and a window would make
 * "is this shown" a question with two answers to combine.
 *
 * Navigation is not here. It is a constant in `app/public/navigation.ts`,
 * because nothing edits it at runtime — the labels are hand-written short forms
 * rather than document titles, which makes them interface text.
 */
export const alert = pgTable("alert", {
  id: primaryId(),
  content: jsonb().$type<AlertContent>().notNull(),
  active: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
