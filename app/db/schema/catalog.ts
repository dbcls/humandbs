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
 * **What the data brings in is editable; what is settled is not.** The
 * vocabularies the portal's own structure fixes, and ICD10 — the classification
 * put in whole, whose headings are the standard's to word — are read here and
 * written by nothing an administrator presses (`admin/catalog.ts` の
 * `SETTLED_VOCABULARIES`).
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
 * facets, so a missing `labelJa` is not a defect and the publish check does not
 * list it as untranslated.
 *
 * Renaming changes the label only. Data references the id, so nothing has to be
 * rewritten and no reference can break.
 *
 * **`maker` is the part of the label that identifies who made the thing**, where the
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
  position: integer().notNull().default(0),
}, (t) => [
  unique("vocabulary_term_code_unique").on(t.setId, t.code),
  index().on(t.parentId),
])

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
  "disease",
])

/**
 * The catalog of keys a dataset or an experiment can have values under. It is
 * the identity of a key: the label is display only, so renaming never touches
 * stored data.
 *
 * **The type is what makes a key a facet.** Keys typed `vocabulary` or
 * `disease` are always a source of facets; a `number` key is one only once it
 * has been given a facet category; every other key is free text. That is why
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
   * to `canonicalUnit` on save, so conversion is defined in one place and everything
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
}, (t) => [
  index().on(t.scope, t.position),
])
