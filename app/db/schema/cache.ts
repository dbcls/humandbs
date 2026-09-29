import { bigint, date, index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

import type { ApplicationType } from "~/admin/listing"

import { UPSTREAM_SOURCES } from "~/upstream/sources"

import { primaryId } from "./common"

/**
 * Everything in this file is a cache of a value owned somewhere else.
 *
 * The rules are the same for all of them. A batch writes them and every reader
 * reads only the cache, so the portal keeps serving when the upstream system is
 * down. A failed fetch leaves the previous value in place — a system that is
 * temporarily silent cannot be told apart from one that deleted a value, and
 * falling to the deleting side would blank published pages. Nothing here is
 * backed up: it can all be fetched again.
 *
 * **What a public page reads holds only values that appear on a public page.**
 * The one exception is the key a row is matched to upstream by, which is stored
 * but never projected. The two tables the seeding screens read (`dsBranch`,
 * `jgadRegistration`) hold what those screens import into a draft, published or
 * not, and nothing more: the application system also holds addresses,
 * telephone numbers, collaborators and the head of institution, and none of
 * that is brought over.
 */

/**
 * Who has used the data of a research, one row per usage project. Not per
 * person: the upstream system has no person master, so identifying "the same
 * researcher" across projects would be guesswork.
 *
 * Only the principal investigator appears. Whether to widen that is a policy
 * decision, not an implementation one.
 *
 * This is not content: the values come from upstream in whatever languages
 * upstream has, curators cannot edit them, and so they have no translation
 * state and never appear in the publish check's untranslated list. It attaches
 * to the hum label rather than the research identity because the label is all
 * the upstream system knows.
 *
 * `applicationId` is the usage project upstream, and the only column here that
 * no page and no API response shows. It is what makes a row identifiable across
 * refreshes; publishing it would turn upstream's case numbering into an outside
 * reference that could not be withdrawn again.
 */
export const cauEntry = pgTable("cau_entry", {
  id: primaryId(),
  humLabel: text().notNull(),
  applicationId: text().notNull(),
  piNameJa: text().notNull().default(""),
  piNameEn: text().notNull().default(""),
  affiliationJa: text().notNull().default(""),
  affiliationEn: text().notNull().default(""),
  /**
   * Named by the portal's own table, not by upstream, which holds only the
   * applicant's English spelling (`app/upstream/country.ts`). A spelling the
   * table does not know is stored as written, in both columns.
   */
  countryJa: text().notNull().default(""),
  countryEn: text().notNull().default(""),
  researchTitleJa: text().notNull().default(""),
  researchTitleEn: text().notNull().default(""),
  periodStart: date(),
  periodEnd: date(),
  datasetAccessions: text().array().notNull(),
}, (t) => [
  unique("cau_entry_unique").on(t.humLabel, t.applicationId),
  index().on(t.humLabel),
])

export const accessionKind = pgEnum("accession_kind", ["jga-study", "jga-dataset"])

/**
 * The upstream mapping between a hum label and a JGA accession. The application
 * system is the authority for this correspondence; the portal caches it to
 * check its own pins against, and to serve the endpoint that supplies the
 * relation to DDBJ Search.
 *
 * It is never used to block a publication. Upstream has typos and disagreements
 * of its own, and a portal that cannot publish while upstream is wrong is worse
 * than one that publishes and lists the discrepancy.
 *
 * **The row keeps the edge upstream draws, not the one merged onto hum.** A hum
 * holding several studies is the ordinary case, so which study a dataset sits
 * under cannot be recovered from the correspondence above — it is kept here
 * instead, and the dataset page and the supply endpoint both read it.
 */
export const humAccession = pgTable("hum_accession", {
  accession: text().primaryKey(),
  humLabel: text().notNull(),
  kind: accessionKind().notNull(),
  /**
   * The study a JGA dataset sits under. Null on a study's own row, and on a
   * dataset that upstream's current entry draws no path to a study for.
   */
  study: text(),
}, (t) => [
  index().on(t.humLabel),
])

/**
 * Dates for accessions registered in an external archive, taken from upstream
 * as they are. The portal does not correct them even where they are visibly
 * skewed: a correction here would leave a second layer of guessing behind once
 * the upstream is fixed.
 *
 * Two upstreams share the table — the application system is responsible for JGA, DDBJ
 * Search for everything else — so `source` reports which of them owns a row, and a
 * refresh replaces only its own rows.
 */
export const accessionDate = pgTable("accession_date", {
  accession: text().primaryKey(),
  datePublished: date(),
  dateModified: date(),
  source: text().notNull(),
})

/**
 * How much data an external archive's dataset holds and in what formats, read
 * off the files the archive distributes for it: JGA's encrypted files, DRA's
 * fastq, GEA's zips as they are, MetaboBank's data files. The size is what a
 * reader downloads. The file names are not kept — only their sum and the
 * formats read from them (`files/formats.ts`).
 *
 * Two upstreams share the table — the application system for JGA, the DDBJ
 * public file server for the rest — so a refresh replaces only the rows of its
 * `source`. A dataset the archive has no files for has no row, and its page
 * shows neither value rather than a size of zero.
 */
export const accessionFileSummary = pgTable("accession_file_summary", {
  accession: text().primaryKey(),
  byteCount: bigint({ mode: "number" }).notNull(),
  /** Codes of the `file-type` terms, in the order the formats are listed. */
  formats: text().array().notNull(),
  source: text().notNull(),
})

/**
 * The approved branches of the data-submission applications (`J-DS000136-010`),
 * with what a draft seeded from one takes from its form.
 *
 * **The seeding screens read this instead of the application system**, so that
 * a curator can start a draft while that system is down. What that costs is
 * time: a branch approved since the last fetch appears after the next one. The
 * values are the form as written, before a curator has looked at them — the
 * same values a draft holds once they are imported.
 */
export const dsBranch = pgTable("ds_branch", {
  applicationId: text().primaryKey(),
  humLabel: text(),
  applicationType: text().$type<ApplicationType>().notNull(),
  /** The day in JST the branch was last approved. */
  approvedOn: date(),
  titleJa: text().notNull().default(""),
  titleEn: text().notNull().default(""),
  piNameJa: text().notNull().default(""),
  piNameEn: text().notNull().default(""),
  aimsJa: text().notNull().default(""),
  aimsEn: text().notNull().default(""),
  methodsJa: text().notNull().default(""),
  methodsEn: text().notNull().default(""),
  targetsJa: text().notNull().default(""),
  targetsEn: text().notNull().default(""),
  affiliationJa: text().notNull().default(""),
  affiliationEn: text().notNull().default(""),
  /** As the applicant wrote it in English. */
  country: text().notNull().default(""),
  /** 1 unrestricted, 2 controlled type I, 3 both, 4 controlled type II. */
  dataAccess: integer(),
  /** As typed: codes separated by commas, ideographic commas or spaces. */
  icd10: text().notNull().default(""),
  /** The studies and datasets registered under the branch. */
  accessions: text().array().notNull(),
})

/**
 * What JGA holds about each registered dataset, read from the submitted XML:
 * the only place a dataset's title and type exist before it is published, and a
 * draft is written for one that has not been.
 */
export const jgadRegistration = pgTable("jgad_registration", {
  accession: text().primaryKey(),
  title: text().notNull().default(""),
  /** The EGA-controlled assay of the dataset, empty where none is stated. */
  datasetType: text().notNull().default(""),
})

export const upstreamSource = pgEnum("upstream_source", UPSTREAM_SOURCES)

/**
 * How each upstream fetch last went. One row per source, written by the refresh
 * itself.
 *
 * The cache tables cannot answer this on their own. A source that has been
 * failing for a week looks exactly like one that succeeded this morning,
 * because a failed fetch deliberately leaves the previous rows untouched — so
 * without this table a stalled refresh is invisible until somebody notices a
 * value that should have changed.
 *
 * The row is also the lock. A refresh claims its source by moving
 * `attemptedAt` in a single statement (`claimDueSources`), so several
 * application processes can run the same loop without two of them querying the
 * upstream at once.
 */
export const upstreamRefresh = pgTable("upstream_refresh", {
  source: upstreamSource().primaryKey(),
  attemptedAt: timestamp({ withTimezone: true }).notNull(),
  succeededAt: timestamp({ withTimezone: true }),
  /** How many rows the last successful fetch wrote. */
  rowCount: integer(),
  /** Why the last attempt failed, or null when it succeeded. */
  failure: text(),
})
