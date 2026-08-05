import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

import { createdAt, primaryId, updatedAt } from "./common"

export const vocabularySource = pgEnum("vocabulary_source", ["portal", "external"])

/**
 * A set of controlled terms. Flat unless `hierarchical` — only ICD10 needs a
 * tree, because selecting a 3-character code has to match the 4-character codes
 * under it.
 *
 * `source` decides who may edit the terms in it. Terms from an external
 * standard are read-only and replaced wholesale on re-import; without recording
 * where a term came from, a hand correction would vanish silently at the next
 * import.
 */
export const vocabularySet = pgTable("vocabulary_set", {
  id: primaryId(),
  code: text().notNull().unique(),
  labelJa: text().notNull(),
  labelEn: text().notNull(),
  source: vocabularySource().notNull(),
  hierarchical: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * A term. English is required, Japanese optional: whether a concept is written
 * in Japanese in Japanese articles varies within a single facet, not between
 * facets, so a missing `labelJa` is not a defect and the publish gate does not
 * list it as untranslated.
 *
 * Renaming changes the label only. Data references the id, so nothing has to be
 * rewritten and no reference can break.
 */
export const vocabularyTerm = pgTable("vocabulary_term", {
  id: primaryId(),
  setId: uuid().notNull().references(() => vocabularySet.id, { onDelete: "cascade" }),
  code: text().notNull(),
  labelJa: text(),
  labelEn: text().notNull(),
  parentId: uuid().references((): AnyPgColumn => vocabularyTerm.id, { onDelete: "set null" }),
  source: vocabularySource().notNull(),
  /** Deactivated terms stay resolvable for data that already references them. */
  active: boolean().notNull().default(true),
  position: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  unique("vocabulary_term_code_unique").on(t.setId, t.code),
  index().on(t.parentId),
])

/** Display grouping for facets. Which group a facet sits in is an admin choice. */
export const facetCategory = pgTable("facet_category", {
  id: primaryId(),
  code: text().notNull().unique(),
  labelJa: text().notNull(),
  labelEn: text().notNull(),
  position: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const contentKeyScope = pgEnum("content_key_scope", ["dataset", "experiment"])

export const contentValueType = pgEnum("content_value_type", [
  "text",
  "single",
  "accession",
  "vocabulary",
  "number",
])

/**
 * The catalog of keys a dataset or an experiment can carry values under. It is
 * the identity of a key: the label is display only, so renaming never touches
 * stored data.
 *
 * **The type is what makes a key a facet.** Keys typed `vocabulary` or `number`
 * are the source of the facets; every other key is free text. That is why
 * changing a key's type is a development operation while adding, renaming and
 * reordering free-text keys is an admin one — the line is drawn where a change
 * would need an aggregation and an input control, not at whether a key exists.
 *
 * Merging two keys is never decided on value equality alone: co-occurrence
 * inside one experiment has to be checked, or two keys that legitimately live
 * side by side get collapsed.
 */
export const contentKey = pgTable("content_key", {
  id: primaryId(),
  code: text().notNull().unique(),
  scope: contentKeyScope().notNull(),
  valueType: contentValueType().notNull(),
  labelJa: text().notNull(),
  labelEn: text().notNull(),
  /**
   * Display order. It cannot be recovered from the data — across different key
   * sets, pairs of keys appear in both orders — so the catalog decides it.
   */
  position: integer().notNull().default(0),
  /** Set for `vocabulary` keys. */
  vocabularySetId: uuid().references(() => vocabularySet.id),
  /** Whether a `vocabulary` key takes more than one term. */
  multiple: boolean().notNull().default(false),
  /**
   * Set for `number` keys. Input offers `inputUnits` and the value is converted
   * to `canonicalUnit` on save, so conversion lives in one place and everything
   * downstream — the public page, the facet, the API — sees converted values
   * only. The unit chosen at input is kept alongside, because a conversion that
   * later turns out to be wrong cannot be redone without it.
   */
  canonicalUnit: text(),
  inputUnits: text().array(),
  facetCategoryId: uuid().references(() => facetCategory.id, { onDelete: "set null" }),
  facetPosition: integer().notNull().default(0),
  /**
   * Structured slots are facets by default and not shown on the public page.
   * Keeping this in the catalog means the decision can be revisited without a
   * migration.
   */
  showOnPublicPage: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index().on(t.scope, t.position),
])
