import { date, index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

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
 * **Only values that appear on a public page are cached.** The application
 * system holds names, addresses, telephone numbers and the head of institution;
 * none of that is brought over. The one exception is the key a row is matched to
 * upstream by, which is stored but never projected (docs/data-model.md の
 * 「外部キャッシュ」).
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
 * upstream has, curators cannot edit them, and so they carry no translation
 * state and never appear in the publish gate's untranslated list. It attaches
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
  /** Upstream holds this in English only; the Japanese page shows the same value. */
  country: text().notNull().default(""),
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
 * check its own pins against, and to answer the endpoint that supplies the
 * relation to DDBJ Search.
 *
 * It is never used to block a publication. Upstream has typos and disagreements
 * of its own, and a portal that cannot publish while upstream is wrong is worse
 * than one that publishes and lists the discrepancy.
 */
export const humAccession = pgTable("hum_accession", {
  accession: text().primaryKey(),
  humLabel: text().notNull(),
  kind: accessionKind().notNull(),
}, (t) => [
  index().on(t.humLabel),
])

/**
 * Dates for accessions registered in an external archive, taken from upstream
 * as they are. The portal does not correct them even where they are visibly
 * skewed: a correction here would leave a second layer of guessing behind once
 * the upstream is fixed.
 *
 * Two upstreams share the table — the application system answers for JGA, DDBJ
 * Search for everything else — so `source` says which of them owns a row, and a
 * refresh replaces only its own rows.
 */
export const accessionDate = pgTable("accession_date", {
  accession: text().primaryKey(),
  datePublished: date(),
  dateModified: date(),
  source: text().notNull(),
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
 * The row is also the lock. A refresh claims its source with `FOR UPDATE SKIP
 * LOCKED`, so several application processes can run the same loop without two
 * of them querying the upstream at once.
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
