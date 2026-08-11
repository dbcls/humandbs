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
} from "drizzle-orm/pg-core"

import type { AlertContent, ArticleContent } from "~/content/types"

import { createdAt, primaryId, updatedAt } from "./common"

export const locale = pgEnum("locale", ["ja", "en"])

/**
 * A page of site content. **No versions and no pins** — the version machinery,
 * the ledger and fixes apply to research only, and site content is not part of
 * the public search either.
 *
 * Each revision of a guideline is a document of its own, at the address it
 * already answers at (`{slug}/version/{n}`), including the current one. Each is
 * a self-contained text, and treating them as versions of one thing is what
 * left the English side of several of them as empty shells.
 */
export const document = pgTable("document", {
  id: primaryId(),
  slug: text().notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * One locale of a document, with its own published state and its own draft.
 * Splitting by locale is right here precisely because there is no version: the
 * rule that publication is per version rather than per language is a statement
 * about versions.
 *
 * The draft sits beside the published body rather than in a table of its own,
 * and publishing moves it across. None of the machinery a research draft needs
 * applies — there is no version to compare against and no second editor.
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
 * A version-less slug, and the revision it currently names.
 *
 * It holds no body of its own: a document either has a body or points at one,
 * so the current guideline exists once rather than as two copies that drift.
 * An admin moves the pointer; nothing does it on publish.
 *
 * `currentId` is NOT NULL and the row it names cannot be deleted, because this
 * slug is baked into submission metadata held elsewhere and has to keep
 * answering. What is left to run into is a target that is unpublished in one
 * language, which the management screen reports.
 *
 * **The slug space spans this table and `document`**, so uniqueness across the
 * two is checked where writes happen rather than by a constraint.
 */
export const documentSeries = pgTable("document_series", {
  id: primaryId(),
  slug: text().notNull().unique(),
  currentId: uuid().notNull().references(() => document.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

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
