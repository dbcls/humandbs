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

import { primaryId } from "./common"

/**
 * A set of controlled terms. Flat unless `hierarchical` — only ICD10 needs a
 * tree, because selecting a 3-character code has to match the 4-character codes
 * under it.
 *
 * **Every set is editable; none is read-only.** Taking an external standard in
 * as a vocabulary would leave no way to correct either the standard's own
 * mistakes or a spelling it does not carry. ICD10 instead arrives as a
 * dictionary (`icd10Reference`) that seeds and checks the terms without ever
 * writing them.
 */
export const vocabularySet = pgTable("vocabulary_set", {
  id: primaryId(),
  code: text().notNull().unique(),
  labelJa: text().notNull(),
  labelEn: text().notNull(),
  hierarchical: boolean().notNull().default(false),
})

/**
 * A term. English is required, Japanese optional: whether a concept is written
 * in Japanese in Japanese articles varies within a single facet, not between
 * facets, so a missing `labelJa` is not a defect and the publish gate does not
 * list it as untranslated.
 *
 * Renaming changes the label only. Data references the id, so nothing has to be
 * rewritten and no reference can break.
 *
 * **`maker` is the part of the label that names who made the thing**, where the
 * value is a product — a sequencer, a kit. It is held apart because the same
 * maker heads dozens of labels and a reader picking a machine out of a column
 * is reading "whose" and "which" as two things; the label itself stays whole,
 * so searching, exporting and matching a facet value never have to know.
 *
 * **It is not the parent of the term.** Counting rolls values up to the root of
 * their tree (`app/search/counts.server.ts`), so a maker held as a parent would
 * put makers in the refinement panel where the models belong.
 */
export const vocabularyTerm = pgTable("vocabulary_term", {
  id: primaryId(),
  setId: uuid().notNull().references(() => vocabularySet.id, { onDelete: "cascade" }),
  code: text().notNull(),
  labelJa: text(),
  labelEn: text().notNull(),
  maker: text(),
  parentId: uuid().references((): AnyPgColumn => vocabularyTerm.id, { onDelete: "set null" }),
  /** Deactivated terms stay resolvable for data that already references them. */
  active: boolean().notNull().default(true),
  position: integer().notNull().default(0),
}, (t) => [
  unique("vocabulary_term_code_unique").on(t.setId, t.code),
  index().on(t.parentId),
  /** The picker searches by code and by either label. */
  index().on(t.setId, t.active),
])

/**
 * The ICD10 classification itself, held as a dictionary rather than as a
 * vocabulary. **It is never read by the public side.** Its three uses are all
 * on the editing side: seeding the labels of a new term, telling a code that
 * does not exist apart from one that no published data carries, and finding a
 * code by name in `/admin/catalog`.
 *
 * Keeping it out of `vocabularyTerm` is what lets every term be editable. An
 * import replaces this table wholesale and touches nothing else, so a label a
 * curator corrected cannot disappear at the next import.
 *
 * English comes from WHO's ICD-10 2019 meta files and Japanese from the
 * Japanese statistical classification, which follows the 2013 version — the two
 * do not cover exactly the same codes, and a row with only one of them is
 * expected rather than broken.
 */
export const icd10Reference = pgTable("icd10_reference", {
  /** The code without its point, as terms and the address write it. */
  code: text().primaryKey(),
  titleEn: text(),
  titleJa: text(),
})

/**
 * Display grouping for facets. Which group a facet sits in is an admin choice.
 *
 * **A group may have no label**, and then it is drawn without a heading. What
 * the panel opens with is what the row itself is, and a heading over that would
 * name the thing the reader came to the page already looking at. The label is
 * both languages or neither: a group headed in one language and silent in the
 * other would change shape when the reader switches.
 */
export const facetCategory = pgTable("facet_category", {
  id: primaryId(),
  code: text().notNull().unique(),
  labelJa: text(),
  labelEn: text(),
  position: integer().notNull().default(0),
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
  /**
   * Which heading the facet sits under in the refinement panel. Its order
   * inside that heading is `position`, the same order the value has on the
   * editing form and on the public page: one ordering of the keys, moved by one
   * control.
   */
  facetCategoryId: uuid().references(() => facetCategory.id, { onDelete: "set null" }),
  /**
   * Structured slots are facets by default and not shown on the public page.
   * Keeping this in the catalog means the decision can be revisited without a
   * migration.
   */
  showOnPublicPage: boolean().notNull().default(false),
}, (t) => [
  index().on(t.scope, t.position),
])
