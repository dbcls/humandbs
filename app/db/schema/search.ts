import { sql } from "drizzle-orm"
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import type { DatasetContent, ResearchContent } from "~/content/types"

import { contentKey, vocabularyTerm } from "./catalog"
import { primaryId } from "./common"
import { research } from "./research"

export const searchTargetType = pgEnum("search_target_type", [
  "research",
  "research-version",
  "dataset",
])

/**
 * One row per publicly visible object. **These rows are the definition of what
 * is published**: the public pages, the JSON API and the public search all take
 * their set of objects from here and nowhere else.
 *
 * Derived from the published content, rebuilt inside the same transaction as
 * the publish operation — so there is no such thing as a change that has not
 * propagated yet. Withdrawal, deletion and orphaning have no code of their own
 * either; all three are what happens when the published set is rebuilt.
 *
 * Rebuilding everything is a normal operation, not a recovery step. The corpus
 * is a few thousand rows.
 */
export const searchDoc = pgTable("search_doc", {
  id: primaryId(),
  targetType: searchTargetType().notNull(),
  targetId: uuid().notNull(),
  researchId: uuid().notNull().references(() => research.id, { onDelete: "cascade" }),
  /** Denormalised for the URL and for display; the ledger remains the source. */
  humLabel: text().notNull(),
  versionNumber: integer(),
  datasetLabel: text(),
  datePublished: date(),
  dateModified: date(),
  /**
   * What this row stands for: the body for a research or a version, the
   * description for a dataset. Which of the two shapes it holds follows
   * `targetType`.
   *
   * **Every read of published content comes from here.** A version keeps its
   * whole content — body and every description — in one JSONB, and a compressed
   * JSONB cannot be read in part, so reaching into it for a single dataset
   * expands the version whole (measured at 224 ms against 0.047 ms here).
   * Writing each subject its own row is what keeps a listing of twenty datasets
   * from being twenty version-sized expansions.
   *
   * **It is the content, not the public representation.** The projection drops
   * what the catalog hides, and an administrator asking whether a key is still
   * in use is asking about what was published rather than about what a reader
   * sees. Projecting is left to whoever is drawing a page.
   */
  content: jsonb().$type<ResearchContent | DatasetContent>().notNull(),
  /**
   * The title of the research the row belongs to, both languages, so a query
   * can be scoped to it. Not indexed: the column is short, the corpus is a few
   * thousand rows, and the match operator works without one.
   */
  title: text().notNull(),
  textJa: text().notNull(),
  textEn: text().notNull(),
  /**
   * The column the full-text index is built on. Generated rather than written,
   * so the two languages cannot drift apart from what is indexed.
   */
  textAll: text().generatedAlwaysAs(sql`text_ja || ' ' || text_en`),
}, (t) => [
  unique("search_doc_target_unique").on(t.targetType, t.targetId),
  index().on(t.researchId),
  index().on(t.targetType, t.datePublished),
  /**
   * N-gram rather than a morphological analyser. A morphological tokenizer
   * splits `JGAD000123` and `糖尿病`, which loses both substring matches across
   * a word boundary and matches inside an ASCII token — exactly the two things
   * accessions and product names need. The default bigram would do for Japanese
   * but breaks ASCII on whitespace, hence the explicit unify_* arguments.
   */
  index("search_doc_full_text_index")
    .using("pgroonga", t.textAll.op("pgroonga_text_full_text_search_ops_v2"))
    .with({
      tokenizer: "'TokenNgram(\"unify_alphabet\", false, \"unify_symbol\", false, \"unify_digit\", false)'",
      normalizers: "'NormalizerNFKC150'",
    }),
])

/**
 * A term facet value. Ancestors are carried on the row so that selecting a
 * 3-character ICD10 code also matches the 4-character codes beneath it without
 * a recursive query. They are derived, and a full rebuild is how they stay
 * correct after the tree is edited.
 *
 * Display labels are not baked in here: the catalog is joined at query time, so
 * renaming a term does not require rewriting the search rows.
 */
export const searchFacetTerm = pgTable("search_facet_term", {
  id: primaryId(),
  docId: uuid().notNull().references(() => searchDoc.id, { onDelete: "cascade" }),
  keyId: uuid().notNull().references(() => contentKey.id, { onDelete: "cascade" }),
  termId: uuid().notNull().references(() => vocabularyTerm.id, { onDelete: "cascade" }),
  ancestorIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
}, (t) => [
  unique("search_facet_term_unique").on(t.docId, t.keyId, t.termId),
  index().on(t.keyId, t.termId),
  index().using("gin", t.ancestorIds),
])

/**
 * A numeric facet value, already converted to the key's canonical unit. One row
 * per value rather than a min and a max column: a dataset with several
 * experiments legitimately has several values, and keeping them all means the
 * query decides how to collapse them instead of the schema.
 */
export const searchFacetNumber = pgTable("search_facet_number", {
  id: primaryId(),
  docId: uuid().notNull().references(() => searchDoc.id, { onDelete: "cascade" }),
  keyId: uuid().notNull().references(() => contentKey.id, { onDelete: "cascade" }),
  value: numeric({ mode: "number" }).notNull(),
}, (t) => [
  index().on(t.keyId, t.value),
  index().on(t.docId),
])
